from flask import Flask, jsonify, request
from flask_cors import CORS
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
print("KEY PREFIX:", os.getenv("SUPABASE_KEY", "MISSING")[:20])

app = Flask(__name__)
CORS(app)

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# TODO: replace with real auth UUID once auth is integrated.
# This must match the id in the users table for the admin/demo user.
# Set LOCKED_ADMIN_UUID in your .env file.
LOCKED_ADMIN_UUID = os.getenv("LOCKED_ADMIN_UUID", "aaaaaaaa-0001-0001-0001-000000000001")


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/templates', methods=['GET'])
def get_templates():
    try:
        result = supabase.table('templates').select('*').execute()
        return jsonify(result.data)
    except Exception as e:
        print(f"[ERROR] get_templates: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates/<int:template_id>', methods=['GET'])
def get_template(template_id):
    import traceback
    try:
        tmpl_res = supabase.table('templates').select('*').eq('id', template_id).execute()
        if not tmpl_res.data:
            return jsonify({'error': 'Template not found'}), 404
        result = tmpl_res.data[0]

        cat_res = supabase.table('categories').select('*').eq('template_id', template_id).order('id').execute()
        categories = cat_res.data or []

        try:
            obj_res = supabase.table('objectives') \
                .select('id, name, weight, max_score, control_type, category_id, kpi_scale') \
                .execute()
        except Exception:
            obj_res = supabase.table('objectives') \
                .select('id, name, weight, max_score, control_type, category_id') \
                .execute()
        all_objectives = obj_res.data or []

        for cat in categories:
            cat['objectives'] = [o for o in all_objectives if o['category_id'] == cat['id']]

        result['categories'] = categories
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e), 'detail': traceback.format_exc()}), 500


@app.route('/api/templates/<int:template_id>/update', methods=['PUT'])
def update_template(template_id):
    try:
        body = request.get_json()
        if not body or 'categories' not in body:
            return jsonify({'error': 'Invalid payload'}), 400
        for cat in body['categories']:
            for obj in cat.get('objectives', []):
                if obj.get('isNew'):
                    supabase.table('objectives').insert({
                        'name':         obj['name'],
                        'weight':       obj['weight'],
                        'max_score':    obj.get('max_score', 5),
                        'control_type': obj['control_type'],
                        'category_id':  obj['category_id'],
                        'kpi_scale':    obj.get('kpi_scale'),
                    }).execute()
                else:
                    supabase.table('objectives').update(
                        {'weight': obj['weight']}
                    ).eq('id', obj['id']).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates/<int:template_id>/objectives/<int:obj_id>', methods=['DELETE'])
def delete_objective(template_id, obj_id):
    try:
        supabase.table('objectives').delete().eq('id', obj_id).execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# EMPLOYEES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/employees', methods=['GET'])
