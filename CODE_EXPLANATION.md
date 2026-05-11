# Code Explanation — Potential Assessment Module

This document explains the logic, functions, and design decisions behind the Potential Assessment feature, intended as a reference for code review discussions.

---

## 1. What the Feature Does

The Potential Assessment module lets employees rate themselves across 9 questions (3 pillars × 3 questions each), then their supervisor reviews and overrides those ratings. The system automatically calculates an **Overall Potentiality** (H / M / L) from the three pillar averages using a matrix rule defined in the project specification.

---

## 2. The Rating System — H / M / L

Every rating in this module is one of three values:

| Symbol | Meaning |
|--------|---------|
| `H`    | High    |
| `M`    | Medium  |
| `L`    | Low     |

There are three pillars: **Ability**, **Aspiration**, **Leadership**. Each pillar has 3 questions, giving **9 items per assessment**.

---

## 3. Core Calculation Logic

### 3.1 Pillar Rating — `calculate_pillar_rating` (backend)

**File:** `backend/calculations.py`

After the supervisor rates all 3 questions in a pillar, the system collapses the 3 ratings into a single **pillar overall rating** using a **majority rule**:

```python
def calculate_pillar_rating(ratings: list) -> str:
    h = ratings.count('H')
    l = ratings.count('L')
    if h >= 2:
        return 'H'
    if l >= 2:
        return 'L'
    return 'M'
```

**How it works:**
- Count how many H's and L's are in the 3 ratings.
- If 2 or more are H → result is H (majority is High).
- If 2 or more are L → result is L (majority is Low).
- Anything else → result is M (no majority).

**Why this order matters:** H is checked first. If all 3 are H, the function returns H before even checking L. If the ratings are `['H', 'H', 'L']`, there are 2 H's, so it returns H — the two H's outvote the one L under this rule.

**Examples:**

| Input              | H count | L count | Result |
|--------------------|---------|---------|--------|
| `['H', 'H', 'H']`  | 3       | 0       | H      |
| `['H', 'H', 'M']`  | 2       | 0       | H      |
| `['H', 'H', 'L']`  | 2       | 1       | H      |
| `['L', 'L', 'M']`  | 0       | 2       | L      |
| `['H', 'M', 'L']`  | 1       | 1       | M      |
| `['M', 'M', 'M']`  | 0       | 0       | M      |

---

### 3.2 Overall Potentiality — `calculate_overall_potentiality` (backend)

**File:** `backend/calculations.py`

Once the three pillar ratings (Ability, Aspiration, Leadership) are computed, the **Overall Potentiality** is derived using a **matrix rule** from the specification PDF:

```python
def calculate_overall_potentiality(ability: str, aspiration: str, leadership: str) -> str:
    ratings = [ability, aspiration, leadership]
    h = ratings.count('H')
    l = ratings.count('L')
    if h >= 2 and l == 0:
        return 'H'
    if l >= 2 and h == 0:
        return 'L'
    return 'M'
```

**The key difference from pillar rating:** The matrix rule has an extra safety condition — a single L **blocks** a High result, and a single H **blocks** a Low result:

- `h >= 2 AND l == 0` → H (two or more High, zero Low)
- `l >= 2 AND h == 0` → L (two or more Low, zero High)
- anything else → M

**Why the stricter rule here?** The Overall Potentiality has a direct impact on an employee's career trajectory. The specification deliberately makes it harder to achieve H and harder to fall to L — a single weak/strong pillar acts as a veto.

**Full matrix (all 10 combinations):**

| Ability | Aspiration | Leadership | Result |
|---------|------------|------------|--------|
| H       | H          | H          | **H**  |
| H       | H          | M          | **H**  |
| H       | H          | L          | **M**  | ← L blocks High |
| H       | M          | M          | **M**  |
| H       | M          | L          | **M**  |
| H       | L          | L          | **M**  | ← H blocks Low  |
| M       | M          | M          | **M**  |
| M       | M          | L          | **M**  |
| M       | L          | L          | **L**  |
| L       | L          | L          | **L**  |

---

### 3.3 Frontend Mirror — `calcOverallPotentiality` (frontend)

**File:** `frontend/src/utils/assessmentUtils.ts`

The same matrix logic is duplicated on the frontend so `CompletedSummary` can display the Overall Potentiality without an extra API call:

