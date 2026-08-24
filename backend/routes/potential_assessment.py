from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import services.assessment_service as assessment_service
from models.supabase_client import supabase

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
        required = ['employee_id', 'appraisee_role', 'cycle', 'items']
        missing = [f for f in required if f not in body]
        if missing:
            return jsonify({'success': False, 'error': f'Missing fields: {missing}'}), 400

        # Auto-resolve supervisor if not provided or empty
        if not body.get('supervisor_id', '').strip():
            emp_resp = supabase.table('users').select('role, department_id, iata_branch_code, country_id').eq('id', body['employee_id']).limit(1).execute()
            if not emp_resp.data:
                return jsonify({'success': False, 'error': 'Employee not found.'}), 404
            emp = emp_resp.data[0]
            emp_role = emp.get('role')
            sup_resp = None
            if emp_role in ('sub_dept_admin', 'employee'):
                sup_resp = supabase.table('users').select('id').eq('role', 'dept_admin').eq('department_id', emp.get('department_id')).limit(1).execute()
            elif emp_role == 'dept_admin':
                sup_resp = supabase.table('users').select('id').eq('role', 'branch_admin').eq('iata_branch_code', emp.get('iata_branch_code')).limit(1).execute()
            elif emp_role == 'branch_admin':
                sup_resp = supabase.table('users').select('id').eq('role', 'country_admin').eq('country_id', emp.get('country_id')).limit(1).execute()
            elif emp_role == 'country_admin':
                sup_resp = supabase.table('users').select('id').eq('role', 'hq_admin').limit(1).execute()
            if sup_resp and sup_resp.data:
                body['supervisor_id'] = sup_resp.data[0]['id']
            else:
                return jsonify({'success': False, 'error': 'Could not determine your supervisor. Please contact your administrator.'}), 400

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

        # A component already exists for this exact pillar/question/scope slot
        # (global slot, or the same role's override) -> replace it instead of
        # creating a second row that the merge logic would then pick between
        # unpredictably.
        existing_query = (
            supabase.table('assessment_components').select('id')
            .eq('pillar', pillar).eq('component_number', component_number).eq('scope', scope)
        )
        if scope == 'role':
            existing_query = existing_query.eq('assigned_role', assigned_role)
        else:
            existing_query = existing_query.is_('assigned_role', 'null')
        existing = existing_query.limit(1).execute()

        if existing.data:
            resp = supabase.table('assessment_components').update({
                'description': description,
                'created_by': data.get('created_by'),
            }).eq('id', existing.data[0]['id']).execute()
            return jsonify({'success': True, 'data': resp.data[0]}), 200

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
        # If we can't resolve, try to get an HQ admin as fallback
        if err or not senior_supervisor_id:
            try:
                hq_resp = supabase.table('users').select('id').eq('role', 'hq_admin').limit(1).execute()
                if hq_resp.data:
                    senior_supervisor_id = hq_resp.data[0]['id']
                else:
                    return jsonify({'success': False, 'error': 'No senior supervisor found in system'}), 400
            except Exception:
                return jsonify({'success': False, 'error': 'Failed to determine reviewer'}), 400

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

        # Send to senior supervisor (who can review)
        try:
            assessment_service.send_pa_notification(
                recipient_id=senior_supervisor_id,
                notif_type='reconsideration_request',
                title='Reconsideration Request Received',
                message=f"{employee_name} has requested a reconsideration of their potential assessment. Please review at your earliest convenience.",
                assessment_id=assessment_id,
            )
        except Exception as e:
            print(f'[NOTIFICATION ERROR] Failed to send reconsideration_request to {senior_supervisor_id}: {e}')

        # Send FYI to direct supervisor (who reviewed them)
        try:
            assessment_service.send_pa_notification(
                recipient_id=assessment['supervisor_id'],
                notif_type='reconsideration_fyi',
                title='Employee Has Requested Reconsideration',
                message=f"{employee_name} has escalated their assessment result for reconsideration by a senior reviewer.",
                assessment_id=assessment_id,
            )
        except Exception as e:
            print(f'[NOTIFICATION ERROR] Failed to send reconsideration_fyi to {assessment["supervisor_id"]}: {e}')

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
        action        = body.get('action', '')
        rejection_note = (body.get('rejection_note') or '').strip()
        reviewer_id   = body.get('reviewer_id', '')
        justification = (body.get('justification') or '').strip()
        # List of {item_id, rating, justification} — only entries where rating is non-empty are true overrides
        override_items = [i for i in (body.get('override_items') or []) if i.get('item_id') and i.get('rating')]
        has_overrides  = len(override_items) > 0

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

        if has_overrides and not justification:
            return jsonify({'success': False, 'error': 'A justification is required when overriding scores.'}), 400

        if has_overrides:
            missing_item_justification = any(not str(i.get('justification') or '').strip() for i in override_items)
            if missing_item_justification:
                return jsonify({'success': False, 'error': 'A justification is required for every overridden rating.'}), 400

        now_iso = datetime.now(timezone.utc).isoformat()

        recon_update = {
            'reviewed_by': reviewer_id,
            'reviewed_at': now_iso,
            'action': action,
        }

        if action == 'approve':
            new_status = 'completed'
            recon_update['rejection_note'] = None
            if justification:
                recon_update['justification'] = justification
            notif_type    = 'reconsideration_approved'
            notif_title   = 'Reconsideration Approved'
            notif_message = 'Your reconsideration request has been reviewed and approved by the senior supervisor.'

        elif action == 'reject':
            new_status = 'reconsideration_rejected'
            recon_update['rejection_note'] = rejection_note
            notif_type    = 'reconsideration_rejected'
            notif_title   = 'Reconsideration Rejected'
            notif_message = f"Your reconsideration request was reviewed and rejected. Note: {rejection_note}"

        else:
            return jsonify({'success': False, 'error': "action must be 'approve' or 'reject'."}), 400

        # Update the reconsideration record
        recon_resp = supabase.table('potential_assessment_reconsiderations').update(recon_update).eq('assessment_id', assessment_id).execute()

        # Build assessment update — always update status
        assessment_update: dict = {'status': new_status}

        if action == 'approve' and has_overrides:
            # Apply each component-level override
            for ov in override_items:
                supabase.table('potential_assessment_items').update(
                    {'supervisor_rating': ov['rating'], 'supervisor_justification': str(ov['justification']).strip()}
                ).eq('id', ov['item_id']).execute()

            # Recalculate pillar overalls from updated items (majority vote)
            all_items = supabase.table('potential_assessment_items').select(
                'pillar, supervisor_rating'
            ).eq('assessment_id', assessment_id).execute().data or []

            def majority(ratings):
                h = ratings.count('H')
                l = ratings.count('L')
                if h >= 2: return 'H'
                if l >= 2: return 'L'
                return 'M'

            for pillar_key, field in [('ability', 'overall_ability'), ('aspiration', 'overall_aspiration'), ('leadership', 'overall_leadership')]:
                pillar_ratings = [i['supervisor_rating'] for i in all_items if i['pillar'] == pillar_key and i['supervisor_rating']]
                if pillar_ratings:
                    assessment_update[field] = majority(pillar_ratings)

            # Recalculate talent block from new pillar overalls
            a = assessment_update.get('overall_ability', assessment.get('overall_ability'))
            s = assessment_update.get('overall_aspiration', assessment.get('overall_aspiration'))
            l = assessment_update.get('overall_leadership', assessment.get('overall_leadership'))
            if a and s and l:
                h_count = [a, s, l].count('H')
                l_count = [a, s, l].count('L')
                if h_count >= 2 and l_count == 0:
                    assessment_update['talent_block'] = 'H'
                elif l_count >= 2 and h_count == 0:
                    assessment_update['talent_block'] = 'L'
                else:
                    assessment_update['talent_block'] = 'M'

        supabase.table('potential_assessments').update(assessment_update).eq('id', assessment_id).execute()

        # Send outcome notification to appraisee (the person who requested reconsideration)
        assessment_service.send_pa_notification(
            recipient_id=assessment['employee_id'],
            notif_type=notif_type,
            title=notif_title,
            message=notif_message,
            assessment_id=assessment_id,
        )

        # Send outcome notification to initial supervisor (so they know the outcome)
        assessment_service.send_pa_notification(
            recipient_id=assessment['supervisor_id'],
            notif_type=f"{notif_type}_supervisor",  # e.g., 'reconsideration_approved_supervisor'
            title=f"{notif_title} by Senior Supervisor",
            message=f"The reconsideration request from {assessment.get('appraisee_role', 'this user')} has been {action}d.",
            assessment_id=assessment_id,
        )

        assessment_service.log_assessment_action(
            assessment_id, reviewer_id, assessment.get('appraisee_role', 'unknown'),
            f'reconsideration_{action}d',
            assessment.get('appraisal_cycle', ''),
        )

        return jsonify({'success': True, 'data': recon_resp.data[0] if recon_resp.data else {}}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/reconsiderations-for-review/<reviewer_id>', methods=['GET'])
def get_reconsiderations_for_review(reviewer_id: str):
    """
    Get pending reconsiderations that the given reviewer (senior supervisor) needs to review.
    Uses resolve_senior_supervisor_id to match escalation hierarchy.
    """
    try:
        # Get all pending reconsiderations
        recon_resp = supabase.table('potential_assessment_reconsiderations').select(
            'id, assessment_id, employee_id, comment, requested_at'
        ).is_('action', 'null').order('requested_at', desc=True).execute()

        pending_reconsiderations = []
        for recon in recon_resp.data or []:
            try:
                # Use limit(1) instead of single() to avoid exceptions when row is missing
                assess_rows = supabase.table('potential_assessments').select(
                    'employee_id, supervisor_id, appraisee_role, status, appraisal_cycle'
                ).eq('id', recon['assessment_id']).limit(1).execute()

                if not assess_rows.data:
                    continue

                assess = assess_rows.data[0]

                # Resolve who the senior supervisor should be for this direct supervisor
                senior_supervisor_id, _ = assessment_service.resolve_senior_supervisor_id(assess['supervisor_id'])

                # Fallback: if supervisor resolution fails, HQ admin handles it (mirrors submit_reconsideration logic)
                if not senior_supervisor_id:
                    hq = supabase.table('users').select('id').eq('role', 'hq_admin').limit(1).execute()
                    if hq.data:
                        senior_supervisor_id = hq.data[0]['id']

                # If this reviewer matches the senior supervisor, include it
                if senior_supervisor_id != reviewer_id:
                    continue

                try:
                    emp_resp = supabase.table('users').select('full_name, emp_id').eq('id', assess['employee_id']).limit(1).execute()
                    emp_data = emp_resp.data[0] if emp_resp.data else {}
                    emp_name = emp_data.get('full_name', 'Unknown')
                    emp_id   = emp_data.get('emp_id')
                except Exception:
                    emp_name, emp_id = 'Unknown', None

                try:
                    sup_resp = supabase.table('users').select('full_name').eq('id', assess['supervisor_id']).limit(1).execute()
                    sup_name = sup_resp.data[0].get('full_name', 'Unknown') if sup_resp.data else 'Unknown'
                except Exception:
                    sup_name = 'Unknown'

                pending_reconsiderations.append({
                    'id': assess['employee_id'],
                    'emp_id': emp_id,
                    'full_name': emp_name,
                    'assessment_id': recon['assessment_id'],
                    'assessment_status': assess['status'],
                    'appraisee_role': assess['appraisee_role'],
                    'appraisal_cycle': assess['appraisal_cycle'],
                    'supervisor_name': sup_name,
                })
            except Exception as inner_e:
                print(f'[RECON REVIEW] Skipping recon {recon.get("assessment_id")}: {inner_e}')
                continue

        return jsonify({'success': True, 'data': pending_reconsiderations}), 200

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@potential_assessment_bp.route('/api/potential-assessment/<assessment_id>/reconsideration', methods=['GET'])
def get_reconsideration_status(assessment_id: str):
    try:
        recon_resp = supabase.table('potential_assessment_reconsiderations').select('*').eq('assessment_id', assessment_id).order('requested_at', desc=True).limit(1).execute()
        if not recon_resp.data:
            return jsonify({'success': False, 'error': 'No reconsideration found for this assessment'}), 404
        recon = recon_resp.data[0]

        # Enrich with assessment context, scores, supervisor, and employee_id fallback
        supervisor_id = None
        assessment_employee_id = None
        try:
            a = supabase.table('potential_assessments').select(
                'status, appraisal_cycle, supervisor_id, appraisee_role, employee_id, '
                'overall_ability, overall_aspiration, overall_leadership, talent_block'
            ).eq('id', assessment_id).single().execute().data or {}
            recon['assessment_status']    = a.get('status')
            recon['appraisal_cycle']      = a.get('appraisal_cycle')
            recon['appraisee_role']       = a.get('appraisee_role')
            recon['overall_ability']      = a.get('overall_ability')
            recon['overall_aspiration']   = a.get('overall_aspiration')
            recon['overall_leadership']   = a.get('overall_leadership')
            recon['talent_block']         = a.get('talent_block')
            supervisor_id          = a.get('supervisor_id')
            assessment_employee_id = a.get('employee_id')
        except Exception:
            pass

        # Fetch assessment items (self + supervisor ratings per component)
        try:
            items_resp = supabase.table('potential_assessment_items').select('*').eq('assessment_id', assessment_id).execute()
            recon['items'] = items_resp.data or []
        except Exception:
            recon['items'] = []

        # Resolve employee name — prefer reconsideration.employee_id, fall back to assessment.employee_id
        employee_id = recon.get('employee_id') or assessment_employee_id
        try:
            if employee_id:
                emp_resp = supabase.table('users').select('full_name').eq('id', employee_id).single().execute()
                recon['employee_name'] = emp_resp.data.get('full_name') if emp_resp.data else None
            else:
                recon['employee_name'] = None
        except Exception:
            recon['employee_name'] = None

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
