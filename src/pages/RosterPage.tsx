import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { format, parseISO, addWeeks, subWeeks } from 'date-fns';
import { Camera, Check, ChevronLeft, ChevronRight, Filter, FolderOpen } from 'lucide-react';
import { domToBlob } from 'modern-screenshot';
import { Card, LoadingSpinner, Badge } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import { cn } from '@/lib/utils';
import {
  aggregateStaffingRequirements,
  applyAssignmentsToSummaries,
  buildRosterBoard,
  getCellStatusColor,
  getWeekDates,
  getWeekStart,
} from '@/services/calculationEngine';
import { ALL_SKILLS } from '@/lib/types';

/** Survives closing dialogs until the tab is reloaded (same pattern as weight-check app). */
let savedDirHandle: FileSystemDirectoryHandle | null = null;

/** Clock time at save: `DD-MM-YYYY ; HH.MM.png` (en-GB), same as weight-check app. */
function buildSnapshotFilename(now = new Date()): string {
  const dateStr = now
    .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');
  const timeStr = now
    .toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    .replace(/:/g, '.');
  return `${dateStr} ; ${timeStr}.png`;
}

type ToastState = { type: 'success' | 'error'; message: string } | null;

export function RosterPage() {
  const { loading, shifts, lines, templates, employees, jobs, requirements, assignments } = useAppData();
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [folderSelected, setFolderSelected] = useState(() => !!savedDirHandle);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const snapshotRef = useRef<HTMLDivElement>(null);

  const isFileSystemSupported =
    typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (lines.length > 0 && selectedLineIds.size === 0) {
      setSelectedLineIds(new Set(lines.map((l) => l.id)));
    }
  }, [lines, selectedLineIds.size]);

  const filteredRequirements = useMemo(
    () => requirements.filter((r) => selectedLineIds.has(r.production_line_id)),
    [requirements, selectedLineIds],
  );

  const filteredAssignments = useMemo(
    () => assignments.filter((a) => selectedLineIds.has(a.production_line_id)),
    [assignments, selectedLineIds],
  );

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const board = useMemo(() => {
    const summaries = applyAssignmentsToSummaries(
      aggregateStaffingRequirements(jobs, filteredRequirements, templates, lines, shifts),
      filteredAssignments,
    );
    return buildRosterBoard(
      weekDates,
      shifts,
      summaries,
      filteredAssignments,
      employees,
      lines,
      filteredRequirements,
    );
  }, [weekDates, shifts, jobs, filteredRequirements, templates, lines, filteredAssignments, employees]);

  const toggleLine = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        if (next.size <= 1) return prev;
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }, []);

  const selectAllLines = () => setSelectedLineIds(new Set(lines.map((l) => l.id)));
  const isAllSelected = lines.length > 0 && selectedLineIds.size === lines.length;

  const dayLabels = weekDates.map((d) => ({
    date: d,
    label: format(parseISO(d), 'EEE'),
    full: format(parseISO(d), 'dd MMM'),
  }));

  const selectFolder = useCallback(async () => {
    try {
      // Chromium File System Access API (Chrome/Edge)
      savedDirHandle = await (window as unknown as {
        showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker();
      setFolderSelected(true);
      showToast('success', 'Folder selected! Screenshots will be saved there.');
    } catch {
      // User cancelled — keep existing handle if any
    }
  }, [showToast]);

  const saveScreenshot = useCallback(async () => {
    const target = snapshotRef.current;
    if (!target || isSaving) return;

    setIsSaving(true);
    const scrollArea = target.querySelector('.overflow-x-auto') as HTMLElement | null;
    const prevOverflow = scrollArea?.style.overflow ?? '';
    if (scrollArea) scrollArea.style.overflow = 'visible';

    try {
      // modern-screenshot supports Tailwind v4 oklch() colors (html2canvas does not)
      const blob = await domToBlob(target, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      if (!blob) throw new Error('Failed to create PNG blob');

      const filename = buildSnapshotFilename();

      if (savedDirHandle && isFileSystemSupported) {
        const fileHandle = await savedDirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast('success', `Screenshot saved: ${filename}`);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('success', `Screenshot downloaded: ${filename}`);
      }
    } catch (err) {
      console.error('Roster snapshot failed', err);
      showToast('error', 'Failed to save screenshot');
    } finally {
      if (scrollArea) scrollArea.style.overflow = prevOverflow;
      setIsSaving(false);
    }
  }, [isSaving, isFileSystemSupported, showToast]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={cn(
            'fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg',
            toast.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-red-200 bg-red-50 text-red-900',
          )}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Roster Board</h1>
          <p className="text-slate-500">Weekly staffing overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFileSystemSupported && (
            <button
              type="button"
              onClick={selectFolder}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                folderSelected
                  ? 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {folderSelected ? <Check className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}
              {folderSelected ? 'Folder Selected' : 'Select Save Folder'}
            </button>
          )}
          <button
            type="button"
            onClick={saveScreenshot}
            disabled={isSaving}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border border-wine-200 bg-wine-50 px-3 py-2 text-sm font-medium text-wine-800 hover:bg-wine-100',
              isSaving && 'cursor-wait opacity-70',
            )}
          >
            <Camera className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save Screenshot'}
          </button>
          <button
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-medium">
            {format(weekStart, 'dd MMM')} — {format(addWeeks(weekStart, 1), 'dd MMM yyyy')}
          </span>
          <button
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Filter className="h-4 w-4 text-slate-400" />
            Production Lines
          </div>
          <button
            type="button"
            onClick={selectAllLines}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              isAllSelected
                ? 'bg-wine-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            All Lines
          </button>
          {lines.map((line) => {
            const isActive = selectedLineIds.has(line.id);
            return (
              <button
                key={line.id}
                type="button"
                onClick={() => toggleLine(line.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-wine-100 text-wine-800 ring-1 ring-wine-300'
                    : 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200',
                )}
              >
                {line.name}
              </button>
            );
          })}
        </div>
        {!isAllSelected && selectedLineIds.size > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Showing roster for {selectedLineIds.size} of {lines.length} lines
          </p>
        )}
      </Card>

      <div ref={snapshotRef} className="space-y-3 rounded-xl bg-white p-1">
        <div className="px-1 text-sm font-medium text-slate-700">
          Roster Board — {format(weekStart, 'dd MMM')} – {format(addWeeks(weekStart, 1), 'dd MMM yyyy')}
        </div>
        <div className="flex flex-wrap gap-3 px-1">
          <div className="flex items-center gap-2 text-xs">
            <div className="h-3 w-3 rounded bg-green-400" /> Production Running
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="h-3 w-3 rounded bg-slate-300" /> No Production
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="h-3 w-3 rounded bg-amber-400" /> Staffing Incomplete
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="h-3 w-3 rounded bg-red-400" /> Understaffed
          </div>
        </div>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-28 px-4 py-3 text-left text-sm font-semibold text-slate-700">Shift</th>
                  {dayLabels.map((d) => (
                    <th key={d.date} className="px-3 py-3 text-center text-sm font-semibold text-slate-700">
                      {d.label}
                      <div className="text-xs font-normal text-slate-500">{d.full}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">
                      {row[0]?.shift_name}
                    </td>
                    {row.map((cell) => (
                      <td key={`${cell.shift_date}-${cell.shift_id}`} className="p-2 align-top">
                        <div className={`min-h-[120px] rounded-lg border p-3 ${getCellStatusColor(cell.status)}`}>
                          {cell.running_line_details.length > 0 ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Lines</p>
                              <ul className="mt-1 space-y-1">
                                {cell.running_line_details.map((line) => (
                                  <li key={line.line_name} className="text-xs font-medium leading-snug">
                                    {line.line_name}
                                    {line.optional_roles.length > 0 && (
                                      <span className="font-normal text-wine-800">
                                        {' '}— {line.optional_roles.join(', ')}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                              {cell.crew_handoffs.length > 0 && (
                                <div className="mt-2 space-y-0.5 border-t border-current/20 pt-2">
                                  {cell.crew_handoffs.map((h, i) => (
                                    <p key={i} className="text-xs font-medium text-wine-900/90">
                                      {h.from_line} crew to {h.to_line} at {h.at}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {cell.assignments.length > 0 && (
                                <div className="mt-2 space-y-0.5 border-t border-current/20 pt-2">
                                  {cell.assignments.slice(0, 4).map((a, i) => (
                                    <p key={i} className="truncate text-xs">
                                      {a.position}: {a.employee_name}
                                    </p>
                                  ))}
                                  {cell.assignments.length > 4 && (
                                    <p className="text-xs opacity-70">+{cell.assignments.length - 4} more</p>
                                  )}
                                </div>
                              )}
                            </>
                          ) : cell.running_lines.length > 0 ? (
                            <>
                              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Lines</p>
                              <ul className="mt-1 space-y-0.5">
                                {cell.running_lines.map((line, i) => (
                                  <li key={i} className="text-xs font-medium">{line}</li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <p className="text-xs font-medium opacity-70">No Production</p>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ShiftRequirementSummaries
        weekDates={weekDates}
        shifts={shifts}
        jobs={jobs}
        requirements={filteredRequirements}
        templates={templates}
        lines={lines}
        assignments={filteredAssignments}
      />
    </div>
  );
}

function ShiftRequirementSummaries({
  weekDates,
  shifts,
  jobs,
  requirements,
  templates,
  lines,
  assignments,
}: {
  weekDates: string[];
  shifts: ReturnType<typeof useAppData>['shifts'];
  jobs: ReturnType<typeof useAppData>['jobs'];
  requirements: ReturnType<typeof useAppData>['requirements'];
  templates: ReturnType<typeof useAppData>['templates'];
  lines: ReturnType<typeof useAppData>['lines'];
  assignments: ReturnType<typeof useAppData>['assignments'];
}) {
  const summaries = useMemo(() => {
    const all = applyAssignmentsToSummaries(
      aggregateStaffingRequirements(jobs, requirements, templates, lines, shifts),
      assignments,
    );
    return all
      .filter((s) => weekDates.includes(s.shift_date))
      .filter((s) => s.total_required > 0);
  }, [jobs, requirements, templates, lines, shifts, assignments, weekDates]);

  if (summaries.length === 0) return null;

  return (
    <Card title="Shift Requirement Summary">
      <div className="space-y-4">
        {summaries.map((s) => (
          <div key={`${s.shift_date}-${s.shift_id}`} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">
                {format(parseISO(s.shift_date), 'EEEE dd MMM')} — {s.shift_name} Shift
              </h3>
              <Badge variant={s.vacancies > 0 ? 'amber' : 'green'}>
                {s.assigned}/{s.total_required} assigned
              </Badge>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Running Lines</p>
                <ul className="mt-1 text-sm text-slate-700">
                  {s.running_line_details.map((l) => (
                    <li key={l.line_name}>
                      • {l.line_name}
                      {l.optional_roles.length > 0 && (
                        <span className="text-wine-700"> — {l.optional_roles.join(', ')}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Required Staff</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {ALL_SKILLS.filter((sk) => s.required_staff[sk] > 0).map((sk) => (
                    <span key={sk} className="rounded bg-slate-100 px-2 py-0.5 text-sm">
                      {sk} = {s.required_staff[sk]}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Total Required = {s.total_required} | Assigned = {s.assigned} | Vacancies = {s.vacancies}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
