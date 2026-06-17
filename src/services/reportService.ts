import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import type {
  ShiftAssignment,
  ShiftStaffingSummary,
  DashboardMetrics,
  EmployeeWithSkills,
  ProductionJob,
  ProductionLine,
} from '@/lib/types';

export function exportWeeklyRosterExcel(
  weekStart: string,
  summaries: ShiftStaffingSummary[],
  assignments: ShiftAssignment[],
  employees: Array<{ id: string; first_name: string; last_name: string }>,
  lines: ProductionLine[],
) {
  const empMap = new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));

  const rows = summaries.map((s) => ({
    Date: format(parseISO(s.shift_date), 'EEE dd MMM'),
    Shift: s.shift_name,
    'Running Lines': s.running_lines.join(', '),
    'Total Required': s.total_required,
    Assigned: s.assigned,
    Vacancies: s.vacancies,
    Status: s.status,
  }));

  const assignmentRows = assignments.map((a) => ({
    Date: format(parseISO(a.shift_date), 'EEE dd MMM'),
    Line: lineMap.get(a.production_line_id) ?? '',
    Position: a.position,
    Employee: empMap.get(a.employee_id) ?? '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Roster Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assignmentRows), 'Assignments');
  XLSX.writeFile(wb, `weekly-roster-${weekStart}.xlsx`);
}

export function exportStaffingRequirementExcel(
  weekStart: string,
  summaries: ShiftStaffingSummary[],
) {
  const rows = summaries.flatMap((s) =>
    Object.entries(s.required_staff)
      .filter(([, qty]) => qty > 0)
      .map(([position, qty]) => ({
        Date: format(parseISO(s.shift_date), 'EEE dd MMM'),
        Shift: s.shift_name,
        Position: position,
        Required: qty,
        Assigned: s.assigned,
        Vacancies: s.vacancies,
      })),
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Staffing Requirements');
  XLSX.writeFile(wb, `staffing-requirements-${weekStart}.xlsx`);
}

export function exportLabourSummaryExcel(
  weekStart: string,
  metrics: DashboardMetrics,
  employees: EmployeeWithSkills[],
  jobs: ProductionJob[],
  lines: ProductionLine[],
) {
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));

  const metricsRows = [
    { Metric: 'Total Running Hours', Value: metrics.total_running_hours },
    { Metric: 'Total Jobs', Value: metrics.total_jobs },
    { Metric: 'Active Lines', Value: metrics.active_lines },
    { Metric: 'Required Staff', Value: metrics.required_staff },
    { Metric: 'Assigned Staff', Value: metrics.assigned_staff },
    { Metric: 'Unfilled Positions', Value: metrics.unfilled_positions },
    { Metric: 'Continuous Runs', Value: metrics.continuous_runs.length },
    { Metric: 'Changeovers', Value: metrics.changeovers.length },
  ];

  const jobRows = jobs.map((j) => ({
    Line: lineMap.get(j.production_line_id) ?? '',
    Product: j.product_name,
    'Start Date': j.start_date,
    'Start Time': j.start_time,
    'Runtime (hrs)': j.runtime_hours,
    'End DateTime': j.end_datetime,
  }));

  const employeeRows = employees
    .filter((e) => e.is_active)
    .map((e) => ({
      Name: `${e.first_name} ${e.last_name}`,
      Number: e.employee_number,
      Skills: e.skills.join(', '),
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metricsRows), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobRows), 'Jobs');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeeRows), 'Employees');
  XLSX.writeFile(wb, `labour-summary-${weekStart}.xlsx`);
}

export function exportWeeklyRosterPdf(
  weekStart: string,
  summaries: ShiftStaffingSummary[],
  assignments: ShiftAssignment[],
  employees: Array<{ id: string; first_name: string; last_name: string }>,
  lines: ProductionLine[],
) {
  const doc = new jsPDF();
  const empMap = new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  const lineMap = new Map(lines.map((l) => [l.id, l.name]));

  doc.setFontSize(16);
  doc.text(`Weekly Roster Report`, 14, 20);
  doc.setFontSize(10);
  doc.text(`Week starting: ${format(parseISO(weekStart), 'dd MMM yyyy')}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [['Date', 'Shift', 'Lines', 'Required', 'Assigned', 'Vacancies', 'Status']],
    body: summaries.map((s) => [
      format(parseISO(s.shift_date), 'EEE dd MMM'),
      s.shift_name,
      s.running_lines.join(', '),
      String(s.total_required),
      String(s.assigned),
      String(s.vacancies),
      s.status,
    ]),
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  autoTable(doc, {
    startY: finalY,
    head: [['Date', 'Line', 'Position', 'Employee']],
    body: assignments.map((a) => [
      format(parseISO(a.shift_date), 'EEE dd MMM'),
      lineMap.get(a.production_line_id) ?? '',
      a.position,
      empMap.get(a.employee_id) ?? '',
    ]),
  });

  doc.save(`weekly-roster-${weekStart}.pdf`);
}

export function exportStaffingRequirementPdf(weekStart: string, summaries: ShiftStaffingSummary[]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Staffing Requirement Report', 14, 20);
  doc.setFontSize(10);
  doc.text(`Week starting: ${format(parseISO(weekStart), 'dd MMM yyyy')}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [['Date', 'Shift', 'Position', 'Required', 'Vacancies']],
    body: summaries.flatMap((s) =>
      Object.entries(s.required_staff)
        .filter(([, qty]) => qty > 0)
        .map(([position, qty]) => [
          format(parseISO(s.shift_date), 'EEE dd MMM'),
          s.shift_name,
          position,
          String(qty),
          String(s.vacancies),
        ]),
    ),
  });

  doc.save(`staffing-requirements-${weekStart}.pdf`);
}

export function exportLabourSummaryPdf(
  weekStart: string,
  metrics: DashboardMetrics,
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Labour Summary Report', 14, 20);
  doc.setFontSize(10);
  doc.text(`Week starting: ${format(parseISO(weekStart), 'dd MMM yyyy')}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [['Metric', 'Value']],
    body: [
      ['Total Running Hours', String(metrics.total_running_hours)],
      ['Total Jobs', String(metrics.total_jobs)],
      ['Active Lines', String(metrics.active_lines)],
      ['Required Staff', String(metrics.required_staff)],
      ['Assigned Staff', String(metrics.assigned_staff)],
      ['Unfilled Positions', String(metrics.unfilled_positions)],
      ['Continuous Runs', String(metrics.continuous_runs.length)],
      ['High Changeover Shifts', String(metrics.changeovers.length)],
    ],
  });

  doc.save(`labour-summary-${weekStart}.pdf`);
}

export function printReport(elementId: string) {
  const content = document.getElementById(elementId);
  if (!content) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>Print Report</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f3f4f6; }
          h1, h2 { color: #1e293b; }
        </style>
      </head>
      <body>${content.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}
