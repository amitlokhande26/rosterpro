import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Edit2, Clock, Sparkles } from 'lucide-react';
import { Card, Button, Badge, LoadingSpinner } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import { dataService } from '@/services/dataService';
import {
  calculateEndDateTime,
  validateJobInput,
  formatShiftTime,
  getShiftsTouchedByJob,
} from '@/services/calculationEngine';
import {
  resolveJobQuantities,
  isKeggingLine,
  isPackBasedLine,
  PACK_SIZE_OPTIONS,
  formatQuantityDisplay,
  parseOuterPackSize,
} from '@/services/quantityService';
import { OcrUploadModal } from '@/components/OcrUploadModal';
import type { ProductionJobInput } from '@/lib/types';

function withQuantities(form: ProductionJobInput, lineName: string): ProductionJobInput {
  return { ...form, ...resolveJobQuantities(lineName, form) };
}

const emptyForm: ProductionJobInput = {
  production_line_id: '',
  product_name: '',
  start_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '08:00',
  runtime_hours: 8,
  notes: '',
  divider_required: false,
  floater_required: false,
  optional_resource_reason: '',
};

export function SchedulePage() {
  const { loading, lines, jobs, shifts, refresh } = useAppData();
  const [showForm, setShowForm] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [form, setForm] = useState<ProductionJobInput>(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const lineMap = useMemo(() => new Map(lines.map((l) => [l.id, l.name])), [lines]);
  const selectedLineName = lineMap.get(form.production_line_id) ?? '';
  const showPackFields = isPackBasedLine(selectedLineName);
  const isKegLine = isKeggingLine(selectedLineName);

  const setFormWithQuantities = (updates: Partial<ProductionJobInput>) => {
    const lineId = updates.production_line_id ?? form.production_line_id;
    const lineName = lineMap.get(lineId) ?? '';
    setForm((prev) => withQuantities({ ...prev, ...updates }, lineName));
  };

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const aDate = new Date(`${a.start_date}T${a.start_time}`).getTime();
        const bDate = new Date(`${b.start_date}T${b.start_time}`).getTime();
        return aDate - bDate;
      }),
    [jobs],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateJobInput(form);
    if (validationErrors.length) {
      setErrors(validationErrors);
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await dataService.updateJob(editId, form);
      } else {
        await dataService.createJob(form);
      }
      await refresh();
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      setErrors([]);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to save job']);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (job: typeof jobs[0]) => {
    setForm({
      production_line_id: job.production_line_id,
      product_name: job.product_name,
      start_date: job.start_date,
      start_time: job.start_time.substring(0, 5),
      runtime_hours: job.runtime_hours,
      notes: job.notes ?? '',
      divider_required: job.divider_required,
      floater_required: job.floater_required,
      optional_resource_reason: job.optional_resource_reason ?? '',
      quantity_ordered: job.quantity_ordered,
      outer_pack_size: job.outer_pack_size,
      outer_pack_label: job.outer_pack_label,
      total_quantity: job.total_quantity,
    });
    setEditId(job.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this production job?')) return;
    await dataService.deleteJob(id);
    await refresh();
  };

  const handleOcrConfirmAll = async (jobs: ProductionJobInput[]) => {
    setSaving(true);
    try {
      for (const job of jobs) {
        await dataService.createJob(job);
      }
      await refresh();
      setShowOcr(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to import jobs');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Production Schedule</h1>
          <p className="text-slate-500">Manage production jobs and staffing requirements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowOcr(true)}>
            <Sparkles className="h-4 w-4" />
            Import Schedule (AI)
          </Button>
          <Button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}>
            <Plus className="h-4 w-4" />
            Manual Entry
          </Button>
        </div>
      </div>

      {showOcr && (
        <OcrUploadModal
          lines={lines}
          onConfirmAll={handleOcrConfirmAll}
          onClose={() => setShowOcr(false)}
        />
      )}

      {showForm && (
        <Card title={editId ? 'Edit Production Job' : 'New Production Job'}>
          {errors.length > 0 && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {errors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Production Line</label>
              <select
                value={form.production_line_id}
                onChange={(e) => setFormWithQuantities({ production_line_id: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Select line...</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Product Name</label>
              <input
                type="text"
                value={form.product_name}
                onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Runtime (hours)</label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={form.runtime_hours}
                onChange={(e) => setForm({ ...form, runtime_hours: parseFloat(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Calculated End</label>
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                <Clock className="h-4 w-4" />
                {form.start_date && form.start_time && form.runtime_hours
                  ? format(
                      calculateEndDateTime(form.start_date, form.start_time, form.runtime_hours),
                      'EEE dd MMM yyyy, h:mm a',
                    )
                  : '—'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                rows={2}
              />
            </div>
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Quantity</p>
              <p className="mt-1 text-xs text-slate-500">
                {isKegLine
                  ? 'Kegging: quantity ordered is the number of kegs.'
                  : showPackFields
                    ? 'Bottling/Canning: total = quantity ordered × outer pack size (e.g. 500 × 6PK = 3,000 units).'
                    : 'Select a production line to enter quantity.'}
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    {isKegLine ? 'Kegs Ordered' : 'Quantity Ordered'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity_ordered ?? ''}
                    onChange={(e) =>
                      setFormWithQuantities({
                        quantity_ordered: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder={isKegLine ? 'e.g. 120' : 'e.g. 500 cases'}
                  />
                </div>
                {showPackFields && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Outer Pack</label>
                    <select
                      value={form.outer_pack_label ?? ''}
                      onChange={(e) => {
                        const label = e.target.value || null;
                        setFormWithQuantities({
                          outer_pack_label: label,
                          outer_pack_size: label ? parseOuterPackSize(label) : null,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select pack...</option>
                      {PACK_SIZE_OPTIONS.map((pk) => (
                        <option key={pk} value={pk}>{pk}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600">Total Quantity</label>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {selectedLineName
                      ? formatQuantityDisplay(selectedLineName, form)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700">Optional Resources</p>
              <div className="mt-3 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.divider_required}
                    onChange={(e) => setForm({ ...form, divider_required: e.target.checked })}
                  />
                  Divider Required
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.floater_required}
                    onChange={(e) => setForm({ ...form, floater_required: e.target.checked })}
                  />
                  Floater Required
                </label>
              </div>
              <input
                type="text"
                placeholder="Reason (optional)"
                value={form.optional_resource_reason}
                onChange={(e) => setForm({ ...form, optional_resource_reason: e.target.value })}
                className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update Job' : 'Create Job'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Scheduled Jobs" subtitle={`${sortedJobs.length} production jobs`}>
        {sortedJobs.length === 0 ? (
          <p className="text-sm text-slate-500">No production jobs scheduled. Add a job to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Line</th>
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">Start</th>
                  <th className="pb-3 pr-4 font-medium">End</th>
                  <th className="pb-3 pr-4 font-medium">Runtime</th>
                  <th className="pb-3 pr-4 font-medium">Quantity</th>
                  <th className="pb-3 pr-4 font-medium">Shifts</th>
                  <th className="pb-3 pr-4 font-medium">Options</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map((job) => {
                  const touches = getShiftsTouchedByJob(
                    job.start_date,
                    job.start_time.substring(0, 5),
                    job.runtime_hours,
                    shifts,
                  );
                  return (
                    <tr key={job.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-medium">{lineMap.get(job.production_line_id)}</td>
                      <td className="py-3 pr-4">{job.product_name}</td>
                      <td className="py-3 pr-4">
                        {format(parseISO(job.start_date), 'EEE dd MMM')}<br />
                        <span className="text-slate-500">{formatShiftTime(job.start_time.substring(0, 5))}</span>
                      </td>
                      <td className="py-3 pr-4">
                        {format(parseISO(job.end_datetime), 'EEE dd MMM, h:mm a')}
                      </td>
                      <td className="py-3 pr-4">{job.runtime_hours}h</td>
                      <td className="py-3 pr-4 text-xs text-slate-600">
                        {formatQuantityDisplay(lineMap.get(job.production_line_id) ?? '', job)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {touches.map((t, i) => (
                            <Badge key={i} variant="default">
                              {format(parseISO(t.shift_date), 'EEE')} {t.shift_name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {job.divider_required && <Badge variant="amber">Divider</Badge>}{' '}
                        {job.floater_required && <Badge variant="amber">Floater</Badge>}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          <button onClick={() => handleEdit(job)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(job.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
