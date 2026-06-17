import { localStore } from './localStore';
import type {
  Employee,
  EmployeeWithSkills,
  JobShiftRequirement,
  ProductionJob,
  ProductionJobInput,
  ProductionLine,
  Shift,
  ShiftAssignment,
  SkillType,
  StaffingTemplate,
} from '@/lib/types';

export const dataService = {
  getShifts: (): Promise<Shift[]> => Promise.resolve(localStore.getShifts()),
  updateShift: (id: string, updates: Partial<Shift>): Promise<Shift> =>
    Promise.resolve(localStore.updateShift(id, updates)),

  getProductionLines: (): Promise<ProductionLine[]> => Promise.resolve(localStore.getProductionLines()),
  createProductionLine: (name: string): Promise<ProductionLine> =>
    Promise.resolve(localStore.createProductionLine(name)),
  updateProductionLine: (id: string, updates: Partial<ProductionLine>): Promise<ProductionLine> =>
    Promise.resolve(localStore.updateProductionLine(id, updates)),

  getStaffingTemplates: (): Promise<StaffingTemplate[]> =>
    Promise.resolve(localStore.getStaffingTemplates()),
  upsertStaffingTemplate: (
    template: Omit<StaffingTemplate, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): Promise<StaffingTemplate> => Promise.resolve(localStore.upsertStaffingTemplate(template)),
  deleteStaffingTemplate: (id: string): Promise<void> =>
    Promise.resolve(localStore.deleteStaffingTemplate(id)),

  getEmployees: (): Promise<EmployeeWithSkills[]> => Promise.resolve(localStore.getEmployees()),
  createEmployee: (
    emp: Omit<Employee, 'id' | 'created_at' | 'updated_at'>,
    skills: SkillType[],
  ): Promise<EmployeeWithSkills> => Promise.resolve(localStore.createEmployee(emp, skills)),
  updateEmployee: (
    id: string,
    updates: Partial<Employee>,
    skills?: SkillType[],
  ): Promise<EmployeeWithSkills> => Promise.resolve(localStore.updateEmployee(id, updates, skills)),

  getJobs: (): Promise<ProductionJob[]> => Promise.resolve(localStore.getJobs()),
  createJob: (input: ProductionJobInput): Promise<ProductionJob> =>
    Promise.resolve(localStore.createJob(input)),
  updateJob: (id: string, input: Partial<ProductionJobInput>): Promise<ProductionJob> =>
    Promise.resolve(localStore.updateJob(id, input)),
  deleteJob: (id: string): Promise<void> => Promise.resolve(localStore.deleteJob(id)),

  getJobShiftRequirements: (): Promise<JobShiftRequirement[]> =>
    Promise.resolve(localStore.getJobShiftRequirements()),

  getAssignments: (): Promise<ShiftAssignment[]> => Promise.resolve(localStore.getAssignments()),
  createAssignment: (
    assignment: Omit<ShiftAssignment, 'id' | 'created_at' | 'updated_at' | 'created_by'>,
  ): Promise<ShiftAssignment> => Promise.resolve(localStore.createAssignment(assignment)),
  deleteAssignment: (id: string): Promise<void> => Promise.resolve(localStore.deleteAssignment(id)),

  resetRoster: (): Promise<void> => Promise.resolve(localStore.resetRoster()),
  resetAll: (): Promise<void> => Promise.resolve(localStore.resetAll()),
};
