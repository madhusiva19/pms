from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import services.assessment_service as assessment_service
from lib.supabase_client import supabase

potential_assessment_bp = Blueprint('potential_assessment', __name__)

_AC_PILLARS = ['ability', 'aspiration', 'leadership']
_AC_ROLES   = ['country_admin', 'branch_admin', 'dept_admin', 'sub_dept_admin', 'employee']


# ── Notifications 

@potential_assessment_bp.route('/api/potential-assessment-notifications/<user_id>', methods=['GET'])
def get_pa_notifications(user_id: str):
    try:
        return jsonify({'success': True, 'data': assessment_service.get_notifications(user_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment-notifications/<notification_id>/read', methods=['PATCH'])
def mark_pa_notification_read(notification_id: str):
    try:
        data = assessment_service.mark_notification_read(notification_id)
        if not data:
            return jsonify({'success': False, 'error': 'Notification not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Appraisal Cycle
@potential_assessment_bp.route('/api/appraisal-cycles/active', methods=['GET'])
def get_active_appraisal_cycle():
    try:
        data = assessment_service.get_active_cycle()
        if not data:
            return jsonify({'success': False, 'error': 'No active appraisal cycle found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Assessment 

@potential_assessment_bp.route('/api/potential-assessment/<employee_id>/<cycle>', methods=['GET'])
def get_potential_assessment(employee_id: str, cycle: str):
    try:
        data = assessment_service.get_assessment(employee_id, cycle, request.args.get('requester_id', ''))
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/subordinates/<supervisor_id>/<cycle>', methods=['GET'])
def get_subordinates_assessment_status(supervisor_id: str, cycle: str):
    try:
        data = assessment_service.get_subordinates(supervisor_id, request.args.get('supervisor_role', ''), cycle)
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/self-submit', methods=['POST'])
def self_submit_potential_assessment():
    try:
        body = request.json or {}
        required = ['employee_id', 'supervisor_id', 'appraisee_role', 'cycle', 'items']
        missing = [f for f in required if f not in body]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400
        if len(body['items']) != 9:
            return jsonify({'success': False, 'error': 'Exactly 9 items required (3 pillars × 3 components)'}), 400
        for item in body['items']:
            if item.get('self_rating') not in ('H', 'M', 'L'):
                return jsonify({'success': False, 'error': f"Invalid self_rating '{item.get('self_rating')}'. Must be H, M, or L."}), 400
            if item.get('pillar') not in set(_AC_PILLARS):
                return jsonify({'success': False, 'error': f"Invalid pillar '{item.get('pillar')}'."}), 400
            if item.get('component_number') not in (1, 2, 3):
                return jsonify({'success': False, 'error': f"Invalid component_number '{item.get('component_number')}'."}), 400
        if body['appraisee_role'] not in _AC_ROLES:
            return jsonify({'success': False, 'error': 'Invalid appraisee_role'}), 400
        data = assessment_service.self_submit(body)
        return jsonify({'success': True, 'data': data}), 200
    except PermissionError as e:
        return jsonify({'success': False, 'error': str(e)}), 409
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/supervisor-submit', methods=['POST'])
def supervisor_submit_potential_assessment():
    try:
        body = request.json or {}
        missing = [f for f in ['assessment_id', 'supervisor_id', 'items'] if f not in body]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400
        for item in body['items']:
            if item.get('supervisor_rating') not in ('H', 'M', 'L'):
                return jsonify({'success': False, 'error': f"Invalid supervisor_rating '{item.get('supervisor_rating')}'. Must be H, M, or L."}), 400
            if not str(item.get('supervisor_justification', '')).strip():
                return jsonify({'success': False, 'error': 'supervisor_justification is required for every item.'}), 400
        data = assessment_service.supervisor_submit(body)
        return jsonify({'success': True, 'data': data}), 200
    except (PermissionError, ValueError) as e:
        return jsonify({'success': False, 'error': str(e)}), 409
    except LookupError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Assessment Components 

@potential_assessment_bp.route('/api/assessment-components', methods=['GET', 'POST'])
def assessment_components_list():
    if request.method == 'GET':
        try:
            resp = supabase.table('assessment_components').select('*').order('pillar').order('component_number').execute()
            return jsonify({'success': True, 'data': resp.data}), 200
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        pillar           = data.get('pillar')
        component_number = data.get('component_number')
        description      = (data.get('description') or '').strip()
        scope            = data.get('scope', 'global')
        assigned_role    = data.get('assigned_role')
        if pillar not in _AC_PILLARS:
            return jsonify({'success': False, 'error': 'Invalid pillar'}), 400
        if component_number not in [1, 2, 3]:
            return jsonify({'success': False, 'error': 'component_number must be 1, 2 or 3'}), 400
        if not description:
            return jsonify({'success': False, 'error': 'Description is required'}), 400
        if scope not in ['global', 'role']:
            return jsonify({'success': False, 'error': 'scope must be global or role'}), 400
        if scope == 'role' and assigned_role not in _AC_ROLES:
            return jsonify({'success': False, 'error': 'Invalid assigned_role'}), 400
        resp = supabase.table('assessment_components').insert({
            'pillar': pillar, 'component_number': component_number, 'description': description,
            'scope': scope, 'assigned_role': assigned_role if scope == 'role' else None,
            'created_by': data.get('created_by'),
        }).execute()
        return jsonify({'success': True, 'data': resp.data[0]}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Reconsideration


@potential_assessment_bp.route('/api/potential-assessment/<assessment_id>/reconsideration', methods=['POST'])
def submit_reconsideration(assessment_id: str):
    try:
        body = request.json or {}

        assessment_resp = supabase.table('potential_assessments').select('*').eq('id', assessment_id).limit(1).execute()
        if not assessment_resp.data:
            return jsonify({'success': False, 'error': 'Assessment not found'}), 404
        assessment = assessment_resp.data[0]

        if assessment['status'] in ('reconsideration_requested', 'reconsideration_rejected'):
            return jsonify({'success': False, 'error': 'A reconsideration has already been submitted for this assessment.'}), 400

        if assessment['status'] not in ('supervisor_reviewed', 'completed'):
            return jsonify({'success': False, 'error': 'Reconsideration can only be requested after supervisor review is complete.'}), 400

        requesting_user_id = body.get('employee_id', '')
        if requesting_user_id != assessment['employee_id']:
            return jsonify({'success': False, 'error': 'Only the assessed employee may request reconsideration.'}), 403

        senior_supervisor_id, err = assessment_service.resolve_senior_supervisor_id(assessment['supervisor_id'])
        if err:
            return jsonify({'success': False, 'error': err}), 400

        now_iso = datetime.now(timezone.utc).isoformat()

        # Record in dedicated reconsideration table
        recon = supabase.table('potential_assessment_reconsiderations').insert({
            'assessment_id': assessment_id,
            'employee_id': assessment['employee_id'],
            'comment': body.get('reconsideration_comment'),
            'requested_at': now_iso,
        }).execute()

        # Update only the status on the main assessment
        supabase.table('potential_assessments').update({
            'status': 'reconsideration_requested',
        }).eq('id', assessment_id).execute()

        try:
            emp_resp = supabase.table('users').select('full_name').eq('id', assessment['employee_id']).single().execute()
            employee_name = emp_resp.data.get('full_name', 'An employee') if emp_resp.data else 'An employee'
        except Exception:
            employee_name = 'An employee'

        try:
            assessment_service.send_pa_notification(
                recipient_id=senior_supervisor_id,
                notif_type='reconsideration_request',
                title='Reconsideration Request Received',
                message=f"{employee_name} has requested a reconsideration of their potential assessment. Please review at your earliest convenience.",
            )
        except Exception as e:
            print(f'[PA NOTIFICATION ERROR] {e}')

        try:
            assessment_service.send_pa_notification(
                recipient_id=assessment['supervisor_id'],
                notif_type='reconsideration_fyi',
                title='Employee Has Requested Reconsideration',
                message=f"{employee_name} has escalated their assessment result for reconsideration by a senior reviewer.",
            )
        except Exception as e:
            print(f'[PA NOTIFICATION ERROR] {e}')

        assessment_service.log_assessment_action(
            assessment_id, assessment['employee_id'],
            assessment.get('appraisee_role', 'employee'),
            'reconsideration_requested',
            assessment.get('appraisal_cycle', ''),
        )

        return jsonify({'success': True, 'data': recon.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/<assessment_id>/reconsideration/review', methods=['PUT'])
def review_reconsideration(assessment_id: str):
    try:
        body = request.json or {}
        action = body.get('action', '')
        rejection_note = (body.get('rejection_note') or '').strip()
        reviewer_id = body.get('reviewer_id', '')

        assessment_resp = supabase.table('potential_assessments').select('*').eq('id', assessment_id).limit(1).execute()
        if not assessment_resp.data:
            return jsonify({'success': False, 'error': 'Assessment not found'}), 404
        assessment = assessment_resp.data[0]

        if assessment['status'] != 'reconsideration_requested':
            return jsonify({'success': False, 'error': "Assessment is not in 'reconsideration_requested' status."}), 400

        senior_supervisor_id, err = assessment_service.resolve_senior_supervisor_id(assessment['supervisor_id'])
        if err:
            return jsonify({'success': False, 'error': err}), 400

        if reviewer_id != senior_supervisor_id:
            return jsonify({'success': False, 'error': 'Only the designated senior supervisor may review this reconsideration.'}), 403

        if action == 'reject' and not rejection_note:
            return jsonify({'success': False, 'error': 'A rejection note is required when rejecting a reconsideration.'}), 400

        now_iso = datetime.now(timezone.utc).isoformat()

        recon_update = {
            'reviewed_by': reviewer_id,
            'reviewed_at': now_iso,
            'action': action,
        }

        if action == 'approve':
            new_status = 'completed'
            recon_update['rejection_note'] = None
            notif_type = 'reconsideration_approved'
            notif_title = 'Reconsideration Approved'
            notif_message = 'Your reconsideration request has been reviewed and approved by the senior supervisor.'

        elif action == 'reject':
            new_status = 'reconsideration_rejected'
            recon_update['rejection_note'] = rejection_note
            notif_type = 'reconsideration_rejected'
            notif_title = 'Reconsideration Rejected'
            notif_message = f"Your reconsideration request was reviewed and rejected. Note: {rejection_note}"

        else:
            return jsonify({'success': False, 'error': "action must be 'approve' or 'reject'."}), 400

        # Update the reconsideration record
        recon_resp = supabase.table('potential_assessment_reconsiderations').update(recon_update).eq('assessment_id', assessment_id).execute()

        # Update only the status on the main assessment
        supabase.table('potential_assessments').update({'status': new_status}).eq('id', assessment_id).execute()

        try:
            assessment_service.send_pa_notification(
                recipient_id=assessment['employee_id'],
                notif_type=notif_type,
                title=notif_title,
                message=notif_message,
            )
        except Exception as e:
            print(f'[PA NOTIFICATION ERROR] {e}')

        assessment_service.log_assessment_action(
            assessment_id, reviewer_id, assessment.get('appraisee_role', 'unknown'),
            f'reconsideration_{action}d',
            assessment.get('appraisal_cycle', ''),
        )

        return jsonify({'success': True, 'data': recon_resp.data[0] if recon_resp.data else {}}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/<assessment_id>/reconsideration', methods=['GET'])
def get_reconsideration_status(assessment_id: str):
    try:
        recon_resp = supabase.table('potential_assessment_reconsiderations').select('*').eq('assessment_id', assessment_id).order('requested_at', desc=True).limit(1).execute()
        if not recon_resp.data:
            return jsonify({'success': False, 'error': 'No reconsideration found for this assessment'}), 404
        recon = recon_resp.data[0]

        # Enrich with assessment context (cycle, status, supervisor)
        try:
            a = supabase.table('potential_assessments').select(
                'status, appraisal_cycle, supervisor_id, appraisee_role'
            ).eq('id', assessment_id).single().execute().data or {}
            recon['assessment_status'] = a.get('status')
            recon['appraisal_cycle'] = a.get('appraisal_cycle')
            recon['appraisee_role'] = a.get('appraisee_role')
            supervisor_id = a.get('supervisor_id')
        except Exception:
            supervisor_id = None

        try:
            emp_resp = supabase.table('users').select('full_name').eq('id', recon['employee_id']).single().execute()
            recon['employee_name'] = emp_resp.data.get('full_name', '—') if emp_resp.data else '—'
        except Exception:
            recon['employee_name'] = '—'

        try:
            if supervisor_id:
                sup_resp = supabase.table('users').select('full_name').eq('id', supervisor_id).single().execute()
                recon['supervisor_name'] = sup_resp.data.get('full_name', '—') if sup_resp.data else '—'
            else:
                recon['supervisor_name'] = '—'
        except Exception:
            recon['supervisor_name'] = '—'

        return jsonify({'success': True, 'data': recon}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/assessment-components/merged', methods=['GET'])
def assessment_components_merged():
    role = request.args.get('role', '').strip()
    if not role:
        return jsonify({'success': False, 'error': 'role query parameter required'}), 400
    try:
        global_map = {(c['pillar'], c['component_number']): c for c in supabase.table('assessment_components').select('*').eq('scope', 'global').execute().data}
        role_map   = {(c['pillar'], c['component_number']): c for c in supabase.table('assessment_components').select('*').eq('scope', 'role').eq('assigned_role', role).execute().data}
        result = sorted({**global_map, **role_map}.values(), key=lambda x: (x['pillar'], x['component_number']))
        return jsonify({'success': True, 'data': result}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/assessment-components/<component_id>', methods=['PUT', 'DELETE'])
def assessment_component_detail(component_id):
    if request.method == 'DELETE':
        try:
            resp = supabase.table('assessment_components').delete().eq('id', component_id).execute()
            if not resp.data:
                return jsonify({'success': False, 'error': 'Component not found'}), 404
            return jsonify({'success': True}), 200
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body required'}), 400
        updates = {}
        if 'pillar' in data:
            if data['pillar'] not in _AC_PILLARS:
                return jsonify({'success': False, 'error': 'Invalid pillar'}), 400
            updates['pillar'] = data['pillar']
        if 'component_number' in data:
            if data['component_number'] not in [1, 2, 3]:
                return jsonify({'success': False, 'error': 'Invalid component_number'}), 400
            updates['component_number'] = data['component_number']
        if 'description' in data:
            desc = (data['description'] or '').strip()
            if not desc:
                return jsonify({'success': False, 'error': 'Description cannot be empty'}), 400
            updates['description'] = desc
        if 'scope' in data:
            if data['scope'] not in ['global', 'role']:
                return jsonify({'success': False, 'error': 'Invalid scope'}), 400
            updates['scope'] = data['scope']
        if 'assigned_role' in data:
            updates['assigned_role'] = data['assigned_role']
        from datetime import datetime, timezone
        updates['updated_at'] = datetime.now(timezone.utc).isoformat()
        resp = supabase.table('assessment_components').update(updates).eq('id', component_id).execute()
        if not resp.data:
            return jsonify({'success': False, 'error': 'Component not found'}), 404
        return jsonify({'success': True, 'data': resp.data[0]}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
