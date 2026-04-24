-- Migration: Add Departments, Sub-Departments, and Employees tables
-- Also updates users table to support all roles
-- Date: 2026-04-22

-- ─────────────────────────────────────────────────────────────
-- 1. Update users table to support all roles
-- ─────────────────────────────────────────────────────────────

-- Drop old role constraint and add new one covering all roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('group_admin', 'super_admin', 'branch_admin', 'dept_admin', 'sub_dept_admin', 'employee'));

-- Add new columns to users for deeper role assignments
ALTER TABLE users ADD COLUMN IF NOT EXISTS iata_branch_code VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id    UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_department_id UUID;

-- ─────────────────────────────────────────────────────────────
-- 2. Departments table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id        UUID REFERENCES branches(id) NOT NULL,
    name             VARCHAR(100) NOT NULL,
    code             VARCHAR(20)  NOT NULL,
    total_employees  INTEGER      DEFAULT 0,
    dept_admin_name  VARCHAR(150),
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_departments_branch ON departments(branch_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Sub-Departments table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_departments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    department_id       UUID REFERENCES departments(id) NOT NULL,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(20)  NOT NULL,
    total_employees     INTEGER      DEFAULT 0,
    sub_dept_admin_name VARCHAR(150),
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sub_departments_dept ON sub_departments(department_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Employees table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_department_id  UUID REFERENCES sub_departments(id) NOT NULL,
    full_name          VARCHAR(150) NOT NULL,
    employee_id        VARCHAR(50)  UNIQUE NOT NULL,
    designation        VARCHAR(100),
    email              VARCHAR(150),
    evaluation_status  VARCHAR(50)  DEFAULT 'not_started'
        CHECK (evaluation_status IN ('not_started', 'objectives_set', 'mid_year_done', 'year_end_done')),
    avg_score          DECIMAL(3,2),
    created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_sub_dept ON employees(sub_department_id);
