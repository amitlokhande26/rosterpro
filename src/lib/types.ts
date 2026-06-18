export type UserRole = 'admin' | 'supervisor' | 'viewer';

export type SkillType =
  | 'QA'
  | 'Boxer'
  | 'Depal'
  | 'Labeller'
  | 'Worker'
  | 'Operator'
  | 'Divider'
  | 'Floater';

export type ReportType = 'weekly_roster' | 'staffing_requirement' | 'labour_summary';

export type RosterCellStatus = 'production' | 'no_production' | 'incomplete' | 'understaffed';

export const ALL_SKILLS: SkillType[] = [
  'QA',
  'Boxer',
  'Depal',
  'Labeller',
  'Worker',
  'Operator',
  'Divider',
  'Floater',
];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionLine {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface StaffingTemplate {
  id: string;
  production_line_id: string;
  position: SkillType;
  quantity: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeSkill {
  id: string;
  employee_id: string;
  skill: SkillType;
  created_at: string;
}

export interface ProductionJob {
  id: string;
  production_line_id: string;
  product_name: string;
  start_date: string;
  start_time: string;
  runtime_hours: number;
  end_datetime: string;
  notes: string | null;
  divider_required: boolean;
  floater_required: boolean;
  optional_resource_reason: string | null;
  quantity_ordered: number | null;
  outer_pack_size: number | null;
  outer_pack_label: string | null;
  total_quantity: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobShiftRequirement {
  id: string;
  production_job_id: string;
  shift_date: string;
  shift_id: string;
  production_line_id: string;
  created_at: string;
}

export interface ShiftAssignment {
  id: string;
  shift_date: string;
  shift_id: string;
  production_line_id: string;
  position: SkillType;
  employee_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  report_type: ReportType;
  title: string;
  week_start: string;
  generated_by: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface ProductionJobInput {
  production_line_id: string;
  product_name: string;
  start_date: string;
  start_time: string;
  runtime_hours: number;
  notes?: string;
  divider_required?: boolean;
  floater_required?: boolean;
  optional_resource_reason?: string;
  quantity_ordered?: number | null;
  outer_pack_size?: number | null;
  outer_pack_label?: string | null;
  total_quantity?: number | null;
}

export interface ShiftTouch {
  shift_date: string;
  shift_id: string;
  shift_name: string;
}

export interface PositionRequirement {
  position: SkillType;
  quantity: number;
  production_line_id: string;
  production_line_name: string;
}

export interface ShiftStaffingSummary {
  shift_date: string;
  shift_id: string;
  shift_name: string;
  running_lines: string[];
  required_staff: Record<SkillType, number>;
  total_required: number;
  assigned: number;
  vacancies: number;
  positions: PositionRequirement[];
  status: RosterCellStatus;
}

export interface ContinuousRun {
  production_line_id: string;
  production_line_name: string;
  start: string;
  end: string;
  duration_hours: number;
  job_ids: string[];
}

export interface ChangeoverEvent {
  production_line_id: string;
  production_line_name: string;
  shift_date: string;
  shift_name: string;
  count: number;
}

export interface IdleShift {
  shift_date: string;
  shift_id: string;
  shift_name: string;
  recommendations: string[];
}

export interface DashboardMetrics {
  total_running_hours: number;
  total_jobs: number;
  active_lines: number;
  required_staff: number;
  assigned_staff: number;
  unfilled_positions: number;
  continuous_runs: ContinuousRun[];
  changeovers: ChangeoverEvent[];
  idle_shifts: IdleShift[];
}

export interface OcrExtractedData {
  production_line: string;
  product_name: string;
  start_date: string;
  start_time: string;
  runtime_hours: number;
  raw_text: string;
  confidence: number;
}

export interface EmployeeWithSkills extends Employee {
  skills: SkillType[];
}

export interface RosterCell {
  shift_date: string;
  shift_id: string;
  shift_name: string;
  status: RosterCellStatus;
  running_lines: string[];
  staffing: ShiftStaffingSummary | null;
  assignments: Array<{
    line_name: string;
    position: SkillType;
    employee_name: string;
  }>;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      shifts: { Row: Shift; Insert: Partial<Shift>; Update: Partial<Shift> };
      production_lines: { Row: ProductionLine; Insert: Partial<ProductionLine>; Update: Partial<ProductionLine> };
      staffing_templates: { Row: StaffingTemplate; Insert: Partial<StaffingTemplate>; Update: Partial<StaffingTemplate> };
      employees: { Row: Employee; Insert: Partial<Employee>; Update: Partial<Employee> };
      employee_skills: { Row: EmployeeSkill; Insert: Partial<EmployeeSkill>; Update: Partial<EmployeeSkill> };
      production_jobs: { Row: ProductionJob; Insert: Partial<ProductionJob>; Update: Partial<ProductionJob> };
      job_shift_requirements: { Row: JobShiftRequirement; Insert: Partial<JobShiftRequirement>; Update: Partial<JobShiftRequirement> };
      shift_assignments: { Row: ShiftAssignment; Insert: Partial<ShiftAssignment>; Update: Partial<ShiftAssignment> };
      reports: { Row: Report; Insert: Partial<Report>; Update: Partial<Report> };
    };
  };
}
