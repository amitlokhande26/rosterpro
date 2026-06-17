import { useState, useRef } from 'react';
import { X, Check, AlertCircle, Camera, ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { validateImageFile } from '@/services/ocrService';
import { extractScheduleWithAI, matchLineName } from '@/services/aiScheduleService';
import { settingsService } from '@/services/settingsService';
import type { ProductionJobInput, ProductionLine } from '@/lib/types';
import { Link } from 'react-router-dom';
import { uuidv4 } from '@/services/uuid';

interface ReviewRow extends ProductionJobInput {
  rowId: string;
  detected_line: string;
  included: boolean;
}

interface OcrUploadModalProps {
  lines: ProductionLine[];
  onConfirmAll: (jobs: ProductionJobInput[]) => void;
  onClose: () => void;
}

export function OcrUploadModal({ lines, onConfirmAll, onClose }: OcrUploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const hasApiKey = settingsService.hasApiKey();

  const resetInputs = () => {
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!hasApiKey) {
      setError('Add your free Gemini API key in Administration → AI Settings first.');
      return;
    }

    setError('');
    setProcessing(true);
    setStatusText('AI is reading your schedule...');
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));

    try {
      const result = await extractScheduleWithAI(file, lines);

      const rows: ReviewRow[] = result.jobs.map((job) => {
        const matched = matchLineName(job.production_line, lines);
        return {
          rowId: uuidv4(),
          detected_line: job.production_line,
          production_line_id: matched?.id ?? '',
          product_name: job.product_name,
          start_date: job.start_date,
          start_time: job.start_time,
          runtime_hours: job.runtime_hours,
          notes: job.notes ?? '',
          divider_required: false,
          floater_required: false,
          included: true,
        };
      });

      setReviewRows(rows);
      setStatusText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read schedule');
      setReviewRows(null);
    } finally {
      setProcessing(false);
      resetInputs();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleRetake = () => {
    if (preview) URL.revokeObjectURL(preview);
    setReviewRows(null);
    setPreview(null);
    setError('');
    resetInputs();
  };

  const updateRow = (rowId: string, updates: Partial<ReviewRow>) => {
    setReviewRows((rows) =>
      rows?.map((r) => (r.rowId === rowId ? { ...r, ...updates } : r)) ?? null,
    );
  };

  const removeRow = (rowId: string) => {
    setReviewRows((rows) => rows?.filter((r) => r.rowId !== rowId) ?? null);
  };

  const handleConfirmAll = () => {
    const selected = reviewRows?.filter((r) => r.included) ?? [];
    if (selected.length === 0) {
      setError('Select at least one job to import');
      return;
    }

    const invalid = selected.find(
      (r) => !r.production_line_id || !r.product_name || !r.start_date || !r.runtime_hours,
    );
    if (invalid) {
      setError('Complete all fields for included jobs (line, product, date, runtime)');
      return;
    }

    onConfirmAll(
      selected.map(({ rowId, detected_line, included, ...job }) => job),
    );
  };

  const includedCount = reviewRows?.filter((r) => r.included).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="h-5 w-5 text-wine-600" />
              Import Schedule with AI
            </h2>
            <p className="text-sm text-slate-500">
              One photo — extracts all lines and products automatically
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {!hasApiKey && !reviewRows && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">AI setup required</p>
              <p className="mt-1">
                Add your free Google Gemini API key in{' '}
                <Link to="/admin" className="font-medium underline" onClick={onClose}>
                  Administration → AI Settings
                </Link>{' '}
                to read schedules from photos.
              </p>
            </div>
          )}

          {!reviewRows && !processing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={!hasApiKey}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-wine-300 bg-wine-50 p-8 transition-colors hover:border-wine-400 hover:bg-wine-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-10 w-10 text-wine-600" />
                  <p className="mt-3 font-medium text-wine-900">Take Photo</p>
                  <p className="mt-1 text-center text-sm text-wine-700">Snap the full schedule</p>
                </button>

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={!hasApiKey}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition-colors hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImageIcon className="h-10 w-10 text-slate-500" />
                  <p className="mt-3 font-medium text-slate-700">Choose Image</p>
                  <p className="mt-1 text-center text-sm text-slate-500">Screenshot or photo file</p>
                </button>
              </div>

              <p className="text-center text-xs text-slate-400">
                Include the full weekly schedule — AI will extract every production job
              </p>

              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleInputChange}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/*"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          )}

          {processing && (
            <div className="py-8 text-center">
              {preview && (
                <img
                  src={preview}
                  alt="Processing"
                  className="mx-auto mb-4 max-h-48 rounded-lg border border-slate-200 object-contain"
                />
              )}
              <div className="mx-auto flex max-w-xs items-center justify-center gap-2 text-wine-700">
                <Sparkles className="h-5 w-5 animate-pulse" />
                <span className="text-sm font-medium">{statusText}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">This usually takes 5–15 seconds</p>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {reviewRows && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    Found {reviewRows.length} job{reviewRows.length !== 1 ? 's' : ''} — review before saving
                  </p>
                  <p className="mt-1">Edit any field, uncheck rows to skip, then import all at once.</p>
                </div>
              </div>

              {preview && (
                <img
                  src={preview}
                  alt="Schedule"
                  className="max-h-36 w-full rounded-lg border border-slate-200 object-contain"
                />
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Import</th>
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Hours</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((row) => (
                      <tr key={row.rowId} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={(e) => updateRow(row.rowId, { included: e.target.checked })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={row.production_line_id}
                            onChange={(e) =>
                              updateRow(row.rowId, { production_line_id: e.target.value })
                            }
                            className="w-full min-w-[130px] rounded border border-slate-300 px-2 py-1"
                          >
                            <option value="">Select...</option>
                            {lines.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          {row.detected_line && !row.production_line_id && (
                            <p className="mt-0.5 text-xs text-amber-600">AI: {row.detected_line}</p>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.product_name}
                            onChange={(e) => updateRow(row.rowId, { product_name: e.target.value })}
                            className="w-full min-w-[120px] rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={row.start_date}
                            onChange={(e) => updateRow(row.rowId, { start_date: e.target.value })}
                            className="rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="time"
                            value={row.start_time}
                            onChange={(e) => updateRow(row.rowId, { start_time: e.target.value })}
                            className="rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.25"
                            min="0.25"
                            value={row.runtime_hours}
                            onChange={(e) =>
                              updateRow(row.rowId, { runtime_hours: parseFloat(e.target.value) })
                            }
                            className="w-16 rounded border border-slate-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => removeRow(row.rowId)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleConfirmAll}>
                  <Check className="h-4 w-4" />
                  Import {includedCount} Job{includedCount !== 1 ? 's' : ''}
                </Button>
                <Button variant="secondary" onClick={handleRetake}>
                  <Camera className="h-4 w-4" />
                  New Photo
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
