import { useState, useRef } from 'react';
import { X, Check, AlertCircle, Camera, FileUp, Sparkles, Trash2 } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { QuantityDisplay } from '@/components/QuantityDisplay';
import { extractScheduleWithAI, matchLineName, validateScheduleFile } from '@/services/aiScheduleService';
import {
  resolveJobQuantities,
  isKeggingLine,
  isPackBasedLine,
  packOptionsForSelect,
  parseOuterPackSize,
  normalizePackLabel,
} from '@/services/quantityService';
import type { ProductionJobInput, ProductionLine } from '@/lib/types';
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

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function applyQuantityToRow(row: ReviewRow, lines: ProductionLine[]): ReviewRow {
  const lineName =
    lines.find((l) => l.id === row.production_line_id)?.name ?? row.detected_line;
  const quantities = resolveJobQuantities(lineName, row);
  return { ...row, ...quantities };
}

export function OcrUploadModal({ lines, onConfirmAll, onClose }: OcrUploadModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  const resetInputs = () => {
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const validationError = validateScheduleFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setProcessing(true);
    setStatusText('AI is reading your schedule...');
    if (preview) URL.revokeObjectURL(preview);
    setPreview(isImageFile(file) ? URL.createObjectURL(file) : null);
    setFileLabel(file.name);

    try {
      const result = await extractScheduleWithAI(file, lines);

      const rows: ReviewRow[] = result.jobs.map((job) => {
        const matched = matchLineName(job.production_line, lines);
        const lineName = matched?.name ?? job.production_line;
        const dividerRequired =
          job.divider_required ??
          (/bottling line/i.test(lineName) &&
            /\bdivider\b/i.test(`${job.product_name} ${job.notes ?? ''}`));

        return applyQuantityToRow(
          {
            rowId: uuidv4(),
            detected_line: job.production_line,
            production_line_id: matched?.id ?? '',
            product_name: job.product_name,
            start_date: job.start_date,
            start_time: job.start_time,
            runtime_hours: job.runtime_hours,
            notes: job.notes ?? '',
            divider_required: dividerRequired,
            floater_required: job.floater_required ?? false,
            quantity_ordered: job.quantity_ordered ?? null,
            outer_pack_label: job.outer_pack_label ?? null,
            outer_pack_size: job.outer_pack_size ?? null,
            total_quantity: null,
            included: true,
          },
          lines,
        );
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
    setFileLabel(null);
    setError('');
    resetInputs();
  };

  const updateRow = (rowId: string, updates: Partial<ReviewRow>) => {
    setReviewRows((rows) =>
      rows?.map((r) => {
        if (r.rowId !== rowId) return r;
        return applyQuantityToRow({ ...r, ...updates }, lines);
      }) ?? null,
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
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Sparkles className="h-5 w-5 text-wine-600" />
              Import Schedule with AI
            </h2>
            <p className="text-sm text-slate-500">
              Photo, PDF, or Excel — extracts all lines and products automatically
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {!reviewRows && !processing && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-wine-300 bg-wine-50 p-8 transition-colors hover:border-wine-400 hover:bg-wine-100"
                >
                  <Camera className="h-10 w-10 text-wine-600" />
                  <p className="mt-3 font-medium text-wine-900">Take Photo</p>
                  <p className="mt-1 text-center text-sm text-wine-700">Snap the full schedule</p>
                </button>

                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition-colors hover:border-slate-400 hover:bg-slate-100"
                >
                  <FileUp className="h-10 w-10 text-slate-500" />
                  <p className="mt-3 font-medium text-slate-700">Choose File</p>
                  <p className="mt-1 text-center text-sm text-slate-500">
                    PDF, Excel (.xlsx), or image
                  </p>
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
                accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          )}

          {processing && (
            <div className="py-8 text-center">
              {preview ? (
                <img
                  src={preview}
                  alt="Processing"
                  className="mx-auto mb-4 max-h-48 rounded-lg border border-slate-200 object-contain"
                />
              ) : fileLabel ? (
                <div className="mx-auto mb-4 flex max-w-xs items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <FileUp className="h-5 w-5" />
                  {fileLabel}
                </div>
              ) : null}
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
                  <p className="mt-1">
                    Divider is auto-detected for bottling lines when mentioned in the schedule.
                    Quantity: bottling/canning = ordered × pack size (e.g. 500 × 6PK = 3,000 bottles).
                    Kegging = ordered quantity is keg count.
                  </p>
                </div>
              </div>

              {preview && (
                <img
                  src={preview}
                  alt="Schedule"
                  className="max-h-36 w-full rounded-lg border border-slate-200 object-contain"
                />
              )}
              {!preview && fileLabel && (
                <p className="text-sm text-slate-500">Source file: {fileLabel}</p>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Import</th>
                      <th className="px-3 py-2 font-medium">Line</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Hours</th>
                      <th className="px-3 py-2 font-medium">Qty Ordered</th>
                      <th className="px-3 py-2 font-medium">Pack</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Divider</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((row) => {
                      const lineName = lines.find((l) => l.id === row.production_line_id)?.name ?? '';
                      const isBottling = /bottling line/i.test(lineName);
                      const showPack = isPackBasedLine(lineName);
                      const isKeg = isKeggingLine(lineName);
                      return (
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
                            <input
                              type="number"
                              min="1"
                              placeholder={isKeg ? 'Kegs' : 'Cases'}
                              value={row.quantity_ordered ?? ''}
                              onChange={(e) =>
                                updateRow(row.rowId, {
                                  quantity_ordered: e.target.value
                                    ? parseInt(e.target.value, 10)
                                    : null,
                                })
                              }
                              className="w-20 rounded border border-slate-300 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {showPack ? (
                              <>
                                <input
                                  type="text"
                                  list={`pack-sizes-${row.rowId}`}
                                  placeholder="e.g. 6PK"
                                  value={row.outer_pack_label ?? ''}
                                  onChange={(e) => {
                                    const label = normalizePackLabel(e.target.value);
                                    updateRow(row.rowId, {
                                      outer_pack_label: label,
                                      outer_pack_size: label ? parseOuterPackSize(label) : null,
                                    });
                                  }}
                                  className="w-20 rounded border border-slate-300 px-1 py-1 text-xs uppercase"
                                />
                                <datalist id={`pack-sizes-${row.rowId}`}>
                                  {packOptionsForSelect(row.outer_pack_label).map((pk) => (
                                    <option key={pk} value={pk} />
                                  ))}
                                </datalist>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {isKeg ? 'kegs' : '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">
                            <QuantityDisplay lineName={lineName} job={row} />
                          </td>
                          <td className="px-3 py-2">
                            {isBottling ? (
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={row.divider_required}
                                  onChange={(e) =>
                                    updateRow(row.rowId, { divider_required: e.target.checked })
                                  }
                                />
                                {row.divider_required && <Badge variant="amber">Yes</Badge>}
                              </label>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
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
                      );
                    })}
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
                  New File / Photo
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
