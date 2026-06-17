import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, Button, LoadingSpinner, Badge } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import { dataService } from '@/services/dataService';
import {
  aggregateStaffingRequirements,
  applyAssignmentsToSummaries,
} from '@/services/calculationEngine';
import type { SkillType } from '@/lib/types';

export function AssignmentsPage() {
  const { loading, shifts, lines, templates, employees, jobs, requirements, assignments, refresh } =
    useAppData();
  const [selectedShift, setSelectedShift] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const summaries = useMemo(
    () =>
      applyAssignmentsToSummaries(
        aggregateStaffingRequirements(jobs, requirements, templates, lines, shifts),
        assignments,
      ),
    [jobs, requirements, templates, lines, shifts, assignments],
  );

  const activeSummary = summaries.find(
    (s) => s.shift_date === selectedDate && s.shift_id === selectedShift,
  );

  const assignedEmployeeIds = useMemo(() => {
    if (!selectedDate || !selectedShift) return new Set<string>();
    return new Set(
      assignments
        .filter((a) => a.shift_date === selectedDate && a.shift_id === selectedShift)
        .map((a) => a.employee_id),
    );
  }, [assignments, selectedDate, selectedShift]);

  const getQualifiedEmployees = (position: SkillType) =>
    employees.filter(
      (e) =>
        e.is_active &&
        e.skills.includes(position) &&
        !assignedEmployeeIds.has(e.id),
    );

  const handleAssign = async (
    lineId: string,
    position: SkillType,
    employeeId: string,
  ) => {
    if (!selectedDate || !selectedShift) return;
    setSaving(true);
    setError('');
    try {
      await dataService.createAssignment({
        shift_date: selectedDate,
        shift_id: selectedShift,
        production_line_id: lineId,
        position,
        employee_id: employeeId,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    await dataService.deleteAssignment(assignmentId);
    await refresh();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Employee Assignments</h1>
        <p className="text-slate-500">Assign qualified employees to shift positions</p>
      </div>

      <Card title="Select Shift">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Date</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select date...</option>
              {[...new Set(summaries.map((s) => s.shift_date))].sort().map((d) => (
                <option key={d} value={d}>
                  {format(parseISO(d), 'EEE dd MMM yyyy')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Shift</label>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select shift...</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {activeSummary && (
        <Card
          title={`${format(parseISO(activeSummary.shift_date), 'EEEE dd MMM')} — ${activeSummary.shift_name} Shift`}
          subtitle={`${activeSummary.assigned}/${activeSummary.total_required} positions filled`}
        >
          <div className="space-y-6">
            {Object.entries(
              activeSummary.positions.reduce<Record<string, typeof activeSummary.positions>>(
                (acc, p) => {
                  const key = `${p.production_line_id}|${p.position}`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(p);
                  return acc;
                },
                {},
              ),
            ).map(([key, positions]) => {
              const pos = positions[0];
              const existingAssignment = assignments.find(
                (a) =>
                  a.shift_date === selectedDate &&
                  a.shift_id === selectedShift &&
                  a.production_line_id === pos.production_line_id &&
                  a.position === pos.position,
              );
              const qualified = getQualifiedEmployees(pos.position);
              const assignedEmp = existingAssignment
                ? employees.find((e) => e.id === existingAssignment.employee_id)
                : null;

              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <p className="font-medium text-slate-900">{pos.production_line_name}</p>
                    <p className="text-sm text-slate-500">{pos.position}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {assignedEmp ? (
                      <>
                        <Badge variant="green">
                          {assignedEmp.first_name} {assignedEmp.last_name}
                        </Badge>
                        {existingAssignment && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnassign(existingAssignment.id)}
                          >
                            Remove
                          </Button>
                        )}
                      </>
                    ) : (
                      <select
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        defaultValue=""
                        disabled={saving}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssign(pos.production_line_id, pos.position, e.target.value);
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">Assign employee...</option>
                        {qualified.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.first_name} {e.last_name} ({e.employee_number})
                          </option>
                        ))}
                      </select>
                    )}
                    {qualified.length === 0 && !assignedEmp && (
                      <span className="text-xs text-red-500">No qualified employees available</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!activeSummary && selectedDate && selectedShift && (
        <Card>
          <p className="text-sm text-slate-500">No production scheduled for this shift.</p>
        </Card>
      )}
    </div>
  );
}
