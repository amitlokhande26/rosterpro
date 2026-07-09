import {
  addHours,
  addDays,
  parseISO,
  format,
  isMonday,
  isTuesday,
  isWednesday,
  isThursday,
  isFriday,
  startOfWeek,
  eachDayOfInterval,
  differenceInMinutes,
} from 'date-fns';
import type {
  ChangeoverEvent,
  ContinuousRun,
  DashboardMetrics,
  IdleShift,
  PositionRequirement,
  ProductionJob,
  ProductionLine,
  RosterCell,
  RosterCellStatus,
  Shift,
  ShiftAssignment,
  ShiftStaffingSummary,
  ShiftTouch,
  SkillType,
  StaffingTemplate,
} from '@/lib/types';
import { ALL_SKILLS as SKILLS } from '@/lib/types';

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = parseISO(dateStr);
  date.setHours(hours, minutes || 0, 0, 0);
  return date;
}

export function calculateEndDateTime(
  startDate: string,
  startTime: string,
  runtimeHours: number,
  lineName?: string,
): Date {
  const start = combineDateAndTime(startDate, startTime);
  return addHours(start, getEffectiveRuntimeHours(lineName, runtimeHours));
}

export const CANNING_NIGHT_GAP_HOURS = 8;

export function isCanningLine(lineName: string | undefined): boolean {
  if (!lineName) return false;
  return /^canning line [12]$/i.test(lineName.trim());
}

/** Canning lines skip night shift — add 8h to calendar runtime */
export function getEffectiveRuntimeHours(
  lineName: string | undefined,
  runtimeHours: number,
): number {
  if (isCanningLine(lineName)) {
    return runtimeHours + CANNING_NIGHT_GAP_HOURS;
  }
  return runtimeHours;
}

export function formatCanningRuntimeDisplay(hours: number): string {
  return hours.toFixed(2);
}

export function isWorkday(date: Date): boolean {
  return isMonday(date) || isTuesday(date) || isWednesday(date) || isThursday(date) || isFriday(date);
}

export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function getWeekDates(weekStart: Date): string[] {
  const days = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 4),
  });
  return days.map((d) => format(d, 'yyyy-MM-dd'));
}

function getShiftInterval(shiftDate: string, shift: Shift): { start: Date; end: Date } {
  const startMinutes = parseTimeToMinutes(shift.start_time);
  const endMinutes = parseTimeToMinutes(shift.end_time);

  const dayStart = parseISO(shiftDate);
  dayStart.setHours(0, 0, 0, 0);

  const shiftStart = new Date(dayStart);
  shiftStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  let shiftEnd: Date;
  if (endMinutes <= startMinutes) {
    shiftEnd = addDays(dayStart, 1);
    shiftEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  } else {
    shiftEnd = new Date(dayStart);
    shiftEnd.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
  }

  return { start: shiftStart, end: shiftEnd };
}