```typescript
export function calcOverallPotentiality(
  ability: RatingValue | null,
  aspiration: RatingValue | null,
  leadership: RatingValue | null,
): RatingValue | null {
  if (!ability || !aspiration || !leadership) return null;
  const ratings = [ability, aspiration, leadership];
  const h = ratings.filter(r => r === 'H').length;
  const l = ratings.filter(r => r === 'L').length;
  if (h >= 2 && l === 0) return 'H';
  if (l >= 2 && h === 0) return 'L';
  return 'M';
}
```

Returns `null` when any pillar rating is missing (assessment not yet completed), which prevents the Overall Potentiality card from rendering prematurely.

---

### 3.4 Dynamic Component Loading — `buildPillars` (frontend)

**File:** `frontend/src/utils/assessmentUtils.ts`

The assessment questions (component descriptions) can be customised by HQ Admin per role. This function merges DB overrides with the hardcoded defaults:

```typescript
export function buildPillars(dbComponents: AssessmentComponent[]): PillarDefinition[] {
  return ASSESSMENT_PILLARS.map(pillar => ({
    ...pillar,
    components: ([1, 2, 3] as const).map(num => {
      const found = dbComponents.find(
        c => c.pillar === pillar.key && c.component_number === num
      );
      return found ? found.description : pillar.components[num - 1];
    }),
  }));
}
```

**How it works:**
1. Start with the 3 hardcoded pillars from `assessmentContent.ts`.
2. For each of the 9 slots (3 pillars × 3 questions), look up whether the DB has an override for that exact `(pillar, component_number)` slot.
3. If a DB entry is found, use its `description`. Otherwise, fall back to the hardcoded string.

**Why this design?** The app remains fully functional even if the `assessment_components` table is empty — the hardcoded defaults act as a safety net. HQ Admin overrides only affect specific slots they explicitly set.

---

## 4. Assessment Workflow — State Machine

The assessment has four possible statuses that act as a one-way state machine:

```
not_started  →  pending_self  →  pending_supervisor  →  completed
```

| Status               | Who can act         | What happens                                      |
|----------------------|---------------------|---------------------------------------------------|
| `not_started`        | Appraisee           | Form is editable; no DB record exists yet         |
| `pending_self`       | Appraisee           | Form is editable; record exists but not submitted |
| `pending_supervisor` | Supervisor          | Appraisee form locked; supervisor form editable   |
| `completed`          | Read-only for all   | Pillar ratings and Overall Potentiality calculated |

**Transitions are enforced in the backend:**
- `self_submit` endpoint checks `status == 'pending_self'` before accepting data (HTTP 409 otherwise).
- `supervisor_submit` endpoint checks `status == 'pending_supervisor'` before accepting data.
- Neither transition can be reversed.

---

## 5. Backend API Endpoints — Potential Assessment

### POST `/api/potential-assessment/self-submit`

**What it does:** Appraisee submits their 9 self-ratings.

**Validation performed:**
- All 5 required fields present (`employee_id`, `supervisor_id`, `appraisee_role`, `cycle`, `items`).
- Exactly 9 items in the array.
- Each item's `self_rating` is one of `'H'`, `'M'`, `'L'`.
- Each item's `pillar` is one of `ability`, `aspiration`, `leadership`.
- Each item's `component_number` is 1, 2, or 3.
- `appraisee_role` is one of the 5 valid roles.
- Assessment status must be `pending_self` (HTTP 409 if already submitted).

**Writes to DB:**
- Upserts 9 rows in `potential_assessment_items` (only `self_rating` and `self_example` columns).
- Updates `potential_assessments.status` → `pending_supervisor`.
- Records `self_submitted_at` timestamp.

---

### POST `/api/potential-assessment/supervisor-submit`

**What it does:** Supervisor submits ratings + justifications, triggering final calculation.

**Validation performed:**
- Required fields: `assessment_id`, `supervisor_id`, `items`.
- Assessment must exist (HTTP 404 otherwise).
- Assessment status must be `pending_supervisor` (HTTP 409 otherwise).
- `supervisor_id` in the request must match `supervisor_id` on the assessment record (HTTP 403 otherwise).
- Each item's `supervisor_rating` must be `'H'`, `'M'`, or `'L'`.
- Each item's `supervisor_justification` must be non-empty.

