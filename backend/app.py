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

LOCKED_ADMIN_UUID = os.getenv("LOCKED_ADMIN_UUID", "00000000-0000-0000-0000-000000000001")


# ─────────────────────────────────────────────────────────────────────
# TEMPLATES
# ─────────────────────────────────────────────────────────────────────

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

        cat_ids = [c['id'] for c in categories]
        all_objectives = []
        if cat_ids:
            try:
                obj_res = supabase.table('objectives') \
                    .select('id, name, weight, max_score, control_type, category_id, kpi_scale') \
                    .in_('category_id', cat_ids) \
                    .execute()
            except Exception:
                obj_res = supabase.table('objectives') \
                    .select('id, name, weight, max_score, control_type, category_id') \
                    .in_('category_id', cat_ids) \
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


# ─────────────────────────────────────────────────────────────────────
# EMPLOYEES
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/employees', methods=['GET'])
def search_employees():
    query = request.args.get('search', '').strip()
    if not query:
        return jsonify([])
    try:
        user_res = supabase.table('users') \
            .select('id, full_name, designation_id, designations(name)') \
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
                'designation':           (u.get('designations') or {}).get('name', ''),
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


# ─────────────────────────────────────────────────────────────────────
# TEMPLATE ASSIGNMENTS
# ─────────────────────────────────────────────────────────────────────

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

        if not requested_ids:
            return jsonify({
                'error': 'employee_ids cannot be empty. '
                         'Pass at least one employee ID to assign.',
            }), 400

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
            .select('user_id, users(id, full_name, designation_id, designations(name))') \
            .eq('template_id', template_id).execute()
        employees = []
        for row in result.data:
            if row.get('users'):
                u = row['users']
                employees.append({
                    'id':          u['id'],
                    'name':        u['full_name'],
                    'designation': (u.get('designations') or {}).get('name', ''),
                })
        return jsonify(employees)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# KPI SCALE CATALOGUE
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# KPI RATING ENGINE
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# HELPER: load scale metadata from DB
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# HELPER: resolve the current active period (year + period label)
# Returns (pms_year: int, period: str) from the active rating_periods row.
# Falls back to the current calendar year and 'H1' if nothing is active.
# ─────────────────────────────────────────────────────────────────────

def _active_period_params():
    """Return (year, period) from the currently active rating_period row."""
    from datetime import date
    today = date.today()

    result = supabase.table('rating_periods') \
        .select('pms_year, period, rating_start, rating_end') \
        .eq('is_active', True) \
        .execute()

    for rp in (result.data or []):
        start = rp.get('rating_start')
        end   = rp.get('rating_end')
        if start and end:
            if date.fromisoformat(str(start)[:10]) <= today <= date.fromisoformat(str(end)[:10]):
                return int(rp['pms_year']), rp['period']

    # No open window — return the most recent active period row by year
    if result.data:
        latest = sorted(result.data, key=lambda r: (r['pms_year'], r['period']), reverse=True)[0]
        return int(latest['pms_year']), latest['period']

    # Absolute fallback: current year, H1
    return today.year, 'H1'


# ─────────────────────────────────────────────────────────────────────
# HELPER: upsert total score into performance_summaries
# ─────────────────────────────────────────────────────────────────────

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

    supabase.table('evaluations').upsert({
        'user_id':       user_id,
        'evaluator_id':  user_id,
        'period':        period,
        'year':          year,
        'overall_score': total,
        'status':        'completed',
    }, on_conflict='user_id,period,year').execute()

    return total


