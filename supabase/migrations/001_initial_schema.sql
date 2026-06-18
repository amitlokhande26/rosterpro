-- Roster & Labour Allocation - Initial Schema
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'viewer');
CREATE TYPE skill_type AS ENUM (
  'QA', 'Boxer', 'Depal', 'Labeller', 'Worker', 'Operator', 'Divider', 'Floater'
);
CREATE TYPE report_type AS ENUM ('weekly_roster', 'staffing_requirement', 'labour_summary');

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shifts (configurable by admin)
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Production lines
CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staffing templates per production line
CREATE TABLE staffing_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  position skill_type NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (production_line_id, position)
);

-- Employees
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  employee_number TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Employee skills
CREATE TABLE employee_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  skill skill_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, skill)
);

-- Production jobs
CREATE TABLE production_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_line_id UUID NOT NULL REFERENCES production_lines(id),
  product_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  start_time TIME NOT NULL,
  runtime_hours NUMERIC(6,2) NOT NULL CHECK (runtime_hours > 0),
  end_datetime TIMESTAMPTZ NOT NULL,
  notes TEXT,
  divider_required BOOLEAN NOT NULL DEFAULT FALSE,
  floater_required BOOLEAN NOT NULL DEFAULT FALSE,
  optional_resource_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_jobs_line ON production_jobs(production_line_id);
CREATE INDEX idx_production_jobs_dates ON production_jobs(start_date, end_datetime);

-- Job shift requirements (computed when job is saved)
CREATE TABLE job_shift_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_job_id UUID NOT NULL REFERENCES production_jobs(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_id UUID NOT NULL REFERENCES shifts(id),
  production_line_id UUID NOT NULL REFERENCES production_lines(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (production_job_id, shift_date, shift_id)
);

CREATE INDEX idx_job_shift_req_date ON job_shift_requirements(shift_date, shift_id);

-- Shift assignments (employee to position for a shift on a date)
CREATE TABLE shift_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_date DATE NOT NULL,
  shift_id UUID NOT NULL REFERENCES shifts(id),
  production_line_id UUID NOT NULL REFERENCES production_lines(id),
  position skill_type NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_date, shift_id, production_line_id, position),
  UNIQUE (shift_date, shift_id, employee_id)
);

CREATE INDEX idx_shift_assignments_date ON shift_assignments(shift_date, shift_id);

-- Reports metadata
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_type report_type NOT NULL,
  title TEXT NOT NULL,
  week_start DATE NOT NULL,
  generated_by UUID REFERENCES profiles(id),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helper: get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER production_lines_updated_at BEFORE UPDATE ON production_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER staffing_templates_updated_at BEFORE UPDATE ON staffing_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER production_jobs_updated_at BEFORE UPDATE ON production_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER shift_assignments_updated_at BEFORE UPDATE ON shift_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_shift_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (get_user_role() = 'admin');
CREATE POLICY "Admins can update profiles" ON profiles FOR UPDATE USING (get_user_role() = 'admin');

-- Shifts: all authenticated can read, admin can write
CREATE POLICY "Authenticated users can read shifts" ON shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage shifts" ON shifts FOR ALL USING (get_user_role() = 'admin');

-- Production lines
CREATE POLICY "Authenticated users can read lines" ON production_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage lines" ON production_lines FOR ALL USING (get_user_role() = 'admin');

-- Staffing templates
CREATE POLICY "Authenticated users can read templates" ON staffing_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage templates" ON staffing_templates FOR ALL USING (get_user_role() = 'admin');

-- Employees
CREATE POLICY "Authenticated users can read employees" ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage employees" ON employees FOR ALL USING (get_user_role() = 'admin');

-- Employee skills
CREATE POLICY "Authenticated users can read skills" ON employee_skills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage skills" ON employee_skills FOR ALL USING (get_user_role() = 'admin');

-- Production jobs
CREATE POLICY "Authenticated users can read jobs" ON production_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Supervisors and admins can manage jobs" ON production_jobs FOR ALL
  USING (get_user_role() IN ('admin', 'supervisor'));

-- Job shift requirements
CREATE POLICY "Authenticated users can read requirements" ON job_shift_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Supervisors and admins can manage requirements" ON job_shift_requirements FOR ALL
  USING (get_user_role() IN ('admin', 'supervisor'));

-- Shift assignments
CREATE POLICY "Authenticated users can read assignments" ON shift_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Supervisors and admins can manage assignments" ON shift_assignments FOR ALL
  USING (get_user_role() IN ('admin', 'supervisor'));

-- Reports
CREATE POLICY "Authenticated users can read reports" ON reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Supervisors and admins can create reports" ON reports FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'supervisor'));
CREATE POLICY "Admins can delete reports" ON reports FOR DELETE USING (get_user_role() = 'admin');

-- Seed default shifts
INSERT INTO shifts (name, start_time, end_time, sort_order) VALUES
  ('Night', '00:00:00', '08:00:00', 1),
  ('Day', '08:00:00', '16:00:00', 2),
  ('Afternoon', '16:00:00', '00:00:00', 3);

-- Seed default production lines
INSERT INTO production_lines (name, sort_order) VALUES
  ('Bottling Line 1', 1),
  ('Bottling Line 2', 2),
  ('Canning Line 1', 3),
  ('Canning Line 2', 4),
  ('Kegging Line', 5);

-- Seed staffing templates
INSERT INTO staffing_templates (production_line_id, position, quantity, is_required)
SELECT pl.id, t.position::skill_type, t.quantity, t.is_required
FROM production_lines pl
JOIN (VALUES
  ('Bottling Line 1', 'QA', 1, true),
  ('Bottling Line 1', 'Boxer', 1, true),
  ('Bottling Line 1', 'Depal', 1, true),
  ('Bottling Line 1', 'Labeller', 1, true),
  ('Bottling Line 1', 'Divider', 1, false),
  ('Bottling Line 2', 'QA', 1, true),
  ('Bottling Line 2', 'Boxer', 1, true),
  ('Bottling Line 2', 'Depal', 1, true),
  ('Bottling Line 2', 'Labeller', 1, true),
  ('Bottling Line 2', 'Divider', 1, false),
  ('Bottling Line 2', 'Floater', 1, false),
  ('Canning Line 1', 'Worker', 4, true),
  ('Canning Line 2', 'QA', 1, true),
  ('Canning Line 2', 'Worker', 1, true),
  ('Kegging Line', 'Operator', 2, true)
) AS t(line_name, position, quantity, is_required) ON pl.name = t.line_name;
