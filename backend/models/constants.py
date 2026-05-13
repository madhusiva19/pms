# ─────────────────────────────────────────────────────────────────────────────
# PMS CONSTANTS
# Centralised here so every service/util reads from one place.
# ─────────────────────────────────────────────────────────────────────────────

OBJECTIVE_SETTING_MONTHS = 12
GRACE_PERIOD_DAYS        = 15
PMS_START_MONTH          = 7
PMS_START_DAY            = 1
DEFAULT_MAX_SCORE        = 5

DESIGNATION_CA  = 1
DESIGNATION_BA  = 2
DESIGNATION_DA  = 3
DESIGNATION_SDA = 4

SCOPE_TO_DESIG = {
    "all_country_admins":  DESIGNATION_CA,
    "all_branch_admins":   DESIGNATION_BA,
    "all_dept_admins":     DESIGNATION_DA,
    "all_sub_dept_admins": DESIGNATION_SDA,
}
