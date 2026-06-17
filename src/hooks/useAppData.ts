import { useCallback, useEffect, useState } from 'react';
import { dataService } from '@/services/dataService';
import type {
  EmployeeWithSkills,
  JobShiftRequirement,
  ProductionJob,
  ProductionLine,
  Shift,
  ShiftAssignment,
  StaffingTemplate,
} from '@/lib/types';

export function useAppData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [templates, setTemplates] = useState<StaffingTemplate[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [requirements, setRequirements] = useState<JobShiftRequirement[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, l, t, e, j, r, a] = await Promise.all([
        dataService.getShifts(),
        dataService.getProductionLines(),
        dataService.getStaffingTemplates(),
        dataService.getEmployees(),
        dataService.getJobs(),
        dataService.getJobShiftRequirements(),
        dataService.getAssignments(),
      ]);
      setShifts(s);
      setLines(l);
      setTemplates(t);
      setEmployees(e);
      setJobs(j);
      setRequirements(r);
      setAssignments(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    loading,
    error,
    shifts,
    lines,
    templates,
    employees,
    jobs,
    requirements,
    assignments,
    refresh,
    setJobs,
    setRequirements,
    setAssignments,
  };
}
