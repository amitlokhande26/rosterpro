import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Clock,
  Briefcase,
  Factory,
  Users,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Card, StatCard, LoadingSpinner, Badge } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import {
  aggregateStaffingRequirements,
  applyAssignmentsToSummaries,
  calculateDashboardMetrics,
  getWeekDates,
  getWeekStart,
} from '@/services/calculationEngine';

export function DashboardPage() {
  const { loading, error, shifts, lines, templates, jobs, requirements, assignments, refresh } =
    useAppData();
  const [weekStart] = useState(() => getWeekStart(new Date()));

  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const metrics = useMemo(() => {
    const summaries = applyAssignmentsToSummaries(
      aggregateStaffingRequirements(jobs, requirements, templates, lines, shifts),
      assignments,
    );
    return calculateDashboardMetrics(
      jobs,
      summaries,
      assignments,
      lines,
      shifts,
      weekDates,
      requirements,
    );
  }, [jobs, requirements, templates, lines, shifts, assignments, weekDates]);

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        {error}
        <button onClick={refresh} className="ml-4 underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">
            Week of {format(weekStart, 'dd MMM yyyy')}
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Running Hours"
          value={metrics.total_running_hours.toFixed(1)}
          icon={<Clock className="h-5 w-5" />}
          color="wine"
        />
        <StatCard
          label="Total Jobs"
          value={metrics.total_jobs}
          icon={<Briefcase className="h-5 w-5" />}
        />
        <StatCard
          label="Active Lines"
          value={metrics.active_lines}
          icon={<Factory className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          label="Unfilled Positions"
          value={metrics.unfilled_positions}
          icon={<AlertTriangle className="h-5 w-5" />}
          color={metrics.unfilled_positions > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Required Staff"
          value={metrics.required_staff}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Assigned Staff"
          value={metrics.assigned_staff}
          icon={<UserCheck className="h-5 w-5" />}
          color="green"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Continuous Runs" subtitle="Production running across multiple shifts">
          {metrics.continuous_runs.length === 0 ? (
            <p className="text-sm text-slate-500">No continuous runs detected this week.</p>
          ) : (
            <div className="space-y-3">
              {metrics.continuous_runs.map((run, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{run.production_line_name}</span>
                    <Badge variant="green">Continuous Run</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {format(parseISO(run.start), 'EEE dd MMM, h:mm a')} →{' '}
                    {format(parseISO(run.end), 'EEE dd MMM, h:mm a')}
                  </p>
                  <p className="text-sm text-slate-500">{run.duration_hours.toFixed(1)} hours</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="High Changeover Load" subtitle="Multiple changeovers in same shift">
          {metrics.changeovers.length === 0 ? (
            <p className="text-sm text-slate-500">No high changeover loads detected.</p>
          ) : (
            <div className="space-y-3">
              {metrics.changeovers.map((co, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div>
                    <p className="font-medium text-amber-900">{co.production_line_name}</p>
                    <p className="text-sm text-amber-700">
                      {format(parseISO(co.shift_date), 'EEE dd MMM')} — {co.shift_name} Shift
                    </p>
                  </div>
                  <Badge variant="amber">{co.count} changeovers</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Idle Shifts" subtitle="No production — recommended activities">
        {metrics.idle_shifts.length === 0 ? (
          <p className="text-sm text-slate-500">All shifts have production scheduled.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.idle_shifts.slice(0, 6).map((idle, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  <span className="font-medium text-slate-700">
                    {format(parseISO(idle.shift_date), 'EEE')} — {idle.shift_name}
                  </span>
                </div>
                <Badge variant="grey">No Production</Badge>
                <p className="mt-2 text-xs text-slate-500">
                  Recommend: {idle.recommendations.join(', ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
