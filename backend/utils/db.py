"""
utils/db.py
-----------
Supabase client initialisation and shared application constants.

Import `supabase` and `LOCKED_ADMIN_UUID` from here everywhere in the
codebase — never call `create_client` a second time.
"""

import os

from dotenv import load_dotenv
from supabase import create_client

# Load environment variables from .env before anything else runs
load_dotenv()

# ---------------------------------------------------------------------------
# Supabase client  (application-wide singleton)
# ---------------------------------------------------------------------------

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

# UUID of the top-level admin whose template assignment must never be
# overwritten by subordinate managers.
LOCKED_ADMIN_UUID = os.getenv(
    "LOCKED_ADMIN_UUID",
    "00000000-0000-0000-0000-000000000001",
)