# ─────────────────────────────────────────────────────────────────────
# PERFORMANCE ROUTES
# ─────────────────────────────────────────────────────────────────────

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
            .select('id, full_name, designation_id, department_id, designations(name), departments(name)') \
            .eq('id', user_id) \
            .single() \
            .execute()
        if not user_res.data:
            return jsonify({'error': 'User not found'}), 404

        user = user_res.data
        emp_data = {
            'id':          user['id'],
            'name':        user.get('full_name', ''),
            'designation': (user.get('designations') or {}).get('name', ''),
            'department':  (user.get('departments') or {}).get('name', ''),
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
        year = int(request.args.get('year', _active_period_params()[0]))
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


# ─────────────────────────────────────────────────────────────────────
# EVALUATOR ROUTES
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/evaluator/submit', methods=['POST'])
def evaluator_submit():
    try:
        body         = request.get_json()
        user_id      = body.get('user_id')
        evaluator_id = body.get('evaluator_id')
        year         = body.get('year')
        period       = body.get('period')
        ratings      = body.get('ratings', [])

        if not all([user_id, evaluator_id, year, period]):
            return jsonify({'error': 'Missing required fields'}), 400

        if not ratings:
            return jsonify({
                'success':     True,
                'updated':     0,
                'total_score': None,
                'message':     'No ratings provided — nothing to save.',
            })

        mappings_by_obj, rules_by_mapping, obj_by_id, _ = _load_scale_meta()
        updated_count = 0

        for entry in ratings:
            obj_id        = entry.get('objective_id')
            manual_rating = entry.get('manual_rating')

            if not obj_id or manual_rating is None:
                continue

            manual_rating = round(float(manual_rating), 2)

            if not (1.0 <= manual_rating <= 5.0):
                return jsonify({'error': f'Rating for objective {obj_id} must be between 1.00 and 5.00'}), 400

            obj     = obj_by_id.get(obj_id, {})
            mapping = mappings_by_obj.get(obj_id, {})

            if mapping.get('scale_type') != 'manual':
                return jsonify({'error': f'Objective {obj_id} is not a manual-rated KPI'}), 400

            weight = float(obj.get('weight', 0))
            score  = round(manual_rating * (weight / 100), 4)

            supabase.table('performance_records').upsert({
                'user_id':       user_id,
                'objective_id':  obj_id,
                'period':        period,
                'year':          year,
                'target':        None,
                'actual':        None,
                'manual_rating': manual_rating,
                'rating':        manual_rating,
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


@app.route('/api/evaluator/pending', methods=['GET'])
def get_pending_evaluations():
    try:
        user_id = request.args.get('user_id')
        # FIX: use active period from DB instead of hardcoded defaults
        active_year, active_period = _active_period_params()
        year   = request.args.get('year',   active_year)
        period = request.args.get('period', active_period)

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


# ─────────────────────────────────────────────────────────────────────
# EVALUATOR TEAM
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/evaluator/<evaluator_id>/team', methods=['GET'])
def get_evaluator_team(evaluator_id):
    try:
        result = supabase.table('users') \
            .select('id, full_name, designation_id, emp_id, designations(name)') \
            .eq('manager_id', evaluator_id) \
            .execute()

        if not result.data:
            return jsonify([])

        team     = result.data
        user_ids = [u['id'] for u in team]

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

        enriched = []
        for u in team:
            a = assign_by_user.get(u['id'])
            enriched.append({
                'id':            u['id'],
                'full_name':     u['full_name'],
                'designation':   (u.get('designations') or {}).get('name', ''),
                'emp_id':        u.get('emp_id', ''),
                'template_id':   a['template_id']   if a else None,
                'template_name': a['template_name'] if a else None,
            })

        return jsonify(enriched)

    except Exception as e:
        print(f"[ERROR] get_evaluator_team: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# MANUAL OBJECTIVES FOR A USER
# FIX: year and period now default to the currently active period from DB
#      instead of hardcoded 2026/H1
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/manual-objectives/<user_id>', methods=['GET'])
def get_manual_objectives(user_id):
    try:
        # Resolve defaults dynamically from the active rating period
        active_year, active_period = _active_period_params()
        year   = request.args.get('year',   active_year, type=int)
        period = request.args.get('period', active_period)

        assign_res = supabase.table('template_assignments') \
            .select('template_id') \
            .eq('user_id', user_id) \
            .limit(1) \
            .execute()

        if not assign_res.data:
            return jsonify({'error': 'No template assigned to this user'}), 404

        template_id = assign_res.data[0]['template_id']

        cat_res = supabase.table('categories') \
            .select('id, name') \
            .eq('template_id', template_id) \
            .order('id') \
            .execute()

        categories = cat_res.data or []
        cat_ids    = [c['id'] for c in categories]
        cat_map    = {c['id']: c['name'] for c in categories}

        if not cat_ids:
            return jsonify([])

        obj_res = supabase.table('objectives') \
            .select('id, name, weight, category_id, kpi_scale') \
            .in_('category_id', cat_ids) \
            .eq('kpi_scale', 'manual') \
            .order('id') \
            .execute()

        objectives = obj_res.data or []
        if not objectives:
            return jsonify([])

        obj_ids = [o['id'] for o in objectives]

        rec_res = supabase.table('performance_records') \
            .select('objective_id, manual_rating') \
            .eq('user_id', user_id) \
            .eq('year', year) \
            .eq('period', period) \
            .in_('objective_id', obj_ids) \
            .execute()

        existing = {
            r['objective_id']: r['manual_rating']
            for r in (rec_res.data or [])
            if r.get('manual_rating') is not None
        }

        result = []
        for obj in objectives:
            result.append({
                'objective_id':   obj['id'],
                'objective_name': obj['name'],
                'category_id':    obj['category_id'],
                'category_name':  cat_map.get(obj['category_id'], ''),
                'weight':         float(obj.get('weight', 0)),
                'kpi_scale':      obj.get('kpi_scale', 'manual'),
                'manual_rating':  existing.get(obj['id']),
            })

        return jsonify(result)

    except Exception as e:
        print(f"[ERROR] get_manual_objectives: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# RATING PERIODS
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/rating-periods/current', methods=['GET'])
def get_current_rating_period():
    try:
        from datetime import date

        result = supabase.table('rating_periods') \
            .select('*') \
            .eq('is_active', True) \
            .execute()

        if not result.data:
            return jsonify({
                'rating_open':   False,
                'active_period': None,
                'reason':        'No active rating periods configured',
            })

        today = date.today()

        def parse_date(d):
            if not d:
                return None
            return date.fromisoformat(str(d)[:10])

        active = None
        for rp in result.data:
            start = parse_date(rp['rating_start'])
            end   = parse_date(rp['rating_end'])
            if start and end and start <= today <= end:
                active = rp
                break

        if not active:
            upcoming = None
            for rp in result.data:
                start = parse_date(rp['rating_start'])
                if start and today < start:
                    if upcoming is None or start < parse_date(upcoming['rating_start']):
                        upcoming = rp

            if upcoming:
                reason = f"Rating window opens on {parse_date(upcoming['rating_start']).strftime('%d %b %Y')}"
            else:
                reason = 'Rating window has closed for this cycle'

            return jsonify({
                'rating_open':   False,
                'active_period': None,
                'reason':        reason,
                'periods':       result.data,
            })

        return jsonify({
            'rating_open':   True,
            'active_period': active['period'],
            'pms_year':      active['pms_year'],
            'rating_start':  active['rating_start'],
            'rating_end':    active['rating_end'],
            'reason':        None,
            'periods':       result.data,
        })

    except Exception as e:
        print(f"[ERROR] get_current_rating_period: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# RATING SETTINGS OVERVIEW
# FIX: year and period now default to the currently active period from DB
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/rating-settings/overview/<evaluator_id>', methods=['GET'])
def get_rating_overview(evaluator_id):
    try:
        # Resolve defaults dynamically
        active_year, active_period_str = _active_period_params()
        period   = request.args.get('period', active_period_str)
        pms_year = request.args.get('year',   active_year, type=int)

        team_res = supabase.table('users') \
            .select('id, full_name, role, designation_id, designations(name)') \
            .eq('manager_id', evaluator_id) \
            .execute()
        team = team_res.data or []

        overview = []
        for member in team:
            assign_res = supabase.table('template_assignments') \
                .select('template_id') \
                .eq('user_id', member['id']) \
                .limit(1) \
                .execute()

            if not assign_res.data:
                continue

            template_id = assign_res.data[0]['template_id']
            cat_res = supabase.table('categories') \
                .select('id') \
                .eq('template_id', template_id) \
                .execute()
            cat_ids = [c['id'] for c in (cat_res.data or [])]

            total_manual = 0
            if cat_ids:
                obj_res = supabase.table('objectives') \
                    .select('id') \
                    .in_('category_id', cat_ids) \
                    .eq('kpi_scale', 'manual') \
                    .execute()
                total_manual = len(obj_res.data or [])

            submitted_res = supabase.table('performance_records') \
                .select('objective_id') \
                .eq('user_id', member['id']) \
                .eq('period', period) \
                .eq('year', pms_year) \
                .not_.is_('manual_rating', 'null') \
                .execute()
            submitted = len(submitted_res.data or [])
            pending   = max(0, total_manual - submitted)

            overview.append({
                'id':          member['id'],
                'name':        member['full_name'],
                'role':        member['role'],
                'designation': (member.get('designations') or {}).get('name', ''),
                'total':       total_manual,
                'submitted':   submitted,
                'pending':     pending,
                'pct':         round((submitted / total_manual * 100) if total_manual > 0 else 0, 1),
                'status':      'complete' if pending == 0 and total_manual > 0 else 'pending',
            })

        return jsonify(overview)
    except Exception as e:
        print(f"[ERROR] get_rating_overview: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# SUPERVISOR FEEDBACK
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/feedback/<user_id>/<int:year>/<period>', methods=['GET'])
def get_supervisor_feedback(user_id, year, period):
    try:
        eval_res = supabase.table('evaluations') \
            .select('id, evaluator_id, users!evaluations_evaluator_id_fkey(full_name, designation_id, designations(name))') \
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
                'designation': (evaluator.get('designations') or {}).get('name', ''),
            } if evaluator else None,
        })

    except Exception as e:
        print(f"[ERROR] get_supervisor_feedback: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# AI RECOMMENDATIONS
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# PMS CYCLE
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/pms-cycle/current', methods=['GET'])
def get_current_pms_cycle():
    try:
        from datetime import date

        result = supabase.table('pms_cycles') \
            .select('*') \
            .eq('is_active', True) \
            .order('pms_year', desc=True) \
            .limit(1) \
            .execute()

        if not result.data:
            return jsonify({
                'cycle':        None,
                'editing_open': False,
                'reason':       'No active PMS cycle found',
            })

        cycle = result.data[0]
        today = date.today()

        obj_start = cycle.get('objective_setting_start')
        obj_end   = cycle.get('objective_setting_end')
        grace_end = cycle.get('grace_period_end') or obj_end

        def parse_date(d):
            if not d:
                return None
            return date.fromisoformat(str(d)[:10])

        start = parse_date(obj_start)
        end   = parse_date(grace_end)

        if not start or not end:
            return jsonify({
                'cycle':        cycle,
                'editing_open': False,
                'reason':       'Objective setting dates not configured by Group Admin',
            })

        editing_open = start <= today <= end

        reason = None
        if not editing_open:
            if today < start:
                reason = f'Objective setting window opens on {start.strftime("%d %b %Y")}'
            else:
                reason = f'Objective setting window closed on {end.strftime("%d %b %Y")}'

        return jsonify({
            'cycle':                   cycle,
            'editing_open':            editing_open,
            'reason':                  reason,
            'objective_setting_start': obj_start,
            'objective_setting_end':   obj_end,
            'grace_period_end':        cycle.get('grace_period_end'),
            'today':                   today.isoformat(),
        })

    except Exception as e:
        print(f"[ERROR] get_current_pms_cycle: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# ORG HIERARCHY — for rating period filter selectors
# Returns countries / branches / departments / sub-departments
# scoped to the calling evaluator's role:
#   hq_admin     → all countries, all branches/depts/sub-depts
#   country_admin → branches/depts/sub-depts in their own country
#   branch_admin  → own branch only
# ─────────────────────────────────────────────────────────────────────

def _get_evaluator_role(evaluator_id: str):
    """Return (role, country_id) for the given evaluator."""
    res = supabase.table('users') \
        .select('role, country_id') \
        .eq('id', evaluator_id) \
        .limit(1) \
        .execute()
    if res.data:
        return res.data[0].get('role'), res.data[0].get('country_id')
    return None, None


@app.route('/api/org/countries', methods=['GET'])
def get_org_countries():
    """Return all countries. Only meaningful for hq_admin."""
    try:
        res = supabase.table('countries').select('id, name').order('name').execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"[ERROR] get_org_countries: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/org/branches', methods=['GET'])
def get_org_branches():
    """Return branches visible to the evaluator."""
    try:
        evaluator_id = request.args.get('evaluator_id', '')
        role, country_id = _get_evaluator_role(evaluator_id)

        query = supabase.table('branches').select('id, name, country_id').order('name')
        if role == 'country_admin' and country_id:
            query = query.eq('country_id', country_id)
        # hq_admin gets all; branch/dept admins get their own handled client-side

        res = query.execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"[ERROR] get_org_branches: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/org/departments', methods=['GET'])
def get_org_departments():
    """Return departments visible to the evaluator."""
    try:
        evaluator_id = request.args.get('evaluator_id', '')
        role, country_id = _get_evaluator_role(evaluator_id)

        query = supabase.table('departments').select('id, name, branch_id').order('name')

        if role == 'country_admin' and country_id:
            # Join through branches to filter by country
            branch_res = supabase.table('branches') \
                .select('id') \
                .eq('country_id', country_id) \
                .execute()
            branch_ids = [b['id'] for b in (branch_res.data or [])]
            if branch_ids:
                query = query.in_('branch_id', branch_ids)
            else:
                return jsonify([])

        res = query.execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"[ERROR] get_org_departments: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/org/sub-departments', methods=['GET'])
def get_org_sub_departments():
    """Return sub-departments visible to the evaluator."""
    try:
        evaluator_id = request.args.get('evaluator_id', '')
        role, country_id = _get_evaluator_role(evaluator_id)

        query = supabase.table('sub_departments').select('id, name, department_id').order('name')

        if role == 'country_admin' and country_id:
            branch_res = supabase.table('branches') \
                .select('id') \
                .eq('country_id', country_id) \
                .execute()
            branch_ids = [b['id'] for b in (branch_res.data or [])]
            if branch_ids:
                dept_res = supabase.table('departments') \
                    .select('id') \
                    .in_('branch_id', branch_ids) \
                    .execute()
                dept_ids = [d['id'] for d in (dept_res.data or [])]
                if dept_ids:
                    query = query.in_('department_id', dept_ids)
                else:
                    return jsonify([])
            else:
                return jsonify([])

        res = query.execute()
        return jsonify(res.data or [])
    except Exception as e:
        print(f"[ERROR] get_org_sub_departments: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# RATING PERIOD UPDATE (country_admin + hq_admin only)
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/rating-periods/update', methods=['POST'])
def update_rating_period():
    try:
        body      = request.get_json()
        period    = body.get('period')
        pms_year  = body.get('pms_year')
        new_start = body.get('rating_start')
        new_end   = body.get('rating_end')

        if not all([period, pms_year, new_start, new_end]):
            return jsonify({'error': 'Missing required fields'}), 400

        supabase.table('rating_periods') \
            .update({'rating_start': new_start, 'rating_end': new_end}) \
            .eq('period', period) \
            .eq('pms_year', pms_year) \
            .execute()

        # Optional: log which org units were affected (stored for audit)
        affected = {
            'affected_countries':   body.get('affected_countries', []),
            'affected_branches':    body.get('affected_branches', []),
            'affected_departments': body.get('affected_departments', []),
            'affected_sub_depts':   body.get('affected_sub_depts', []),
        }
        print(f"[INFO] Rating period {period} {pms_year} updated. Affected units: {affected}")

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# MANUAL RATING NOTIFICATIONS
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/manual-rating-notifications/<user_id>', methods=['GET'])
def get_manual_rating_notifications(user_id):
    try:
        result = supabase.table('manual_rating_notifications') \
            .select('*') \
            .eq('recipient_id', user_id) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify(result.data or [])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manual-rating-notifications/<notif_id>/read', methods=['PATCH'])
def mark_manual_rating_notification_read(notif_id):
    try:
        supabase.table('manual_rating_notifications') \
            .update({'is_read': True}) \
            .eq('id', notif_id) \
            .execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manual-rating-notifications/<notif_id>', methods=['DELETE'])
def delete_manual_rating_notification(notif_id):
    try:
        recipient_id = request.args.get('recipient_id')
        query = supabase.table('manual_rating_notifications') \
            .delete() \
            .eq('id', notif_id)
        if recipient_id:
            query = query.eq('recipient_id', recipient_id)
        query.execute()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manual-rating-notifications/send-reminder', methods=['POST'])
def send_manual_rating_reminder():
    try:
        body         = request.get_json()
        sender_id    = body.get('sender_id')
        recipient_id = body.get('recipient_id')
        period       = body.get('period')
        pms_year     = body.get('pms_year')
        message      = body.get('message')

        if not all([sender_id, recipient_id, period, pms_year]):
            return jsonify({'error': 'Missing required fields'}), 400

        recipient_res = supabase.table('users') \
            .select('id, full_name, manager_id') \
            .eq('id', recipient_id) \
            .single() \
            .execute()

        if not recipient_res.data:
            return jsonify({'error': 'Recipient not found'}), 404

        if str(recipient_res.data.get('manager_id')) != str(sender_id):
            return jsonify({
                'error': 'Sender is not the direct manager of this recipient'
            }), 403

        sender = supabase.table('users') \
            .select('full_name') \
            .eq('id', sender_id) \
            .single() \
            .execute()
        sender_name = sender.data.get('full_name', 'Your Supervisor') if sender.data else 'Your Supervisor'

        supabase.table('manual_rating_notifications').insert({
            'recipient_id': recipient_id,
            'sender_id':    sender_id,
            'type':         'manual_reminder',
            'title':        'Manual Rating Reminder',
            'message':      message or (
                f'{sender_name} has requested you complete your pending manual '
                f'ratings for {period} {pms_year} urgently.'
            ),
            'period':       period,
            'pms_year':     pms_year,
            'is_read':      False,
        }).execute()

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/manual-rating-notifications/broadcast', methods=['POST'])
def broadcast_manual_rating_notification():
    try:
        body       = request.get_json()
        notif_type = body.get('type')
        period     = body.get('period')
        pms_year   = body.get('pms_year')

        if not all([notif_type, period, pms_year]):
            return jsonify({'error': 'Missing required fields'}), 400

        if notif_type == 'period_opened':
            existing_check = supabase.table('manual_rating_notifications') \
                .select('id') \
                .eq('type', 'period_opened') \
                .eq('period', period) \
                .eq('pms_year', pms_year) \
                .limit(1) \
                .execute()
            if existing_check.data:
                return jsonify({
                    'success':  False,
                    'message':  f'period_opened notification already sent for {period} {pms_year}. '
                                'No duplicates created.',
                    'notifications_sent': 0,
                }), 200

        evaluator_roles = ['branch_admin', 'dept_admin', 'sub_dept_admin', 'country_admin']
        evaluators_res = supabase.table('users') \
            .select('id, full_name, manager_id, role') \
            .in_('role', evaluator_roles) \
            .execute()
        evaluators = evaluators_res.data or []

        all_manager_ids = list({
            e['manager_id'] for e in evaluators
            if e.get('manager_id')
        })
        valid_manager_ids: set = set()
        if all_manager_ids:
            mgr_res = supabase.table('users') \
                .select('id') \
                .in_('id', all_manager_ids) \
                .execute()
            valid_manager_ids = {r['id'] for r in (mgr_res.data or [])}

        notifications_to_insert = []

        for evaluator in evaluators:
            assign_res = supabase.table('template_assignments') \
                .select('template_id') \
                .eq('user_id', evaluator['id']) \
                .limit(1) \
                .execute()

            if not assign_res.data:
                continue

            template_id = assign_res.data[0]['template_id']
            cat_res = supabase.table('categories') \
                .select('id') \
                .eq('template_id', template_id) \
                .execute()
            cat_ids = [c['id'] for c in (cat_res.data or [])]

            total_manual = 0
            if cat_ids:
                obj_res = supabase.table('objectives') \
                    .select('id') \
                    .in_('category_id', cat_ids) \
                    .eq('kpi_scale', 'manual') \
                    .execute()
                total_manual = len(obj_res.data or [])

            submitted_res = supabase.table('performance_records') \
                .select('objective_id') \
                .eq('user_id', evaluator['id']) \
                .eq('period', period) \
                .eq('year', pms_year) \
                .not_.is_('manual_rating', 'null') \
                .execute()
            submitted = len(submitted_res.data or [])
            pending   = max(0, total_manual - submitted)

            manager_id    = evaluator.get('manager_id')
            valid_manager = manager_id if manager_id in valid_manager_ids else None

            if notif_type == 'period_opened':
                notifications_to_insert.append({
                    'recipient_id': evaluator['id'],
                    'sender_id':    None,
                    'type':         'period_opened',
                    'title':        f'Manual Rating Window Open — {period} {pms_year}',
                    'message':      (
                        f'The manual rating window for {period} {pms_year} is now open. '
                        f'You have {total_manual} manual KPI(s) to rate. '
                        'Please complete all ratings before the deadline.'
                    ),
                    'period':       period,
                    'pms_year':     pms_year,
                    'is_read':      False,
                })

            elif notif_type == 'deadline_warning' and pending > 0:
                notifications_to_insert.append({
                    'recipient_id': evaluator['id'],
                    'sender_id':    None,
                    'type':         'deadline_warning',
                    'title':        f'Manual Ratings Due in 3 Days — {period} {pms_year}',
                    'message':      (
                        f'You have {pending} pending manual rating{"s" if pending > 1 else ""} '
                        f'due in 3 days for {period} {pms_year}. '
                        'Please complete them before the window closes.'
                    ),
                    'period':       period,
                    'pms_year':     pms_year,
                    'is_read':      False,
                })
                if valid_manager:
                    notifications_to_insert.append({
                        'recipient_id': valid_manager,
                        'sender_id':    None,
                        'type':         'supervisor_alert',
                        'title':        f'Team Member Has Pending Ratings — {period} {pms_year}',
                        'message':      (
                            f'{evaluator["full_name"]} has {pending} pending manual '
                            f'rating{"s" if pending > 1 else ""} due in 3 days for '
                            f'{period} {pms_year}. Please follow up.'
                        ),
                        'period':       period,
                        'pms_year':     pms_year,
                        'is_read':      False,
                    })

            elif notif_type == 'period_closed' and pending > 0:
                if valid_manager:
                    notifications_to_insert.append({
                        'recipient_id': valid_manager,
                        'sender_id':    None,
                        'type':         'supervisor_alert',
                        'title':        f'Incomplete Ratings After Period Closed — {period} {pms_year}',
                        'message':      (
                            f'{evaluator["full_name"]} has {pending} incomplete manual '
                            f'rating{"s" if pending > 1 else ""} after the '
                            f'{period} {pms_year} window has closed.'
                        ),
                        'period':       period,
                        'pms_year':     pms_year,
                        'is_read':      False,
                    })

        if notifications_to_insert:
            supabase.table('manual_rating_notifications').insert(notifications_to_insert).execute()

        return jsonify({
            'success':            True,
            'notifications_sent': len(notifications_to_insert),
        })

    except Exception as e:
        print(f"[ERROR] broadcast_manual_rating_notification: {e}")
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────
# MISC
# ─────────────────────────────────────────────────────────────────────

@app.route('/api/routes')
def list_routes():
    return jsonify([str(rule) for rule in app.url_map.iter_rules()])


@app.route('/api/users/by-email', methods=['GET'])
def get_user_by_email():
    email = request.args.get('email', '').strip()
    if not email:
        return jsonify({'error': 'email required'}), 400
    try:
        result = supabase.table('users') \
            .select('id, email, full_name, role') \
            .eq('email', email) \
            .limit(1) \
            .execute()
        if not result.data:
            return jsonify({'error': 'User not found'}), 404
        return jsonify(result.data[0])
    except Exception as e:
        print(f"[ERROR] get_user_by_email: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)