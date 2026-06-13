from lib.supabase_client import supabase
from utils.calculations import calculate_pillar_rating, calculate_overall_potentiality
from datetime import datetime, timezone


# -- Notification helpers 

def send_pa_notification(recipient_id: str, notif_type: str, title: str, message: str, assessment_id: str = None):
    # try/except: a notification failure must never block the main assessment workflow
    try:
        if not recipient_id:
            print(f'[NOTIFICATION SKIPPED] recipient_id is empty for type={notif_type}')
            return
        payload = {
            'recipient_id': recipient_id,
            'type': notif_type,
            'title': title,
            'message': message,
            'is_read': False,
        }
        if assessment_id:
            payload['assessment_id'] = assessment_id
        supabase.table('potential_assessment_notifications').insert(payload).execute()
    except Exception as e:
        print(f'[NOTIFICATION ERROR] type={notif_type} recipient={recipient_id}: {e}')


def log_assessment_action(assessment_id: str, actor_id: str, actor_role: str, action: str, cycle: str):
    # try/except: audit log failure is non-fatal — assessment data is already committed by this point
    try:
        supabase.table('potential_assessment_audit_log').insert({
            'assessment_id': assessment_id,
            'actor_id': actor_id,
            'actor_role': actor_role,
            'action': action,
            'cycle': cycle,
        }).execute()
    except Exception:
        pass  # intentionally ignored — audit log failure is non-fatal, assessment data already committed


# -- Data access helpers 

def strip_supervisor_columns(items: list, status: str) -> list:
    # Reveal supervisor fields once the supervisor has submitted (completed or any post-review status)
    if status in ('completed', 'reconsideration_requested', 'reconsideration_rejected'):
        return items
    return [{k: v for k, v in item.items() if k not in ('supervisor_rating', 'supervisor_justification')} for item in items]


def get_notifications(user_id: str) -> list:
    # desc=True: latest notification appears first so the UI needs no client-side sort
    resp = supabase.table('potential_assessment_notifications').select('*').eq('recipient_id', user_id).order('created_at', desc=True).execute()
    return resp.data or []


def mark_notification_read(notification_id: str) -> dict | None:
    resp = supabase.table('potential_assessment_notifications').update({'is_read': True}).eq('id', notification_id).execute()
    return resp.data[0] if resp.data else None


def get_active_cycle() -> dict | None:
    # limit(1): only one cycle should be active; prevents returning multiple rows on data-integrity issues
    resp = supabase.table('pms_cycles').select('*').eq('is_active', True).limit(1).execute()
    return resp.data[0] if resp.data else None


def get_assessment(employee_id: str, cycle: str, requester_id: str = '') -> dict:
    assessment_resp = supabase.table('potential_assessments').select('*').eq('employee_id', employee_id).eq('appraisal_cycle', cycle).limit(1).execute()
    # Return a consistent dict shape even when no DB record exists yet (form not started)
    if not assessment_resp.data:
        return {'status': 'not_started'}
    assessment = assessment_resp.data[0]
    items_resp = supabase.table('potential_assessment_items').select('*').eq('assessment_id', assessment['id']).execute()
    items = strip_supervisor_columns(items_resp.data, assessment['status'])
    return {**assessment, 'items': items}


# -- Senior supervisor resolution (uses org hierarchy columns, no supervisor_id FK)

def resolve_senior_supervisor_id(direct_supervisor_id: str):
    """
    Returns (senior_supervisor_id, error_message).
    Walks one level up the org hierarchy from the direct supervisor using
    role + location columns (department_id / iata_branch_code / country_id).
    When the direct supervisor is hq_admin (top of hierarchy) they handle
    the reconsideration themselves.
    """
    sup = supabase.table('users').select(
        'role, department_id, iata_branch_code, country_id'
    ).eq('id', direct_supervisor_id).limit(1).execute()
    if not sup.data:
        return None, 'Direct supervisor not found.'

    s = sup.data[0]
    role = s.get('role')

    if role == 'sub_dept_admin':
        dept_id = s.get('department_id')
        if not dept_id:
            return None, 'No senior supervisor found to handle this reconsideration.'
        row = supabase.table('users').select('id').eq('role', 'dept_admin').eq('department_id', dept_id).limit(1).execute()

    elif role == 'dept_admin':
        branch = s.get('iata_branch_code')
        if not branch:
            return None, 'No senior supervisor found to handle this reconsideration.'
        row = supabase.table('users').select('id').eq('role', 'branch_admin').eq('iata_branch_code', branch).limit(1).execute()

    elif role == 'branch_admin':
        country_id = s.get('country_id')
        if not country_id:
            return None, 'No senior supervisor found to handle this reconsideration.'
        row = supabase.table('users').select('id').eq('role', 'country_admin').eq('country_id', country_id).limit(1).execute()

    elif role == 'country_admin':
        row = supabase.table('users').select('id').eq('role', 'hq_admin').limit(1).execute()

    elif role == 'hq_admin':
        # Top of hierarchy — hq_admin handles the reconsideration themselves
        return direct_supervisor_id, None

    else:
        return None, 'No senior supervisor found to handle this reconsideration.'

    if not row.data:
        return None, 'No senior supervisor found to handle this reconsideration.'
    return row.data[0]['id'], None