function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function getShiftsTouchedByJob(
  startDate: string,
  startTime: string,
  runtimeHours: number,
  shifts: Shift[],
  lineName?: string,
): ShiftTouch[] {
  const jobStart = combineDateAndTime(startDate, startTime);
  const jobEnd = addHours(jobStart, getEffectiveRuntimeHours(lineName, runtimeHours));
  const touched: ShiftTouch[] = [];
  const seen = new Set<string>();
  const skipNight = isCanningLine(lineName);

  let currentDay = new Date(jobStart);
  currentDay.setHours(0, 0, 0, 0);
  const lastDay = new Date(jobEnd);
  lastDay.setHours(0, 0, 0, 0);

  while (currentDay <= lastDay) {
    if (isWorkday(currentDay)) {
      const dateStr = format(currentDay, 'yyyy-MM-dd');
      for (const shift of shifts) {
        if (skipNight && shift.name.toLowerCase() === 'night') continue;
        const { start: shiftStart, end: shiftEnd } = getShiftInterval(dateStr, shift);
        if (intervalsOverlap(jobStart, jobEnd, shiftStart, shiftEnd)) {
          const key = `${dateStr}|${shift.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            touched.push({
              shift_date: dateStr,
              shift_id: shift.id,
              shift_name: shift.name,
            });
          }
        }
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  return touched;
}

export function getStaffingForLine(
  lineId: string,
  templates: StaffingTemplate[],
  dividerRequired: boolean,
  floaterRequired: boolean,
): Array<{ position: SkillType; quantity: number; is_required: boolean }> {
  const lineTemplates = templates.filter((t) => t.production_line_id === lineId);
  const result: Array<{ position: SkillType; quantity: number; is_required: boolean }> = [];

  for (const t of lineTemplates) {
    if (!t.is_required) {
      if (t.position === 'Divider' && !dividerRequired) continue;
      if (t.position === 'Floater' && !floaterRequired) continue;
    }
    result.push({
      position: t.position,
      quantity: t.quantity,
      is_required: t.is_required,
    });
  }

  return result;
}

function getShiftJobsForLine(
  jobs: ProductionJob[],
  lineId: string,
  shiftDate: string,
  shiftId: string,
  shifts: Shift[],
  lineMap: Map<string, string>,
): ProductionJob[] {
  const lineName = lineMap.get(lineId);
  return jobs.filter((j) => {
    if (j.production_line_id !== lineId) return false;
    return getShiftsTouchedByJob(
      j.start_date,
      j.start_time,
      j.runtime_hours,
      shifts,
      lineName,
    ).some((s) => s.shift_date === shiftDate && s.shift_id === shiftId);
  });
}

function getJobActiveIntervalOnShift(
  job: ProductionJob,
  shiftDate: string,
  shift: Shift,
): { start: Date; end: Date } | null {
  const jobStart = combineDateAndTime(job.start_date, job.start_time);
  const jobEnd = parseISO(job.end_datetime);
  const { start: shiftStart, end: shiftEnd } = getShiftInterval(shiftDate, shift);

  const start = jobStart > shiftStart ? jobStart : shiftStart;
  const end = jobEnd < shiftEnd ? jobEnd : shiftEnd;
  if (start >= end) return null;
  return { start, end };
}

function expandLinePositions(
  lineId: string,
  lineName: string,
  staffing: ReturnType<typeof getStaffingForLine>,
): PositionRequirement[] {
  const result: PositionRequirement[] = [];
  for (const s of staffing) {
    for (let i = 0; i < s.quantity; i++) {
      result.push({
        position: s.position,
        quantity: 1,
        production_line_id: lineId,
        production_line_name: lineName,
      });
    }
  }
  return result;
}

function getLinePositionsForShift(
  lineId: string,
  shiftDate: string,
  shiftId: string,
  jobs: ProductionJob[],
  templates: StaffingTemplate[],
  shifts: Shift[],
  lineMap: Map<string, string>,
): PositionRequirement[] {
  const lineName = lineMap.get(lineId) ?? 'Unknown';
  const shiftJobs = getShiftJobsForLine(jobs, lineId, shiftDate, shiftId, shifts, lineMap);
  const dividerRequired = shiftJobs.some((j) => j.divider_required);
  const floaterRequired = shiftJobs.some((j) => j.floater_required);
  const staffing = getStaffingForLine(
    lineId,
    templates,
    dividerRequired,
    floaterRequired,
  );
  return expandLinePositions(lineId, lineName, staffing);
}

/** Peak concurrent headcount — sequential line handoffs count one crew, overlaps sum crews. */
function computePeakConcurrentPositions(
  shiftDate: string,
  shiftId: string,
  lineIds: string[],
  jobs: ProductionJob[],
  templates: StaffingTemplate[],
  shifts: Shift[],
  lineMap: Map<string, string>,
): PositionRequirement[] {
  const shift = shifts.find((s) => s.id === shiftId);
  if (!shift || lineIds.length === 0) return [];

  type TimelineEvent = { time: number; type: 'start' | 'end'; lineId: string };
  const events: TimelineEvent[] = [];

  for (const lineId of lineIds) {
    const shiftJobs = getShiftJobsForLine(jobs, lineId, shiftDate, shiftId, shifts, lineMap);
    for (const job of shiftJobs) {
      const interval = getJobActiveIntervalOnShift(job, shiftDate, shift);
      if (!interval) continue;
      events.push({ time: interval.start.getTime(), type: 'start', lineId });
      events.push({ time: interval.end.getTime(), type: 'end', lineId });
    }
  }

  if (events.length === 0) {
    let peak: PositionRequirement[] = [];
    for (const lineId of lineIds) {
      const positions = getLinePositionsForShift(
        lineId,
        shiftDate,
        shiftId,
        jobs,
        templates,
        shifts,
        lineMap,
      );
      if (positions.length > peak.length) peak = positions;
    }
    return peak;
  }

  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type === 'end' && b.type === 'start') return -1;
    if (a.type === 'start' && b.type === 'end') return 1;
    return 0;
  });

  const lineRefCount = new Map<string, number>();
  const activeLines = new Set<string>();
  let peakPositions: PositionRequirement[] = [];

  for (const event of events) {
    const count = lineRefCount.get(event.lineId) ?? 0;
    if (event.type === 'start') {
      lineRefCount.set(event.lineId, count + 1);
      activeLines.add(event.lineId);
    } else {
      const next = count - 1;
      if (next <= 0) {
        lineRefCount.delete(event.lineId);
        activeLines.delete(event.lineId);
      } else {
        lineRefCount.set(event.lineId, next);
      }
    }

    const current: PositionRequirement[] = [];
    for (const lineId of activeLines) {
      current.push(
        ...getLinePositionsForShift(
          lineId,
          shiftDate,
          shiftId,
          jobs,
          templates,
          shifts,
          lineMap,
        ),
      );
    }
    if (current.length > peakPositions.length) {
      peakPositions = current;
    }
  }

  return peakPositions;
}

export function aggregateStaffingRequirements(
  jobs: ProductionJob[],
  requirements: Array<{ shift_date: string; shift_id: string; production_line_id: string }>,
  templates: StaffingTemplate[],
  lines: ProductionLine[],
  shifts: Shift[],
): ShiftStaffingSummary[] {
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));
  const shiftMap = new Map(shifts.map((s) => [s.id, s.name]));
  const grouped = new Map<string, {
    shift_date: string;
    shift_id: string;
    lines: Set<string>;
    line_optional_roles: Map<string, Set<string>>;
  }>();

  for (const req of requirements) {
    const key = `${req.shift_date}|${req.shift_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        shift_date: req.shift_date,
        shift_id: req.shift_id,
        lines: new Set(),
        line_optional_roles: new Map(),
      });
    }
    const group = grouped.get(key)!;

    if (group.lines.has(req.production_line_id)) continue;
    group.lines.add(req.production_line_id);

    const shiftJobs = getShiftJobsForLine(
      jobs,
      req.production_line_id,
      req.shift_date,
      req.shift_id,
      shifts,
      lineMap,
    );

    const roles = group.line_optional_roles.get(req.production_line_id) ?? new Set<string>();
    if (shiftJobs.some((j) => j.divider_required)) roles.add('Divider');
    if (shiftJobs.some((j) => j.floater_required)) roles.add('Floater');
    group.line_optional_roles.set(req.production_line_id, roles);
  }

  const summaries: ShiftStaffingSummary[] = [];

  for (const [, group] of grouped) {
    const positions = computePeakConcurrentPositions(
      group.shift_date,
      group.shift_id,
      [...group.lines],
      jobs,
      templates,
      shifts,
      lineMap,
    );

    const required_staff = {} as Record<SkillType, number>;
    for (const skill of SKILLS) {
      required_staff[skill] = 0;
    }
    for (const p of positions) {
      required_staff[p.position] += p.quantity;
    }
    const total_required = positions.length;

    summaries.push({
      shift_date: group.shift_date,
      shift_id: group.shift_id,
      shift_name: shiftMap.get(group.shift_id) ?? 'Unknown',
      running_lines: [...group.lines].map((id) => lineMap.get(id) ?? 'Unknown'),
      running_line_details: [...group.lines].map((id) => ({
        line_name: lineMap.get(id) ?? 'Unknown',
        optional_roles: [...(group.line_optional_roles.get(id) ?? [])],
      })),
      required_staff,
      total_required,
      assigned: 0,
      vacancies: total_required,
      positions,
      status: 'incomplete',
    });
  }

  return summaries.sort((a, b) => {
    const dateCmp = a.shift_date.localeCompare(b.shift_date);
    if (dateCmp !== 0) return dateCmp;
    const shiftA = shifts.find((s) => s.id === a.shift_id)?.sort_order ?? 0;
    const shiftB = shifts.find((s) => s.id === b.shift_id)?.sort_order ?? 0;
    return shiftA - shiftB;
  });
}

export function applyAssignmentsToSummaries(
  summaries: ShiftStaffingSummary[],
  assignments: ShiftAssignment[],
): ShiftStaffingSummary[] {
  return summaries.map((summary) => {
    const shiftAssignments = assignments.filter(
      (a) => a.shift_date === summary.shift_date && a.shift_id === summary.shift_id,
    );
    const assigned = shiftAssignments.length;
    const vacancies = Math.max(0, summary.total_required - assigned);

    let status: RosterCellStatus = 'production';
    if (assigned === 0 && summary.total_required > 0) {
      status = 'understaffed';
    } else if (vacancies > 0) {
      status = 'incomplete';
    } else if (summary.total_required > 0 && assigned >= summary.total_required) {
      status = 'production';
    }

    return { ...summary, assigned, vacancies, status };
  });
}

export function detectContinuousRuns(
  jobs: ProductionJob[],
  lines: ProductionLine[],
): ContinuousRun[] {
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));
  const runs: ContinuousRun[] = [];

  const byLine = new Map<string, ProductionJob[]>();
  for (const job of jobs) {
    if (!byLine.has(job.production_line_id)) {
      byLine.set(job.production_line_id, []);
    }
    byLine.get(job.production_line_id)!.push(job);
  }

  for (const [lineId, lineJobs] of byLine) {
    const sorted = [...lineJobs].sort((a, b) => {
      const aStart = combineDateAndTime(a.start_date, a.start_time).getTime();
      const bStart = combineDateAndTime(b.start_date, b.start_time).getTime();
      return aStart - bStart;
    });

    let runStart: ProductionJob | null = null;
    let runJobs: ProductionJob[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const job = sorted[i];
      if (!runStart) {
        runStart = job;
        runJobs = [job];
        continue;
      }

      const prevEnd = parseISO(runJobs[runJobs.length - 1].end_datetime);
      const currStart = combineDateAndTime(job.start_date, job.start_time);

      if (currStart.getTime() <= prevEnd.getTime()) {
        runJobs.push(job);
      } else {
        if (runJobs.length > 1 || runJobs[0].runtime_hours >= 8) {
          const start = combineDateAndTime(runStart.start_date, runStart.start_time);
          const end = parseISO(runJobs[runJobs.length - 1].end_datetime);
          runs.push({
            production_line_id: lineId,
            production_line_name: lineMap.get(lineId) ?? 'Unknown',
            start: start.toISOString(),
            end: end.toISOString(),
            duration_hours: differenceInMinutes(end, start) / 60,
            job_ids: runJobs.map((j) => j.id),
          });
        }
        runStart = job;
        runJobs = [job];
      }
    }

    if (runJobs.length > 0 && runStart) {
      const start = combineDateAndTime(runStart.start_date, runStart.start_time);
      const end = parseISO(runJobs[runJobs.length - 1].end_datetime);
      if (runJobs.length > 1 || runJobs[0].runtime_hours >= 8) {
        runs.push({
          production_line_id: lineId,
          production_line_name: lineMap.get(lineId) ?? 'Unknown',
          start: start.toISOString(),
          end: end.toISOString(),
          duration_hours: differenceInMinutes(end, start) / 60,
          job_ids: runJobs.map((j) => j.id),
        });
      }
    }
  }

  return runs;
}

