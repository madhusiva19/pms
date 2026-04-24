-- Seed: Departments, Sub-Departments, and Employees for Delhi Branch (IND-DL)
-- Fixed UUIDs are used so demo-mode IDs in auth-context.tsx can match them.
--
-- Dept UUIDs:     a0000001…  through  a0000006…
-- Sub-dept UUIDs: b0000001…  through  b0000004…
-- Employee UUIDs: c0000001…  through  c0000008…

-- ─────────────────────────────────────────────────────────────
-- Departments for Delhi Branch (IND-DL)
-- ─────────────────────────────────────────────────────────────

INSERT INTO departments (id, branch_id, name, code, total_employees)
SELECT 'a0000001-0000-0000-0000-000000000000'::uuid, b.id, 'Operations', 'OPS', 42
FROM branches b WHERE b.code = 'IND-DL'
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, branch_id, name, code, total_employees)
SELECT 'a0000002-0000-0000-0000-000000000000'::uuid, b.id, 'Finance & Accounts', 'FIN', 18
FROM branches b WHERE b.code = 'IND-DL'
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, branch_id, name, code, total_employees)
SELECT 'a0000003-0000-0000-0000-000000000000'::uuid, b.id, 'Human Resources', 'HR', 11
FROM branches b WHERE b.code = 'IND-DL'
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, branch_id, name, code, total_employees)
SELECT 'a0000004-0000-0000-0000-000000000000'::uuid, b.id, 'Sales & Marketing', 'SAL', 27
FROM branches b WHERE b.code = 'IND-DL'
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, branch_id, name, code, total_employees)
SELECT 'a0000005-0000-0000-0000-000000000000'::uuid, b.id, 'IT & Systems', 'ITS', 9
FROM branches b WHERE b.code = 'IND-DL'
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, branch_id, name, code, total_employees)
SELECT 'a0000006-0000-0000-0000-000000000000'::uuid, b.id, 'Customer Service', 'CS', 33
FROM branches b WHERE b.code = 'IND-DL'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Sub-Departments for Operations dept (a0000001-…)
-- ─────────────────────────────────────────────────────────────

INSERT INTO sub_departments (id, department_id, name, code, total_employees, sub_dept_admin_name)
VALUES
  ('b0000001-0000-0000-0000-000000000000'::uuid, 'a0000001-0000-0000-0000-000000000000'::uuid, 'Import Operations', 'IMP', 13, 'Raj Patel'),
  ('b0000002-0000-0000-0000-000000000000'::uuid, 'a0000001-0000-0000-0000-000000000000'::uuid, 'Export Operations', 'EXP', 12, 'Priya Sharma'),
  ('b0000003-0000-0000-0000-000000000000'::uuid, 'a0000001-0000-0000-0000-000000000000'::uuid, 'Ground Handling',   'GND',  8, 'Akash Verma'),
  ('b0000004-0000-0000-0000-000000000000'::uuid, 'a0000001-0000-0000-0000-000000000000'::uuid, 'Cargo Control',     'CGO',  2, 'Neha Gupta')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Employees for Import Operations (b0000001-…)
-- ─────────────────────────────────────────────────────────────

INSERT INTO employees (id, sub_department_id, full_name, employee_id, designation)
VALUES
  ('c0000001-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Manoj Kumar',    'DEL-001', 'Senior Executive'),
  ('c0000002-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Sunita Pillai',  'DEL-002', 'Executive'),
  ('c0000003-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Deepak Joshi',   'DEL-003', 'Senior Executive'),
  ('c0000004-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Ananya Roy',     'DEL-004', 'Supervisor'),
  ('c0000005-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Ranjit Mishra',  'DEL-005', 'Executive'),
  ('c0000006-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Lavanya Rao',    'DEL-006', 'Senior Executive'),
  ('c0000007-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Suresh Gaikwad', 'DEL-007', 'Executive'),
  ('c0000008-0000-0000-0000-000000000000'::uuid, 'b0000001-0000-0000-0000-000000000000'::uuid, 'Preeti Nair',    'DEL-008', 'Analyst')
ON CONFLICT (id) DO NOTHING;