# -- Business logic

def get_subordinates(supervisor_id: str, supervisor_role: str, cycle: str) -> list:
    # Each branch follows the org hierarchy: hq_admin→country_admin→branch_admin→dept_admin→sub_dept_admin→employee
    subordinates = []

    if supervisor_role == 'hq_admin':
        raw = supabase.table('users').select('id, full_name, email, emp_id, country_id, role').eq('role', 'country_admin').execute().data or []
        country_ids = list({u['country_id'] for u in raw if u.get('country_id')})
        country_name_map = {}
        if country_ids:
            c_resp = supabase.table('countries').select('id, name').in_('id', country_ids).execute()
            country_name_map = {c['id']: c['name'] for c in (c_resp.data or [])}
        for u in raw:
            u['country_name'] = country_name_map.get(u.get('country_id'), '—')
        subordinates = raw

    elif supervisor_role == 'country_admin':
        sup = supabase.table('users').select('country_id').eq('id', supervisor_id).single().execute().data
        if sup and sup.get('country_id'):
            subordinates = supabase.table('users').select('id, full_name, email, emp_id, iata_branch_code, country_id, role').eq('role', 'branch_admin').eq('country_id', sup['country_id']).execute().data or []

    elif supervisor_role == 'branch_admin':
        sup = supabase.table('users').select('iata_branch_code').eq('id', supervisor_id).single().execute().data
        if sup and sup.get('iata_branch_code'):
            subordinates = supabase.table('users').select('id, full_name, email, emp_id, iata_branch_code, department_id, role').eq('role', 'dept_admin').eq('iata_branch_code', sup['iata_branch_code']).execute().data or []

    elif supervisor_role == 'dept_admin':
        sup = supabase.table('users').select('department_id').eq('id', supervisor_id).single().execute().data
        if sup and sup.get('department_id'):
            subordinates = supabase.table('users').select('id, full_name, email, emp_id, department_id, sub_department_id, role').eq('role', 'sub_dept_admin').eq('department_id', sup['department_id']).execute().data or []

    elif supervisor_role == 'sub_dept_admin':
        sup = supabase.table('users').select('sub_department_id').eq('id', supervisor_id).single().execute().data
        if sup and sup.get('sub_department_id'):
            subordinates = supabase.table('users').select('id, full_name, email, emp_id, sub_department_id, role').eq('role', 'employee').eq('sub_department_id', sup['sub_department_id']).execute().data or []

    if not subordinates:
        return []

    sub_ids = [s['id'] for s in subordinates]
    # Single IN query for all subordinates avoids N+1 DB calls when a supervisor has many reports
    assessments_resp = supabase.table('potential_assessments').select('id, employee_id, status, talent_block, overall_ability, overall_aspiration, overall_leadership').in_('employee_id', sub_ids).eq('appraisal_cycle', cycle).execute()
    assessment_map = {a['employee_id']: a for a in (assessments_resp.data or [])}

    return [{
        **sub,
        'assessment_status': assessment_map[sub['id']]['status'] if sub['id'] in assessment_map else 'not_started',
        'assessment_id': assessment_map[sub['id']]['id'] if sub['id'] in assessment_map else None,
        'talent_block': assessment_map[sub['id']].get('talent_block') if sub['id'] in assessment_map else None,
    } for sub in subordinates]


