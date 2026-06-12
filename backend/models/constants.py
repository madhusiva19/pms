# ─────────────────────────────────────────────────────────────────────────────
# PMS CONSTANTS
# Centralised here so every service/util reads from one place.
# ─────────────────────────────────────────────────────────────────────────────

# ── Cycle timing ──────────────────────────────────────────────────────────────
PMS_START_MONTH             = 7     # July  → cycle starts on July 1
PMS_START_DAY               = 1
CYCLE_DURATION_MONTHS       = 12    # July 1 (year-1)  →  June 30 (year)

# ── Objective setting window ───────────────────────────────────────────────────
OBJECTIVE_SETTING_MONTHS            = 1    # ends July 30  (1 month - 1 day)
OBJECTIVE_SETTING_START_OFFSET_DAYS = 0    # same day as pms_start  → July 1
OBJECTIVE_SETTING_DURATION_MONTHS   = 1

# ── Review milestones ──────────────────────────────────────────────────────────
MID_YEAR_REVIEW_MONTH = 12   # December 31
MID_YEAR_REVIEW_DAY   = 31

YEAR_END_REVIEW_MONTH = 6    # June 30
YEAR_END_REVIEW_DAY   = 30

# ── Grace period ───────────────────────────────────────────────────────────────
GRACE_PERIOD_DAYS = 15       # grace_period_end = objective_setting_end + 15
                             # e.g. 2025-07-30 + 15 = 2025-08-14

# ── Scoring ────────────────────────────────────────────────────────────────────
DEFAULT_MAX_SCORE = 5

# ── Designation IDs ───────────────────────────────────────────────────────────
DESIGNATION_CA  = 1   # Country Admin
DESIGNATION_BA  = 2   # Branch Admin
DESIGNATION_DA  = 3   # Department Admin
DESIGNATION_SDA = 4   # Sub-Department Admin

SCOPE_TO_DESIG = {
    "all_country_admins":  DESIGNATION_CA,
    "all_branch_admins":   DESIGNATION_BA,
    "all_dept_admins":     DESIGNATION_DA,
    "all_sub_dept_admins": DESIGNATION_SDA,
}
