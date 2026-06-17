import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { Card, Button, LoadingSpinner } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import {
  aggregateStaffingRequirements,
  applyAssignmentsToSummaries,
  calculateDashboardMetrics,
  getWeekDates,
  getWeekStart,
} from '@/services/calculationEngine';
import {
  exportWeeklyRosterExcel,
  exportStaffingRequirementExcel,
  exportLabourSummaryExcel,
  exportWeeklyRosterPdf,
  exportStaffingRequirementPdf,
  exportLabourSummaryPdf,
  printReport,
} from '@/services/reportService';

export function ReportsPage() {
  const { loading, shifts, lines, templates, employees, jobs, requirements, assignments } = useAppData();
  const [weekStart] = useState(() => getWeekStart(new Date()));

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  const summaries = useMemo(
    () =>
      applyAssignmentsToSummaries(
        aggregateStaffingRequirements(jobs, requirements, templates, lines, shifts),
        assignments,
      ).filter((s) => weekDates.includes(s.shift_date)),
    [jobs, requirements, templates, lines, shifts, assignments, weekDates],
  );

  const metrics = useMemo(
    () =>
      calculateDashboardMetrics(
        jobs,
        summaries,
        assignments,
        lines,
        shifts,
        weekDates,
        requirements,
      ),
    [jobs, summaries, assignments, lines, shifts, weekDates, requirements],
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-slate-500">
          Generate and export reports for week of {format(weekStart, 'dd MMM yyyy')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ReportCard
          title="Weekly Roster Report"
          description="Complete roster with assignments and staffing status"
          onExcel={() =>
            exportWeeklyRosterExcel(weekStartStr, summaries, assignments, employees, lines)
          }
          onPdf={() =>
            exportWeeklyRosterPdf(weekStartStr, summaries, assignments, employees, lines)
          }
          onPrint={() => printReport('weekly-roster-report')}
        />
        <ReportCard
          title="Staffing Requirement Report"
          description="Position requirements by shift and date"
          onExcel={() => exportStaffingRequirementExcel(weekStartStr, summaries)}
          onPdf={() => exportStaffingRequirementPdf(weekStartStr, summaries)}
          onPrint={() => printReport('staffing-report')}
        />
        <ReportCard
          title="Labour Summary Report"
          description="Overview of hours, jobs, and workforce metrics"
          onExcel={() =>
            exportLabourSummaryExcel(weekStartStr, metrics, employees, jobs, lines)
          }
          onPdf={() => exportLabourSummaryPdf(weekStartStr, metrics)}
          onPrint={() => printReport('labour-report')}
        />
      </div>

      <div id="weekly-roster-report" className="hidden print-only">
        <h1>Weekly Roster Report</h1>
        <p>Week of {format(weekStart, 'dd MMM yyyy')}</p>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Shift</th><th>Lines</th><th>Required</th><th>Assigned</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={`${s.shift_date}-${s.shift_id}`}>
                <td>{s.shift_date}</td>
                <td>{s.shift_name}</td>
                <td>{s.running_lines.join(', ')}</td>
                <td>{s.total_required}</td>
                <td>{s.assigned}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div id="staffing-report" className="hidden print-only">
        <h1>Staffing Requirement Report</h1>
        <table>
          <thead>
            <tr><th>Date</th><th>Shift</th><th>Position</th><th>Required</th><th>Vacancies</th></tr>
          </thead>
          <tbody>
            {summaries.flatMap((s) =>
              Object.entries(s.required_staff)
                .filter(([, qty]) => qty > 0)
                .map(([pos, qty]) => (
                  <tr key={`${s.shift_date}-${s.shift_id}-${pos}`}>
                    <td>{s.shift_date}</td>
                    <td>{s.shift_name}</td>
                    <td>{pos}</td>
                    <td>{qty}</td>
                    <td>{s.vacancies}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>

      <div id="labour-report" className="hidden print-only">
        <h1>Labour Summary Report</h1>
        <table>
          <tbody>
            <tr><td>Total Running Hours</td><td>{metrics.total_running_hours}</td></tr>
            <tr><td>Total Jobs</td><td>{metrics.total_jobs}</td></tr>
            <tr><td>Required Staff</td><td>{metrics.required_staff}</td></tr>
            <tr><td>Assigned Staff</td><td>{metrics.assigned_staff}</td></tr>
            <tr><td>Unfilled Positions</td><td>{metrics.unfilled_positions}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportCard({
  title,
  description,
  onExcel,
  onPdf,
  onPrint,
}: {
  title: string;
  description: string;
  onExcel: () => void;
  onPdf: () => void;
  onPrint: () => void;
}) {
  return (
    <Card title={title} subtitle={description}>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={onExcel}>
          <FileSpreadsheet className="h-4 w-4" />
          Export Excel
        </Button>
        <Button variant="secondary" onClick={onPdf}>
          <FileText className="h-4 w-4" />
          Export PDF
        </Button>
        <Button variant="ghost" onClick={onPrint}>
          <Printer className="h-4 w-4" />
          Print View
        </Button>
      </div>
    </Card>
  );
}
