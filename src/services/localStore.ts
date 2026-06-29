import { uuidv4 } from './uuid';
import type {
  Employee,
  EmployeeSkill,
  EmployeeWithSkills,
  JobShiftRequirement,
  ProductionJob,
  ProductionJobInput,
  ProductionLine,
  Profile,
  Shift,
  ShiftAssignment,
  StaffingTemplate,
  UserRole,
} from '@/lib/types';
import {
  calculateEndDateTime,
  getShiftsTouchedByJob,
  isCanningLine,
} from '@/services/calculationEngine';
import { resolveJobQuantities } from '@/services/quantityService';

const STORAGE_KEY = 'roster_app_data';

interface StoredData {
  profile: Profile | null;
  shifts: Shift[];
  production_lines: ProductionLine[];
  staffing_templates: StaffingTemplate[];
  employees: Employee[];
  employee_skills: EmployeeSkill[];
  production_jobs: ProductionJob[];
  job_shift_requirements: JobShiftRequirement[];
  shift_assignments: ShiftAssignment[];
}

function now(): string {
  return new Date().toISOString();
}

function defaultShifts(): Shift[] {
  const t = now();
  return [
    { id: uuidv4(), name: 'Night', start_time: '00:00:00', end_time: '08:00:00', sort_order: 1, created_at: t, updated_at: t },
    { id: uuidv4(), name: 'Day', start_time: '08:00:00', end_time: '16:00:00', sort_order: 2, created_at: t, updated_at: t },
    { id: uuidv4(), name: 'Afternoon', start_time: '16:00:00', end_time: '00:00:00', sort_order: 3, created_at: t, updated_at: t },
  ];
}

function defaultLines(): ProductionLine[] {
  const t = now();
  const names = ['Bottling Line 1', 'Bottling Line 2', 'Canning Line 1', 'Canning Line 2', 'Kegging Line'];
  return names.map((name, i) => ({
    id: uuidv4(),
    name,
    is_active: true,
    sort_order: i + 1,
    created_at: t,
    updated_at: t,
  }));
}

function defaultTemplates(lines: ProductionLine[]): StaffingTemplate[] {
  const t = now();
  const templates: Array<{ line: string; position: StaffingTemplate['position']; qty: number; required: boolean }> = [
    { line: 'Bottling Line 1', position: 'QA', qty: 1, required: true },
    { line: 'Bottling Line 1', position: 'Boxer', qty: 1, required: true },
    { line: 'Bottling Line 1', position: 'Depal', qty: 1, required: true },
    { line: 'Bottling Line 1', position: 'Labeller', qty: 1, required: true },
    { line: 'Bottling Line 1', position: 'Divider', qty: 1, required: false },
    { line: 'Bottling Line 2', position: 'QA', qty: 1, required: true },
    { line: 'Bottling Line 2', position: 'Boxer', qty: 1, required: true },
    { line: 'Bottling Line 2', position: 'Depal', qty: 1, required: true },
    { line: 'Bottling Line 2', position: 'Labeller', qty: 1, required: true },
    { line: 'Bottling Line 2', position: 'Divider', qty: 1, required: false },
    { line: 'Bottling Line 2', position: 'Floater', qty: 1, required: false },
    { line: 'Canning Line 1', position: 'Worker', qty: 4, required: true },
    { line: 'Canning Line 2', position: 'QA', qty: 1, required: true },
    { line: 'Canning Line 2', position: 'Worker', qty: 1, required: true },
    { line: 'Kegging Line', position: 'Operator', qty: 2, required: true },
  ];

  return templates.map((tmpl) => {
    const line = lines.find((l) => l.name === tmpl.line)!;
    return {
      id: uuidv4(),
      production_line_id: line.id,
      position: tmpl.position,
      quantity: tmpl.qty,
      is_required: tmpl.required,
      created_at: t,
      updated_at: t,
    };
  });
}