export function detectChangeovers(
  jobs: ProductionJob[],
  lines: ProductionLine[],
  shifts: Shift[],
): ChangeoverEvent[] {
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));
  const events: ChangeoverEvent[] = [];
  const counts = new Map<string, number>();

  const byLine = new Map<string, ProductionJob[]>();
  for (const job of jobs) {
    if (!byLine.has(job.production_line_id)) {
      byLine.set(job.production_line_id, []);
    }
    byLine.get(job.production_line_id)!.push(job);
  }

  for (const [lineId, lineJobs] of byLine) {
    const sorted = [...lineJobs].sort((a, b) => {
      const aStart = combineDateAndTime(a.start_date, a.start_time).getTime();
      const bStart = combineDateAndTime(b.start_date, b.start_time).getTime();
      return aStart - bStart;
    });

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevEnd = parseISO(prev.end_datetime);
      const currStart = combineDateAndTime(curr.start_date, curr.start_time);

      if (currStart.getTime() >= prevEnd.getTime()) {
        const changeoverTime = currStart;
        for (const shift of shifts) {
          const dateStr = format(changeoverTime, 'yyyy-MM-dd');
          if (!isWorkday(changeoverTime)) continue;
          const { start: shiftStart, end: shiftEnd } = getShiftInterval(dateStr, shift);
          if (changeoverTime >= shiftStart && changeoverTime < shiftEnd) {
            const key = `${lineId}|${dateStr}|${shift.id}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  for (const [key, count] of counts) {
    if (count >= 2) {
      const [lineId, shiftDate, shiftId] = key.split('|');
      const shift = shifts.find((s) => s.id === shiftId);
      events.push({
        production_line_id: lineId,
        production_line_name: lineMap.get(lineId) ?? 'Unknown',
        shift_date: shiftDate,
        shift_name: shift?.name ?? 'Unknown',
        count,
      });
    }
  }

  return events;
}

export function detectIdleShifts(
  weekDates: string[],
  shifts: Shift[],
  requirements: Array<{ shift_date: string; shift_id: string }>,
): IdleShift[] {
  const activeKeys = new Set(requirements.map((r) => `${r.shift_date}|${r.shift_id}`));
  const idle: IdleShift[] = [];

  for (const date of weekDates) {
    for (const shift of shifts) {
      const key = `${date}|${shift.id}`;
      if (!activeKeys.has(key)) {
        idle.push({
          shift_date: date,
          shift_id: shift.id,
          shift_name: shift.name,
          recommendations: ['Maintenance', 'Cleaning', 'Training'],
        });
      }
    }
  }

  return idle;
}

export function buildRosterBoard(
  weekDates: string[],
  shifts: Shift[],
  summaries: ShiftStaffingSummary[],
  assignments: ShiftAssignment[],
  employees: Array<{ id: string; first_name: string; last_name: string }>,
  lines: ProductionLine[],
  requirements: Array<{ shift_date: string; shift_id: string }>,
): RosterCell[][] {
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));
  const empMap = new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const summaryMap = new Map(
    summaries.map((s) => [`${s.shift_date}|${s.shift_id}`, s]),
  );
  const activeKeys = new Set(requirements.map((r) => `${r.shift_date}|${r.shift_id}`));

  const sortedShifts = [...shifts].sort((a, b) => a.sort_order - b.sort_order);

  return sortedShifts.map((shift) =>
    weekDates.map((date) => {
      const key = `${date}|${shift.id}`;
      const summary = summaryMap.get(key);
      const hasProduction = activeKeys.has(key);

      const shiftAssignments = assignments
        .filter((a) => a.shift_date === date && a.shift_id === shift.id)
        .map((a) => ({
          line_name: lineMap.get(a.production_line_id) ?? 'Unknown',
          position: a.position,
          employee_name: empMap.get(a.employee_id) ?? 'Unknown',
        }));

      let status: RosterCellStatus = 'no_production';
      if (hasProduction && summary) {
        status = summary.status;
      } else if (hasProduction) {
        status = 'understaffed';
      }

      return {
        shift_date: date,
        shift_id: shift.id,
        shift_name: shift.name,
        status,
        running_lines: summary?.running_lines ?? [],
        running_line_details: summary?.running_line_details ?? [],
        staffing: summary ?? null,
        assignments: shiftAssignments,
      };
    }),
  );
}

export function calculateDashboardMetrics(
  jobs: ProductionJob[],
  summaries: ShiftStaffingSummary[],
  assignments: ShiftAssignment[],
  lines: ProductionLine[],
  shifts: Shift[],
  weekDates: string[],
  requirements: Array<{ shift_date: string; shift_id: string }>,
): DashboardMetrics {
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));
  const weekJobs = jobs.filter((j) => {
    const touches = getShiftsTouchedByJob(
      j.start_date,
      j.start_time,
      j.runtime_hours,
      shifts,
      lineMap.get(j.production_line_id),
    );
    return touches.some((t) => weekDates.includes(t.shift_date));
  });

  const activeLineIds = new Set(
    requirements
      .filter((r) => weekDates.includes(r.shift_date))
      .map((r) => {
        const job = weekJobs.find((j) =>
          getShiftsTouchedByJob(
            j.start_date,
            j.start_time,
            j.runtime_hours,
            shifts,
            lineMap.get(j.production_line_id),
          ).some(
            (s) => s.shift_date === r.shift_date,
          ),
        );
        return job?.production_line_id;
      })
      .filter(Boolean),
  );

  const weekSummaries = summaries.filter((s) => weekDates.includes(s.shift_date));
  const weekAssignments = assignments.filter((a) => weekDates.includes(a.shift_date));

  const required_staff = weekSummaries.reduce((sum, s) => sum + s.total_required, 0);
  const assigned_staff = weekAssignments.length;
  const unfilled_positions = Math.max(0, required_staff - assigned_staff);

  return {
    total_running_hours: weekJobs.reduce(
      (sum, j) => sum + getEffectiveRuntimeHours(lineMap.get(j.production_line_id), j.runtime_hours),
      0,
    ),
    total_jobs: weekJobs.length,
    active_lines: activeLineIds.size,
    required_staff,
    assigned_staff,
    unfilled_positions,
    continuous_runs: detectContinuousRuns(weekJobs, lines),
    changeovers: detectChangeovers(weekJobs, lines, shifts),
    idle_shifts: detectIdleShifts(weekDates, shifts, requirements),
  };
}

export function validateJobInput(input: {
  production_line_id: string;
  product_name: string;
  start_date: string;
  start_time: string;
  runtime_hours: number;
}): string[] {
  const errors: string[] = [];
  if (!input.production_line_id) errors.push('Production line is required');
  if (!input.product_name?.trim()) errors.push('Product name is required');
  if (!input.start_date) errors.push('Start date is required');
  if (!input.start_time) errors.push('Start time is required');
  if (!input.runtime_hours || input.runtime_hours <= 0) {
    errors.push('Runtime hours must be greater than 0');
  }
  return errors;
}

export function formatShiftTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getCellStatusColor(status: RosterCellStatus): string {
  switch (status) {
    case 'production':
      return 'bg-green-100 border-green-400 text-green-900';
    case 'no_production':
      return 'bg-slate-100 border-slate-300 text-slate-600';
    case 'incomplete':
      return 'bg-amber-100 border-amber-400 text-amber-900';
    case 'understaffed':
      return 'bg-red-100 border-red-400 text-red-900';
  }
}