def search_employees():
    query = request.args.get('search', '').strip()
    if not query:
        return jsonify([])
    try:
        user_res = supabase.table('users') \
            .select('id, full_name, designation') \
            .ilike('full_name', f'%{query}%') \
            .eq('manager_id', LOCKED_ADMIN_UUID) \
            .limit(10) \
            .execute()

        users = user_res.data or []
        if not users:
            return jsonify([])

        user_ids = [u['id'] for u in users]

        assign_res = supabase.table('template_assignments') \
            .select('user_id, template_id, templates(id, name)') \
            .in_('user_id', user_ids) \
            .execute()

        assign_by_user = {}
        for row in (assign_res.data or []):
            assign_by_user[row['user_id']] = {
                'template_id':   row['template_id'],
                'template_name': row['templates']['name'] if row.get('templates') else None,
            }

        result = []
        for u in users:
            a = assign_by_user.get(u['id'])
            result.append({
                'id':                    u['id'],
                'name':                  u['full_name'],
                'designation':           u.get('designation', ''),
                'current_template_id':   a['template_id']   if a else None,
                'current_template_name': a['template_name'] if a else None,
            })

        return jsonify(result)
    except Exception as e:
        print(f"[ERROR] search_employees: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/employees/<user_id>/assignment', methods=['GET'])
def get_employee_assignment(user_id):
    try:
        result = supabase.table('template_assignments') \
            .select('template_id, templates(id, name)') \
            .eq('user_id', user_id) \
            .limit(1) \
            .execute()
        if result.data:
            row = result.data[0]
            return jsonify({
                'assigned':      True,
                'template_id':   row['template_id'],
                'template_name': row['templates']['name'] if row.get('templates') else None,
            })
        return jsonify({'assigned': False, 'template_id': None, 'template_name': None})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ASSIGNMENTS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/templates/<int:template_id>/assign', methods=['POST'])
def assign_employees(template_id):
    try:
        body = request.get_json()
        if not body:
            return jsonify({'error': 'Invalid payload'}), 400

        requested_ids = [str(uid) for uid in body.get('employee_ids', [])]

        if LOCKED_ADMIN_UUID in requested_ids:
            return jsonify({
                'error': (
                    'This user is assigned to a template by their superior '
                    'and cannot be reassigned from this page.'
                ),
                'locked_employee_id': LOCKED_ADMIN_UUID,
            }), 403

        if requested_ids:
            supabase.table('template_assignments') \
                .delete() \
                .in_('user_id', requested_ids) \
                .neq('template_id', template_id) \
                .execute()

        supabase.table('template_assignments') \
            .delete() \
            .eq('template_id', template_id) \
            .neq('user_id', LOCKED_ADMIN_UUID) \
            .execute()

        if requested_ids:
            rows = [{'template_id': template_id, 'user_id': uid} for uid in requested_ids]
            supabase.table('template_assignments').insert(rows).execute()

        return jsonify({
            'success':  True,
            'assigned': len(requested_ids),
            'message':  (
                f'{len(requested_ids)} employee(s) assigned to template {template_id}. '
                'Any prior assignments on other templates were automatically removed.'
            ),
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/templates/<int:template_id>/assignments', methods=['GET'])
def get_assignments(template_id):
    try:
        result = supabase.table('template_assignments') \
            .select('user_id, users(id, full_name, designation)') \
            .eq('template_id', template_id).execute()
        employees = []
        for row in result.data:
            if row.get('users'):
                u = row['users']
                employees.append({
                    'id':          u['id'],
                    'name':        u['full_name'],
                    'designation': u.get('designation', ''),
                })
        return jsonify(employees)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# KPI SCALE CATALOGUE
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/kpi-scales', methods=['GET'])
def get_kpi_scales():
    try:
        SCALE_META = {
            'financial_achievement': ('Financial Achievement',        'Interpolated'),
            'to_gp_contribution':    ('T/O & GP Contribution',        'Interpolated'),
            'effective_sales_ratio': ('Effective Sales Ratio',        'Interpolated'),
            'individual_gp_margin':  ('Individual GP Margin %',       'Interpolated'),
            'ees_360':               ('EES / 360 Degree Feedback',    'Interpolated'),
            'nps_ccr':               ('NPS / CCR Score',              'Interpolated'),
            'employee_retention':    ('Employee Retention',           'Interpolated'),
            'overall_dpam':          ('Overall DPAM Score',           'Interpolated'),
            'statutory_legal_dpam':  ('Statutory & Legal Compliance', 'Bracket'),
            'wip_score':             ('WIP Score (Days)',              'Bracket'),
            'operations_score':      ('Operations Score / DPAM Ops',  'Bracket'),
            'individual_sales_gp':   ('Individual Sales GP',          'Bracket'),
            'manual':                ('Manual Rating (1-5)',           'Manual'),
        }
        SORT_ORDER = list(SCALE_META.keys())

        obj_rows = supabase.table('objectives') \
            .select('id, kpi_scale') \
            .not_.is_('kpi_scale', 'null') \
            .execute().data or []

        scale_to_obj_ids: dict = {}
        for o in obj_rows:
            sk = o.get('kpi_scale')
            if sk:
                scale_to_obj_ids.setdefault(sk, []).append(o['id'])

        all_obj_ids = [oid for ids in scale_to_obj_ids.values() for oid in ids]
        mapping_rows = []
        if all_obj_ids:
            mapping_rows = supabase.table('kpi_scale_mappings') \
                .select('objective_id, scale_type, input_type, ll, ul, inverse') \
                .in_('objective_id', all_obj_ids) \
                .execute().data or []

        mapping_by_obj = {m['objective_id']: m for m in mapping_rows}

        seen: set = set()
        catalogue = []

        for scale_key, obj_ids in scale_to_obj_ids.items():
            if scale_key in seen:
                continue
            seen.add(scale_key)

            mapping = next(
                (mapping_by_obj[oid] for oid in obj_ids if oid in mapping_by_obj),
                {}
            )

            label, group_name = SCALE_META.get(scale_key, (scale_key, 'Other'))
            catalogue.append({
                'scale_key':  scale_key,
                'label':      label,
                'group_name': group_name,
                'scale_type': mapping.get('scale_type'),
                'input_type': mapping.get('input_type'),
                'll':         mapping.get('ll'),
                'ul':         mapping.get('ul'),
                'inverse':    mapping.get('inverse', False),
                'sort_order': SORT_ORDER.index(scale_key) if scale_key in SORT_ORDER else 99,
            })

        for scale_key, (label, group_name) in SCALE_META.items():
            if scale_key not in seen:
                catalogue.append({
                    'scale_key':  scale_key,
                    'label':      label,
                    'group_name': group_name,
                    'scale_type': None,
                    'input_type': None,
                    'll':         None,
                    'ul':         None,
                    'inverse':    False,
                    'sort_order': SORT_ORDER.index(scale_key),
                })

        catalogue.sort(key=lambda x: x['sort_order'])
        return jsonify(catalogue)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# KPI RATING ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def compute_interpolated_rating(value: float, ll: float, ul: float) -> float:
    if value <= ll:
        return 1.0
    if value >= ul:
        return 5.0
    return round(1 + (value - ll) / (ul - ll) * 4, 4)


def compute_bracket_rating(actual: float, rules: list, inverse: bool) -> float:
    sorted_rules = sorted(rules, key=lambda r: (r['max_val'] is None, r['max_val'] or 0))
    for rule in sorted_rules:
        if rule['max_val'] is None or actual <= rule['max_val']:
            return rule['rating']
    return sorted_rules[-1]['rating']


def calculate_rating(record: dict, mapping: dict, bracket_rules: list) -> float:
    scale_type = mapping.get('scale_type')

    if scale_type == 'manual':
        return float(record.get('manual_rating') or 1.0)

    actual = record.get('actual')
    target = record.get('target')

    if actual is None:
        return float(record.get('manual_rating') or 1.0)

    actual = float(actual)

    if scale_type == 'interpolated':
        ll         = float(mapping['ll'])
        ul         = float(mapping['ul'])
        input_type = mapping.get('input_type', 'raw_actual')
        inverse    = mapping.get('inverse', False)

        if input_type == 'achievement_pct':
            if not target:
                return 1.0
            value = (float(target) / actual) * 100 if inverse else (actual / float(target)) * 100
        elif input_type == 'raw_actual_x100':
            value = actual * 100
        else:
            value = actual

        return compute_interpolated_rating(value, ll, ul)

    if scale_type == 'bracket':
        return compute_bracket_rating(actual, bracket_rules, mapping.get('inverse', False))

    return 1.0


def compute_achievement_pct(record: dict, mapping: dict):
    scale_type = mapping.get('scale_type')
    if scale_type != 'interpolated':
        return None

    actual     = record.get('actual')
    target     = record.get('target')
    input_type = mapping.get('input_type', 'raw_actual')
    inverse    = mapping.get('inverse', False)

    if actual is None:
        return None

    actual = float(actual)

    if input_type == 'achievement_pct':
        if not target:
            return None
        target = float(target)
        if inverse:
            return round((target / actual) * 100, 2) if actual != 0 else None
        else:
            return round((actual / target) * 100, 2)

    elif input_type == 'raw_actual_x100':
        return round(actual * 100, 2)

    elif input_type == 'raw_actual':
        return round(actual, 2)

    return None


# ─────────────────────────────────────────────────────────────────────────────
# HELPER: load scale metadata from DB
# ─────────────────────────────────────────────────────────────────────────────

def _load_scale_meta():
    mappings_raw   = supabase.table('kpi_scale_mappings').select('*').execute().data
    bracket_raw    = supabase.table('bracket_rules').select('*').execute().data
    objectives_raw = supabase.table('objectives').select('*').execute().data
    categories_raw = supabase.table('categories').select('*').execute().data

    mappings_by_obj  = {m['objective_id']: m for m in mappings_raw}
    rules_by_mapping = {}
    for rule in bracket_raw:
        rules_by_mapping.setdefault(rule['mapping_id'], []).append(rule)
    obj_by_id = {o['id']: o for o in objectives_raw}
    cat_by_id = {c['id']: c for c in categories_raw}

    return mappings_by_obj, rules_by_mapping, obj_by_id, cat_by_id


# ─────────────────────────────────────────────────────────────────────────────
# HELPER: upsert total score into performance_summaries
# ─────────────────────────────────────────────────────────────────────────────

def _patch_total_score(user_id: str, year: int, period: str) -> float:
    records = supabase.table('performance_records') \
        .select('score') \
        .eq('user_id', user_id) \
        .eq('year', year) \
        .eq('period', period) \
        .execute().data or []

    total = round(sum(float(r.get('score') or 0) for r in records), 4)

    supabase.table('performance_summaries').upsert({
        'user_id':     user_id,
        'year':        year,
        'period':      period,
        'total_score': total,
    }, on_conflict='user_id,year,period').execute()

    return total


# ─────────────────────────────────────────────────────────────────────────────
# PERFORMANCE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/performance/<user_id>/periods', methods=['GET'])
def get_periods(user_id):
    try:
        result = supabase.table('performance_records') \
            .select('period, year') \
            .eq('user_id', user_id).execute()
        seen, periods = set(), []
        for r in result.data:
            key = (r['year'], r['period'])
            if key not in seen:
                seen.add(key)
                periods.append({'year': r['year'], 'period': r['period']})
        periods.sort(key=lambda x: (x['year'], x['period']))
        return jsonify(periods)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/performance/<user_id>/<int:year>/<period>', methods=['GET'])
def get_performance(user_id, year, period):
    try:
        user_res = supabase.table('users') \
            .select('id, full_name, designation, department_id') \
            .eq('id', user_id) \
            .single() \
            .execute()
        if not user_res.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_res.data

        emp_data = {
            'id':          user['id'],
            'name':        user.get('full_name', ''),
            'designation': user.get('designation', ''),
            'department':  str(user.get('department_id', '')),
        }

        records = supabase.table('performance_records').select('*') \
            .eq('user_id', user_id).eq('year', year) \
            .eq('period', period).execute()
        if not records.data:
            return jsonify({'error': 'No performance records found for this period'}), 404

        mappings_by_obj, rules_by_mapping, obj_by_id, cat_by_id = _load_scale_meta()

        enriched = []
        for rec in records.data:
            obj_id   = rec['objective_id']
            obj      = obj_by_id.get(obj_id, {})
            cat      = cat_by_id.get(obj.get('category_id', 0), {})
            mapping  = mappings_by_obj.get(obj_id, {})
            brackets = rules_by_mapping.get(mapping.get('id'), [])
            weight   = float(obj.get('weight', 0))

            stored_rating = rec.get('rating')
            stored_score  = rec.get('score')

            if stored_rating is not None and stored_score is not None:
                rating = float(stored_rating)
                score  = float(stored_score)
            else:
                rating = calculate_rating(rec, mapping, brackets)
                score  = round(rating * (weight / 100), 4)

            achievement_pct = compute_achievement_pct(rec, mapping)

            enriched.append({
                'objective_id':    obj_id,
                'objective_name':  obj.get('name', ''),
                'category_id':     obj.get('category_id'),
                'category_name':   cat.get('name', ''),
                'weight':          weight,
                'control_type':    obj.get('control_type', ''),
                'target':          rec.get('target'),
                'actual':          rec.get('actual'),
                'manual_rating':   rec.get('manual_rating'),
                'achievement_pct': achievement_pct,
                'rating':          rating,
                'score':           score,
                'scale_type':      mapping.get('scale_type', 'manual'),
                'input_type':      mapping.get('input_type'),
                'll':              mapping.get('ll'),
                'ul':              mapping.get('ul'),
                'log_column':      mapping.get('log_column', ''),
                'notes':           mapping.get('notes', ''),
                'status':          rec.get('status', 'approved'),
            })

        cats_map: dict = {}
        for item in enriched:
            cname = item['category_name']
            if cname not in cats_map:
                cats_map[cname] = {
                    'category_name':   cname,
                    'category_weight': cat_by_id.get(item['category_id'], {}).get('weight', 0),
                    'objectives':      [],
                    'category_score':  0.0,
                    'max_possible':    0.0,
                }
            cats_map[cname]['objectives'].append(item)
            cats_map[cname]['category_score'] = round(
                cats_map[cname]['category_score'] + item['score'], 4)
            cats_map[cname]['max_possible'] = round(
                cats_map[cname]['max_possible'] + (item['weight'] / 100) * 5, 4)

        category_list = list(cats_map.values())
        final_score   = round(sum(c['category_score'] for c in category_list), 4)
        max_score     = round(sum(c['max_possible']   for c in category_list), 4)

        return jsonify({
            'employee':    emp_data,
            'period':      period,
            'year':        year,
            'final_score': final_score,
            'max_score':   max_score,
            'categories':  category_list,
        })

    except Exception as e:
        print(f"[ERROR] get_performance: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/performance/<user_id>/summary', methods=['GET'])
def get_performance_summary(user_id):
    try:
        year = int(request.args.get('year', 2025))

        records = supabase.table('performance_records') \
            .select('period, score') \
            .eq('user_id', user_id) \
            .eq('year', year) \
            .execute()

        periods_map: dict = {}
        for r in records.data:
            p = r['period']
            periods_map.setdefault(p, 0.0)
            periods_map[p] = round(periods_map[p] + float(r.get('score') or 0), 4)

        return jsonify({'year': year, 'scores': periods_map})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# EVALUATOR ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/evaluator/submit', methods=['POST'])
def evaluator_submit():
    try:
        body         = request.get_json()
        user_id      = body.get('user_id')
        evaluator_id = body.get('evaluator_id')
        year         = body.get('year')
        period       = body.get('period')
        ratings      = body.get('ratings', [])

        if not all([user_id, evaluator_id, year, period, ratings]):
            return jsonify({'error': 'Missing required fields'}), 400

        mappings_by_obj, rules_by_mapping, obj_by_id, _ = _load_scale_meta()
        updated_count = 0

        for entry in ratings:
            obj_id        = entry.get('objective_id')
            manual_rating = entry.get('manual_rating')

            if not obj_id or manual_rating is None:
                continue
            if not (1.0 <= float(manual_rating) <= 5.0):
                return jsonify({'error': f'Rating for objective {obj_id} must be 1-5'}), 400

            obj     = obj_by_id.get(obj_id, {})
            mapping = mappings_by_obj.get(obj_id, {})

            if mapping.get('scale_type') != 'manual':
                return jsonify({'error': f'Objective {obj_id} is not a manual-rated KPI'}), 400

            weight = float(obj.get('weight', 0))
            rating = float(manual_rating)
            score  = round(rating * (weight / 100), 4)

            supabase.table('performance_records').upsert({
                'user_id':       user_id,
                'objective_id':  obj_id,
                'period':        period,
                'year':          year,
                'target':        None,
                'actual':        None,
                'manual_rating': rating,
                'rating':        rating,
                'score':         score,
                'status':        'approved',
            }, on_conflict='user_id,objective_id,period,year').execute()

            updated_count += 1

        total = _patch_total_score(user_id, year, period)

        return jsonify({
            'success':     True,
            'updated':     updated_count,
            'total_score': total,
            'message':     f'{updated_count} manual ratings saved successfully',
        })

    except Exception as e:
        print(f"[ERROR] evaluator_submit: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sync/actuals', methods=['POST'])
def sync_actuals():
    try:
        body       = request.get_json()
        user_id    = body.get('user_id')
        year       = body.get('year')
        period     = body.get('period')
        records_in = body.get('records', [])

        if not all([user_id, year, period, records_in]):
            return jsonify({'error': 'Missing required fields'}), 400

        mappings_by_obj, rules_by_mapping, obj_by_id, _ = _load_scale_meta()
        synced = 0

        for entry in records_in:
            obj_id = entry.get('objective_id')
            target = entry.get('target')
            actual = entry.get('actual')

            if not obj_id:
                continue

            obj      = obj_by_id.get(obj_id, {})
            mapping  = mappings_by_obj.get(obj_id, {})
            brackets = rules_by_mapping.get(mapping.get('id'), [])

            if mapping.get('scale_type') == 'manual':
                continue

            rec_stub = {'actual': actual, 'target': target, 'manual_rating': None}
            rating   = calculate_rating(rec_stub, mapping, brackets)
            weight   = float(obj.get('weight', 0))
            score    = round(rating * (weight / 100), 4)

            supabase.table('performance_records').upsert({
                'user_id':       user_id,
                'objective_id':  obj_id,
                'period':        period,
                'year':          year,
                'target':        target,
                'actual':        actual,
                'manual_rating': None,
                'rating':        rating,
                'score':         score,
                'status':        'approved',
            }, on_conflict='user_id,objective_id,period,year').execute()

            synced += 1

        total = _patch_total_score(user_id, year, period)

        return jsonify({'success': True, 'synced': synced, 'total_score': total})

    except Exception as e:
        print(f"[ERROR] sync_actuals: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/evaluator/pending', methods=['GET'])
def get_pending_evaluations():
    try:
        user_id = request.args.get('user_id')
        year    = request.args.get('year', 2025)
        period  = request.args.get('period', 'H1')

        if not user_id:
            return jsonify({'error': 'user_id required'}), 400

        mappings_by_obj, _, obj_by_id, cat_by_id = _load_scale_meta()

        manual_obj_ids = [
            obj_id for obj_id, m in mappings_by_obj.items()
            if m.get('scale_type') == 'manual'
        ]

        existing = supabase.table('performance_records') \
            .select('objective_id, manual_rating') \
            .eq('user_id', user_id) \
            .eq('year', year) \
            .eq('period', period) \
            .execute()
        existing_ids = {
            r['objective_id'] for r in existing.data
            if r.get('manual_rating') is not None
        }

        pending = []
        for obj_id in manual_obj_ids:
            if obj_id not in existing_ids:
                obj = obj_by_id.get(obj_id, {})
                cat = cat_by_id.get(obj.get('category_id', 0), {})
                pending.append({
                    'objective_id':   obj_id,
                    'objective_name': obj.get('name', ''),
                    'category_name':  cat.get('name', ''),
                    'weight':         obj.get('weight', 0),
                })

        return jsonify({'pending': pending, 'count': len(pending)})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/backfill-scores', methods=['POST'])
def backfill_scores():
    try:
        mappings_by_obj, rules_by_mapping, obj_by_id, _ = _load_scale_meta()

        all_records = supabase.table('performance_records').select('*').execute().data or []
        updated     = 0
        period_keys = set()

        for rec in all_records:
            obj_id   = rec['objective_id']
            mapping  = mappings_by_obj.get(obj_id, {})
            brackets = rules_by_mapping.get(mapping.get('id'), [])
            obj      = obj_by_id.get(obj_id, {})
            weight   = float(obj.get('weight', 0))

            rating = calculate_rating(rec, mapping, brackets)
            score  = round(rating * (weight / 100), 4)

            supabase.table('performance_records').update({
                'rating': rating,
                'score':  score,
            }).eq('id', rec['id']).execute()

            period_keys.add((rec['user_id'], rec['year'], rec['period']))
            updated += 1

        for (uid, yr, per) in period_keys:
            _patch_total_score(uid, yr, per)

        return jsonify({
            'success':          True,
            'records_updated':  updated,
            'batches_totalled': len(period_keys),
        })

    except Exception as e:
        print(f"[ERROR] backfill_scores: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# SUPERVISOR FEEDBACK
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/feedback/<user_id>/<int:year>/<period>', methods=['GET'])
def get_supervisor_feedback(user_id, year, period):
    try:
        eval_res = supabase.table('evaluations') \
            .select('id, evaluator_id, users!evaluations_evaluator_id_fkey(full_name, designation)') \
            .eq('user_id', user_id) \
            .eq('year', year) \
            .eq('period', period) \
            .limit(1) \
            .execute()

        if not eval_res.data:
            return jsonify({'feedback': None, 'evaluator': None})

        evaluation = eval_res.data[0]
        eval_id    = evaluation['id']
        evaluator  = evaluation.get('users') or {}

        feedback_res = supabase.table('feedback') \
            .select('comment, rating') \
            .eq('evaluation_id', eval_id) \
            .order('created_at', desc=True) \
            .limit(1) \
            .execute()

        feedback = feedback_res.data[0] if feedback_res.data else {}

        return jsonify({
            'feedback': feedback.get('comment'),
            'rating':   feedback.get('rating'),
            'evaluator': {
                'name':        evaluator.get('full_name', 'Supervisor'),
                'designation': evaluator.get('designation', ''),
            } if evaluator else None,
        })

    except Exception as e:
        print(f"[ERROR] get_supervisor_feedback: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# AI RECOMMENDATIONS
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/recommendations/<user_id>/<int:year>/<period>', methods=['GET'])
def get_recommendations(user_id, year, period):
    try:
        result = supabase.table('performance_ai_recommendations') \
            .select('insight_text, insight_type, sort_order') \
            .eq('user_id', user_id) \
            .eq('year', year) \
            .eq('period', period) \
            .order('sort_order') \
            .execute()

        return jsonify(result.data or [])

    except Exception as e:
        print(f"[ERROR] get_recommendations: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)