def self_submit(data: dict) -> dict:
    # Advances status: pending_self → pending_supervisor; notifies supervisor on success
    employee_id, cycle = data['employee_id'], data['cycle']

    existing = supabase.table('potential_assessments').select('id, status').eq('employee_id', employee_id).eq('appraisal_cycle', cycle).limit(1).execute()
    if existing.data:
        if existing.data[0]['status'] != 'pending_self':
            raise PermissionError('Self-assessment has already been submitted and is locked.')
        assessment_id = existing.data[0]['id']
    else:
        new = supabase.table('potential_assessments').insert({
            'employee_id': employee_id,
            'supervisor_id': data['supervisor_id'],
            'appraisee_role': data['appraisee_role'],
            'appraisal_cycle': cycle,
            'status': 'pending_self',
        }).execute()
        assessment_id = new.data[0]['id']

    now_iso = datetime.now(timezone.utc).isoformat()
    for item in data['items']:
        # upsert: idempotent write so a browser-close mid-form doesn't create duplicate rows
        supabase.table('potential_assessment_items').upsert({
            'assessment_id': assessment_id,
            'pillar': item['pillar'],
            'component_number': item['component_number'],
            'self_rating': item.get('self_rating'),
            'self_example': item.get('self_example'),
        }, on_conflict='assessment_id,pillar,component_number').execute()

    updated = supabase.table('potential_assessments').update({'status': 'pending_supervisor', 'self_submitted_at': now_iso}).eq('id', assessment_id).execute()
    log_assessment_action(assessment_id, employee_id, data['appraisee_role'], 'self_submit', cycle)

    try:
        emp_resp = supabase.table('users').select('full_name').eq('id', employee_id).single().execute()
        emp_name = emp_resp.data.get('full_name', 'An employee') if emp_resp.data else 'An employee'
    except Exception:
        emp_name = 'An employee'

    send_pa_notification(
        recipient_id=data['supervisor_id'],
        notif_type='self_submitted',
        title=f'{emp_name} submitted their Potential Self-Assessment',
        message=f'{emp_name} has completed and submitted their self-assessment for the "{cycle}" appraisal cycle. Please log in to review and provide your supervisor ratings.',
    )
    return updated.data[0]


def supervisor_submit(data: dict) -> dict:
    # Validates ownership, writes ratings, calculates pillar + talent_block, sets status to 'completed'
    assessment_id = data['assessment_id']
    assessment_resp = supabase.table('potential_assessments').select('*').eq('id', assessment_id).single().execute()
    if not assessment_resp.data:
        raise LookupError('Assessment not found')

    assessment = assessment_resp.data
    if assessment['status'] != 'pending_supervisor':
        raise ValueError(f"Cannot submit: status is '{assessment['status']}', expected 'pending_supervisor'.")
    if assessment['supervisor_id'] != data['supervisor_id']:
        raise PermissionError('Unauthorised: caller is not the assigned supervisor')

    for item in data['items']:
        supabase.table('potential_assessment_items').update({
            'supervisor_rating': item.get('supervisor_rating'),
            'supervisor_justification': item.get('supervisor_justification'),
        }).eq('id', item['id']).execute()

    # Re-fetch all items from DB to ensure the pillar calculation uses the just-written values
    all_items = supabase.table('potential_assessment_items').select('pillar, supervisor_rating').eq('assessment_id', assessment_id).execute().data or []
    pillar_ratings: dict = {'ability': [], 'aspiration': [], 'leadership': []}
    for itm in all_items:
        if itm.get('pillar') in pillar_ratings and itm.get('supervisor_rating'):
            pillar_ratings[itm['pillar']].append(itm['supervisor_rating'])

    # calculate_pillar_rating → majority rule per pillar (see calculations.py)
    overall_ability    = calculate_pillar_rating(pillar_ratings['ability'])
    overall_aspiration = calculate_pillar_rating(pillar_ratings['aspiration'])
    overall_leadership = calculate_pillar_rating(pillar_ratings['leadership'])
    # calculate_overall_potentiality → spec matrix rule (l==0 and h==0 veto conditions)
    talent_block       = calculate_overall_potentiality(overall_ability, overall_aspiration, overall_leadership)

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = supabase.table('potential_assessments').update({
        'status': 'completed',
        'supervisor_submitted_at': now_iso,
        'overall_ability': overall_ability,
        'overall_aspiration': overall_aspiration,
        'overall_leadership': overall_leadership,
        'talent_block': talent_block,
    }).eq('id', assessment_id).execute()

    log_assessment_action(assessment_id, data['supervisor_id'], data.get('supervisor_role', 'unknown'), 'supervisor_submit', assessment['appraisal_cycle'])

    try:
        sup_resp = supabase.table('users').select('full_name').eq('id', data['supervisor_id']).single().execute()
        sup_name = sup_resp.data.get('full_name', 'Your supervisor') if sup_resp.data else 'Your supervisor'
    except Exception:
        sup_name = 'Your supervisor'

    send_pa_notification(
        recipient_id=assessment['employee_id'],
        notif_type='supervisor_completed',
        title='Your Potential Assessment has been reviewed',
        message=f'{sup_name} has completed the supervisor review of your self-assessment for the "{assessment["appraisal_cycle"]}" appraisal cycle. Your Talent Block and overall potential ratings are now available.',
    )
    return updated.data[0]
