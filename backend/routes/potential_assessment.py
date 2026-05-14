from flask import Blueprint, request, jsonify
import services.assessment_service as assessment_service
from lib.supabase_client import supabase

potential_assessment_bp = Blueprint('potential_assessment', __name__)

_AC_PILLARS = ['ability', 'aspiration', 'leadership']
_AC_ROLES   = ['country_admin', 'branch_admin', 'dept_admin', 'sub_dept_admin', 'employee']


# ── Notifications ─────────────────────────────────────────────────────────────

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


# ── Appraisal Cycle ───────────────────────────────────────────────────────────

@potential_assessment_bp.route('/api/appraisal-cycles/active', methods=['GET'])
def get_active_appraisal_cycle():
    try:
        data = assessment_service.get_active_cycle()
        if not data:
            return jsonify({'success': False, 'error': 'No active appraisal cycle found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Assessment ────────────────────────────────────────────────────────────────

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


# ── Assessment Components ─────────────────────────────────────────────────────

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