**What happens after validation:**
1. Updates 9 rows in `potential_assessment_items` with supervisor ratings and justifications.
2. Fetches all 9 items back from DB.
3. Groups items by pillar → calls `calculate_pillar_rating` for each pillar → gets `overall_ability`, `overall_aspiration`, `overall_leadership`.
4. Calls `calculate_overall_potentiality` with the three pillar ratings → gets `talent_block` (the field name in DB; displayed as "Overall Potentiality").
5. Updates `potential_assessments` record with all four calculated values, status → `completed`, `supervisor_submitted_at`.

---

### GET `/api/assessment-components/merged?role=<role>`

**What it does:** Returns the 9 effective question descriptions for a given role, applying the override logic server-side.

```python
global_map = {(c['pillar'], c['component_number']): c for c in global_resp.data}
role_map   = {(c['pillar'], c['component_number']): c for c in role_resp.data}
# role_map wins on conflict
merged = {**global_map, **role_map}
```

Uses dictionary unpacking — Python's `{**a, **b}` means "merge a and b, b wins on duplicate keys". So role-specific entries overwrite global ones for the same slot.

---

## 6. Assessment Components — HQ Admin CRUD

**Table:** `assessment_components` in Supabase

**Scope values:**
- `global` — applies to all roles (unless a role-specific entry exists for the same slot).
- `role` — overrides global for one specific role only.

**Unique constraint** on the table: `(pillar, component_number, scope, assigned_role)` — prevents duplicate components for the same slot. The backend returns HTTP 400 if this constraint is violated.

---

## 7. Why Pure Functions Were Extracted

`calculate_pillar_rating` and `calculate_overall_potentiality` live in `calculations.py` (not `app.py`) for one reason: **testability**.

Flask requires a running app context and Supabase connection to test anything in `app.py`. By keeping the calculation logic as plain Python functions with no dependencies, the unit tests in `tests/test_calculations.py` can import and run them directly with `pytest` — no Flask setup, no database, no mocking.

The same principle applies on the frontend: `buildPillars` and `calcOverallPotentiality` live in `assessmentUtils.ts` (not inside a component) so they can be tested with Jest without mounting any React component.

---

## 8. Unit Tests

### Backend — `backend/tests/test_calculations.py`

Run with: `cd backend && pytest`

| Test Class                        | Tests | What is covered                                        |
|-----------------------------------|-------|--------------------------------------------------------|
| `TestCalculatePillarRating`       | 8     | All majority-rule cases including tie-breaking         |
| `TestCalculateOverallPotentiality`| 10    | All 10 matrix combinations from the specification PDF  |

### Frontend — `frontend/src/utils/__tests__/assessmentUtils.test.ts`

Run with: `cd frontend && npm test`

| Test Suite                | Tests | What is covered                                              |
|---------------------------|-------|--------------------------------------------------------------|
| `calcOverallPotentiality` | 13    | All matrix cases + null guard when inputs are missing        |
| `buildPillars`            | 5     | No override, single override, cross-pillar, full override, structure |

---

## 9. Why `upsert` Is Used for Self-Submit Items

```python
supabase.table('potential_assessment_items').upsert(
    { ... },
    on_conflict='assessment_id,pillar,component_number'
).execute()
```

`upsert` means "insert if not exists, update if exists". This handles the edge case where an employee starts filling the form, closes the browser, and returns — the 9 item rows may already exist from a previous partial save. Using `upsert` instead of separate insert/update logic keeps the code simple and idempotent (safe to call multiple times with the same data).

---

## 10. Quick Reference — Key Files

| File | Purpose |
|------|---------|
| `backend/calculations.py` | Pure rating calculation functions (no Flask/DB) |
| `backend/tests/test_calculations.py` | 18 pytest unit tests for calculations |
| `backend/app.py` (lines 1958–2290) | Potential assessment + components API routes |
| `frontend/src/utils/assessmentUtils.ts` | Frontend pure functions: buildPillars, calcOverallPotentiality |
| `frontend/src/utils/__tests__/assessmentUtils.test.ts` | 18 Jest unit tests for frontend utils |
| `frontend/src/components/potential-assessment/SelfAssessmentForm.tsx` | Appraisee self-rating form |
| `frontend/src/components/potential-assessment/SupervisorReviewForm.tsx` | Supervisor review form |
| `frontend/src/components/potential-assessment/CompletedSummary.tsx` | Read-only completed assessment view |
| `frontend/src/app/hq-admin/potential-assessment/components/page.tsx` | HQ Admin question management CRUD page |
| `frontend/src/services/potentialAssessmentApi.ts` | Axios API client for all assessment calls |
