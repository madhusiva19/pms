# PMS Backend

A Flask-based REST API backend for the Performance Management System (PMS), connected to Supabase as the database and authentication provider.

---

## Tech Stack

- **Python** — core language
- **Flask** — web framework
- **Supabase** — database and authentication
- **Flask-CORS** — cross-origin request handling
- **python-dotenv** — environment variable management

---

## Project Structure

backend/
  app.py              # Main Flask application and all API routes
  requirements.txt    # Python dependencies
  .env.example        # Environment variable template
  .env                # Your local environment variables (never committed)
  README.md           # This file

---

## Getting Started

### 1. Clone the repository

git clone https://github.com/madhusiva19/pms.git
cd pms/backend

### 2. Create a virtual environment (recommended)

python -m venv venv
venv\Scripts\activate

### 3. Install dependencies

pip install -r requirements.txt

### 4. Set up environment variables

copy .env.example .env

Then open .env and fill in your real values:

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
FLASK_ENV=development
LOCKED_ADMIN_UUID=your-admin-user-uuid-here

### 5. Run the application

python app.py

The server will start at http://localhost:5000

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| SUPABASE_URL | Your Supabase project URL | https://abc123.supabase.co |
| SUPABASE_KEY | Your Supabase anon public key | eyJhbGci... |
| FLASK_ENV | Flask environment mode | development or production |
| LOCKED_ADMIN_UUID | UUID of the locked admin user from Supabase Auth | xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx |

---

## API Endpoints

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/templates | Get all templates |
| GET | /api/templates/<id> | Get a single template with categories and objectives |
| PUT | /api/templates/<id>/update | Update template objectives |
| DELETE | /api/templates/<id>/objectives/<obj_id> | Delete an objective |

### Template Assignments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/templates/<id>/assignments | Get all users assigned to a template |
| POST | /api/templates/<id>/assign | Assign users to a template |

### Employees / Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/employees?search=<query> | Search users by name |
| GET | /api/employees/<user_id>/assignment | Get template assignment for a user |

### Performance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/performance/<user_id>/periods | Get all available periods for a user |
| GET | /api/performance/<user_id>/<year>/<period> | Get full performance breakdown for a user |
| GET | /api/performance/<user_id>/summary?year=<year> | Get period score summary for a user |

### Evaluator

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/evaluator/submit | Submit manual ratings for a user |
| GET | /api/evaluator/pending?user_id=<id>&year=<year>&period=<period> | Get pending manual evaluations |

### Sync and Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/sync/actuals | Sync ERP actuals and calculate scores |
| POST | /api/admin/backfill-scores | Recalculate all ratings and scores |

### KPI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/kpi-scales | Get all KPI scale definitions |

---

## KPI Rating Engine

The backend includes a built-in KPI rating calculation engine that supports three scale types:

**Interpolated**
Linearly maps a value between a lower limit (ll) and upper limit (ul) to a 1 to 5 rating.
Supports the following input types:
- achievement_pct — calculates actual divided by target as a percentage
- raw_actual_x100 — multiplies the raw actual value by 100
- raw_actual — uses the raw actual value directly

**Bracket**
Assigns a rating based on predefined value ranges stored in the bracket_rules table.
Used for metrics like DPAM Operations Score and WIP where ratings fall into fixed bands.

**Manual**
Uses a manually entered rating between 1 and 5 submitted by an evaluator.
Used for subjective KPIs like HOD Evaluation, Complaints, and Idea Generation.

---

## Database Setup

1. Create a Supabase project at https://supabase.com
2. Run the seed file to set up all tables and initial data:
   - Go to Supabase Dashboard
   - Open the SQL Editor
   - Copy and run the contents of the seed SQL file
3. Copy your project URL and anon key into your .env file
4. Create your admin user in Supabase Auth and add their UUID to .env as LOCKED_ADMIN_UUID

---

## Key Design Decisions

- All user references use UUID strings from Supabase Auth
- There is no separate employees table — users come from Supabase Auth and profiles
- The LOCKED_ADMIN_UUID user cannot be reassigned to a different template from the assignment page
- Scores are automatically recalculated and stored whenever actuals are synced or manual ratings are submitted
- The performance_records table uses a unique constraint on user_id, objective_id, period, and year to prevent duplicate entries

---

## Contributing

1. Create a new branch from main
2. Make your changes with small focused commits
3. Use clear commit messages following this format:
   - feat: for new features
   - fix: for bug fixes
   - chore: for maintenance tasks
   - docs: for documentation updates
4. Push your branch and open a Pull Request to main

---

## Team

Performance Management System — Group Project