function defaultEmployees(): { employees: Employee[]; skills: EmployeeSkill[] } {
  const t = now();
  const sample = [
    { first: 'John', last: 'Smith', num: 'E001', skills: ['QA'] as const },
    { first: 'Sarah', last: 'Johnson', num: 'E002', skills: ['Boxer', 'Labeller'] as const },
    { first: 'Mike', last: 'Williams', num: 'E003', skills: ['Depal', 'Boxer'] as const },
    { first: 'David', last: 'Brown', num: 'E004', skills: ['Labeller', 'QA'] as const },
    { first: 'Emma', last: 'Davis', num: 'E005', skills: ['Worker'] as const },
    { first: 'James', last: 'Wilson', num: 'E006', skills: ['Worker', 'Operator'] as const },
    { first: 'Lisa', last: 'Taylor', num: 'E007', skills: ['Operator', 'QA'] as const },
    { first: 'Tom', last: 'Anderson', num: 'E008', skills: ['Divider', 'Floater', 'Worker'] as const },
  ];

  const employees: Employee[] = [];
  const skills: EmployeeSkill[] = [];

  for (const s of sample) {
    const emp: Employee = {
      id: uuidv4(),
      first_name: s.first,
      last_name: s.last,
      employee_number: s.num,
      is_active: true,
      created_at: t,
      updated_at: t,
    };
    employees.push(emp);
    for (const skill of s.skills) {
      skills.push({
        id: uuidv4(),
        employee_id: emp.id,
        skill,
        created_at: t,
      });
    }
  }

  return { employees, skills };
}

function initData(): StoredData {
  const lines = defaultLines();
  const shifts = defaultShifts();
  const { employees, skills } = defaultEmployees();
  return {
    profile: null,
    shifts,
    production_lines: lines,
    staffing_templates: defaultTemplates(lines),
    employees,
    employee_skills: skills,
    production_jobs: [],
    job_shift_requirements: [],
    shift_assignments: [],
  };
}

function migrateData(data: StoredData): StoredData {
  const line2 = data.production_lines.find((l) => l.name === 'Bottling Line 2');
  if (line2) {
    const hasDivider = data.staffing_templates.some(
      (t) => t.production_line_id === line2.id && t.position === 'Divider',
    );
    if (!hasDivider) {
      const t = now();
      data.staffing_templates.push({
        id: uuidv4(),
        production_line_id: line2.id,
        position: 'Divider',
        quantity: 1,
        is_required: false,
        created_at: t,
        updated_at: t,
      });
      save(data);
    }
  }

  let migrated = false;
  for (const job of data.production_jobs) {
    if (job.quantity_ordered === undefined) {
      job.quantity_ordered = null;
      job.outer_pack_size = null;
      job.outer_pack_label = null;
      job.total_quantity = null;
      migrated = true;
    }
  }
  if (migrated) save(data);

  let canningMigrated = false;
  for (const job of data.production_jobs) {
    const line = data.production_lines.find((l) => l.id === job.production_line_id);
    if (!line || !isCanningLine(line.name)) continue;
    const endDt = calculateEndDateTime(
      job.start_date,
      job.start_time.substring(0, 5),
      job.runtime_hours,
      line.name,
    );
    if (job.end_datetime !== endDt.toISOString()) {
      job.end_datetime = endDt.toISOString();
      canningMigrated = true;
    }
  }
  if (canningMigrated) {
    data.job_shift_requirements = [];
    for (const job of data.production_jobs) {
      const line = data.production_lines.find((l) => l.id === job.production_line_id);
      const touches = getShiftsTouchedByJob(
        job.start_date,
        job.start_time.substring(0, 5),
        job.runtime_hours,
        data.shifts,
        line?.name,
      );
      for (const touch of touches) {
        data.job_shift_requirements.push({
          id: uuidv4(),
          production_job_id: job.id,
          shift_date: touch.shift_date,
          shift_id: touch.shift_id,
          production_line_id: job.production_line_id,
          created_at: now(),
        });
      }
    }
    save(data);
  }

  return data;
}

function load(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateData(JSON.parse(raw) as StoredData);
  } catch {
    /* ignore */
  }
  const data = initData();
  save(data);
  return data;
}

function save(data: StoredData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export class LocalDataStore {
  private data: StoredData;

  constructor() {
    this.data = load();
  }

  getProfile(): Profile | null {
    return this.data.profile;
  }

  login(email: string, _password: string, role: UserRole = 'supervisor'): Profile {
    const inferredRole: UserRole = email.includes('admin') ? 'admin' : role;
    const profile: Profile = {
      id: uuidv4(),
      email,
      full_name: email.split('@')[0],
      role: inferredRole,
      created_at: now(),
      updated_at: now(),
    };
    this.data.profile = profile;
    save(this.data);
    return profile;
  }

  logout(): void {
    this.data.profile = null;
    save(this.data);
  }

  getShifts(): Shift[] {
    return [...this.data.shifts].sort((a, b) => a.sort_order - b.sort_order);
  }

  updateShift(id: string, updates: Partial<Shift>): Shift {
    const idx = this.data.shifts.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Shift not found');
    this.data.shifts[idx] = { ...this.data.shifts[idx], ...updates, updated_at: now() };
    save(this.data);
    return this.data.shifts[idx];
  }

  getProductionLines(): ProductionLine[] {
    return [...this.data.production_lines].sort((a, b) => a.sort_order - b.sort_order);
  }

  createProductionLine(name: string): ProductionLine {
    const line: ProductionLine = {
      id: uuidv4(),
      name,
      is_active: true,
      sort_order: this.data.production_lines.length + 1,
      created_at: now(),
      updated_at: now(),
    };
    this.data.production_lines.push(line);
    save(this.data);
    return line;
  }

  updateProductionLine(id: string, updates: Partial<ProductionLine>): ProductionLine {
    const idx = this.data.production_lines.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error('Line not found');
    this.data.production_lines[idx] = { ...this.data.production_lines[idx], ...updates, updated_at: now() };
    save(this.data);
    return this.data.production_lines[idx];
  }

  getStaffingTemplates(): StaffingTemplate[] {
    return [...this.data.staffing_templates];
  }

  upsertStaffingTemplate(template: Omit<StaffingTemplate, 'id' | 'created_at' | 'updated_at'> & { id?: string }): StaffingTemplate {
    const t = now();
    if (template.id) {
      const idx = this.data.staffing_templates.findIndex((s) => s.id === template.id);
      if (idx !== -1) {
        this.data.staffing_templates[idx] = { ...this.data.staffing_templates[idx], ...template, updated_at: t };
        save(this.data);
        return this.data.staffing_templates[idx];
      }
    }
    const newTemplate: StaffingTemplate = {
      id: uuidv4(),
      production_line_id: template.production_line_id,
      position: template.position,
      quantity: template.quantity,
      is_required: template.is_required,
      created_at: t,
      updated_at: t,
    };
    this.data.staffing_templates.push(newTemplate);
    save(this.data);
    return newTemplate;
  }

  deleteStaffingTemplate(id: string): void {
    this.data.staffing_templates = this.data.staffing_templates.filter((t) => t.id !== id);
    save(this.data);
  }

  getEmployees(): EmployeeWithSkills[] {
    return this.data.employees.map((e) => ({
      ...e,
      skills: this.data.employee_skills
        .filter((s) => s.employee_id === e.id)
        .map((s) => s.skill),
    }));
  }

  createEmployee(emp: Omit<Employee, 'id' | 'created_at' | 'updated_at'>, skills: EmployeeSkill['skill'][]): EmployeeWithSkills {
    const t = now();
    const employee: Employee = { ...emp, id: uuidv4(), created_at: t, updated_at: t };
    this.data.employees.push(employee);
    for (const skill of skills) {
      this.data.employee_skills.push({
        id: uuidv4(),
        employee_id: employee.id,
        skill,
        created_at: t,
      });
    }
    save(this.data);
    return { ...employee, skills };
  }

  updateEmployee(id: string, updates: Partial<Employee>, skills?: EmployeeSkill['skill'][]): EmployeeWithSkills {
    const idx = this.data.employees.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Employee not found');
    this.data.employees[idx] = { ...this.data.employees[idx], ...updates, updated_at: now() };
    if (skills) {
      this.data.employee_skills = this.data.employee_skills.filter((s) => s.employee_id !== id);
      for (const skill of skills) {
        this.data.employee_skills.push({
          id: uuidv4(),
          employee_id: id,
          skill,
          created_at: now(),
        });
      }
    }
    save(this.data);
    return this.getEmployees().find((e) => e.id === id)!;
  }

  getJobs(): ProductionJob[] {
    return [...this.data.production_jobs];
  }

  createJob(input: ProductionJobInput): ProductionJob {
    const t = now();
    const line = this.data.production_lines.find((l) => l.id === input.production_line_id);
    const lineName = line?.name;
    const endDt = calculateEndDateTime(
      input.start_date,
      input.start_time,
      input.runtime_hours,
      lineName,
    );
    const quantities = resolveJobQuantities(lineName ?? '', input);
    const job: ProductionJob = {
      id: uuidv4(),
      production_line_id: input.production_line_id,
      product_name: input.product_name,
      start_date: input.start_date,
      start_time: input.start_time.length === 5 ? `${input.start_time}:00` : input.start_time,
      runtime_hours: input.runtime_hours,
      end_datetime: endDt.toISOString(),
      notes: input.notes ?? null,
      divider_required: input.divider_required ?? false,
      floater_required: input.floater_required ?? false,
      optional_resource_reason: input.optional_resource_reason ?? null,
      quantity_ordered: quantities.quantity_ordered,
      outer_pack_size: quantities.outer_pack_size,
      outer_pack_label: quantities.outer_pack_label,
      total_quantity: quantities.total_quantity,
      created_by: this.data.profile?.id ?? null,
      created_at: t,
      updated_at: t,
    };
    this.data.production_jobs.push(job);
    this.recomputeJobRequirements(job);
    save(this.data);
    return job;
  }

  updateJob(id: string, input: Partial<ProductionJobInput>): ProductionJob {
    const idx = this.data.production_jobs.findIndex((j) => j.id === id);
    if (idx === -1) throw new Error('Job not found');
    const existing = this.data.production_jobs[idx];
    const merged = { ...existing, ...input };
    const line = this.data.production_lines.find((l) => l.id === merged.production_line_id);
    if (input.start_date || input.start_time || input.runtime_hours || input.production_line_id) {
      const endDt = calculateEndDateTime(
        merged.start_date,
        merged.start_time.substring(0, 5),
        merged.runtime_hours,
        line?.name,
      );
      merged.end_datetime = endDt.toISOString();
    }
    const quantities = resolveJobQuantities(line?.name ?? '', merged);
    merged.quantity_ordered = quantities.quantity_ordered;
    merged.outer_pack_size = quantities.outer_pack_size;
    merged.outer_pack_label = quantities.outer_pack_label;
    merged.total_quantity = quantities.total_quantity;
    merged.updated_at = now();
    this.data.production_jobs[idx] = merged as ProductionJob;
    this.data.job_shift_requirements = this.data.job_shift_requirements.filter(
      (r) => r.production_job_id !== id,
    );
    this.recomputeJobRequirements(this.data.production_jobs[idx]);
    save(this.data);
    return this.data.production_jobs[idx];
  }

  deleteJob(id: string): void {
    this.data.production_jobs = this.data.production_jobs.filter((j) => j.id !== id);
    this.data.job_shift_requirements = this.data.job_shift_requirements.filter(
      (r) => r.production_job_id !== id,
    );
    save(this.data);
  }

  private recomputeJobRequirements(job: ProductionJob): void {
    const line = this.data.production_lines.find((l) => l.id === job.production_line_id);
    const touches = getShiftsTouchedByJob(
      job.start_date,
      job.start_time.substring(0, 5),
      job.runtime_hours,
      this.data.shifts,
      line?.name,
    );
    for (const touch of touches) {
      this.data.job_shift_requirements.push({
        id: uuidv4(),
        production_job_id: job.id,
        shift_date: touch.shift_date,
        shift_id: touch.shift_id,
        production_line_id: job.production_line_id,
        created_at: now(),
      });
    }
  }

  getJobShiftRequirements(): JobShiftRequirement[] {
    return [...this.data.job_shift_requirements];
  }

  getAssignments(): ShiftAssignment[] {
    return [...this.data.shift_assignments];
  }

  createAssignment(
    assignment: Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at' | 'created_by'>,
  ): ShiftAssignment {
    const duplicate = this.data.shift_assignments.find(
      (a) =>
        a.shift_date === assignment.shift_date &&
        a.shift_id === assignment.shift_id &&
        a.employee_id === assignment.employee_id,
    );
    if (duplicate) {
      throw new Error('Employee is already assigned to another position in this shift');
    }

    const positionTaken = this.data.shift_assignments.find(
      (a) =>
        a.shift_date === assignment.shift_date &&
        a.shift_id === assignment.shift_id &&
        a.production_line_id === assignment.production_line_id &&
        a.position === assignment.position,
    );
    if (positionTaken) {
      this.data.shift_assignments = this.data.shift_assignments.filter(
        (a) => a.id !== positionTaken.id,
      );
    }

    const t = now();
    const newAssignment: ShiftAssignment = {
      ...assignment,
      id: uuidv4(),
      created_by: this.data.profile?.id ?? null,
      created_at: t,
      updated_at: t,
    };
    this.data.shift_assignments.push(newAssignment);
    save(this.data);
    return newAssignment;
  }

  deleteAssignment(id: string): void {
    this.data.shift_assignments = this.data.shift_assignments.filter((a) => a.id !== id);
    save(this.data);
  }

  /** Clear production schedule and assignments — keeps employees, lines, and config */
  resetRoster(): void {
    this.data.production_jobs = [];
    this.data.job_shift_requirements = [];
    this.data.shift_assignments = [];
    save(this.data);
  }

  /** Full factory reset — restores all defaults */
  resetAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.data = initData();
    save(this.data);
  }

  reload(): void {
    this.data = load();
  }
}

export const localStore = new LocalDataStore();
