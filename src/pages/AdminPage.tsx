import { useState, useEffect } from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { Card, Button, Badge, LoadingSpinner } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import { dataService } from '@/services/dataService';
import { formatShiftTime } from '@/services/calculationEngine';
import { settingsService } from '@/services/settingsService';
import { ALL_SKILLS, type SkillType } from '@/lib/types';

export function AdminPage() {
  const { loading, shifts, lines, templates, refresh } = useAppData();
  const [newLineName, setNewLineName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [shiftEdits, setShiftEdits] = useState<Record<string, { start_time: string; end_time: string }>>({});
  const [templateForm, setTemplateForm] = useState({
    production_line_id: '',
    position: 'QA' as SkillType,
    quantity: 1,
    is_required: true,
  });

  useEffect(() => {
    setApiKey(settingsService.get().gemini_api_key);
  }, []);

  const handleSaveApiKey = () => {
    settingsService.setGeminiApiKey(apiKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  if (loading) return <LoadingSpinner />;

  const handleAddLine = async () => {
    if (!newLineName.trim()) return;
    await dataService.createProductionLine(newLineName.trim());
    setNewLineName('');
    await refresh();
  };

  const handleSaveShift = async (id: string) => {
    const edits = shiftEdits[id];
    if (!edits) return;
    await dataService.updateShift(id, {
      start_time: edits.start_time.length === 5 ? `${edits.start_time}:00` : edits.start_time,
      end_time: edits.end_time.length === 5 ? `${edits.end_time}:00` : edits.end_time,
    });
    await refresh();
  };

  const handleAddTemplate = async () => {
    if (!templateForm.production_line_id) return;
    await dataService.upsertStaffingTemplate(templateForm);
    await refresh();
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this staffing template?')) return;
    await dataService.deleteStaffingTemplate(id);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
        <p className="text-slate-500">Manage shifts, production lines, staffing templates, and AI</p>
      </div>

      <Card title="AI Settings" subtitle="Key loaded from .env or saved here">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Gemini AI reads schedules from photos, PDF, and Excel. The API key is loaded from
            your local <code className="rounded bg-slate-100 px-1">.env</code> file, or you can
            save an override below.
          </p>
          <p className="text-xs text-slate-500">
            Note: Google Pro / Google One subscription does not affect API limits. Use a key from{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-wine-700 underline"
            >
              Google AI Studio
            </a>
            . If you see &quot;high demand&quot; errors, wait a minute and retry — the app
            automatically tries alternate models.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza..."
              className="min-w-[280px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button onClick={handleSaveApiKey}>
              <Sparkles className="h-4 w-4" />
              {apiKeySaved ? 'Saved!' : 'Save API Key'}
            </Button>
          </div>
          {settingsService.hasApiKey() && (
            <Badge variant="green">AI import enabled</Badge>
          )}
        </div>
      </Card>

      <Card title="Shift Definitions">
        <div className="space-y-4">
          {shifts.map((shift) => {
            const edit = shiftEdits[shift.id] ?? {
              start_time: shift.start_time.substring(0, 5),
              end_time: shift.end_time.substring(0, 5),
            };
            return (
              <div key={shift.id} className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-4">
                <span className="w-24 font-medium">{shift.name}</span>
                <div>
                  <label className="text-xs text-slate-500">Start</label>
                  <input
                    type="time"
                    value={edit.start_time}
                    onChange={(e) =>
                      setShiftEdits({ ...shiftEdits, [shift.id]: { ...edit, start_time: e.target.value } })
                    }
                    className="block rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">End</label>
                  <input
                    type="time"
                    value={edit.end_time}
                    onChange={(e) =>
                      setShiftEdits({ ...shiftEdits, [shift.id]: { ...edit, end_time: e.target.value } })
                    }
                    className="block rounded border border-slate-300 px-2 py-1 text-sm"
                  />
                </div>
                <span className="text-sm text-slate-500">
                  Current: {formatShiftTime(shift.start_time.substring(0, 5))} — {formatShiftTime(shift.end_time.substring(0, 5))}
                </span>
                <Button size="sm" onClick={() => handleSaveShift(shift.id)}>Save</Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Production Lines">
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
            placeholder="New line name..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <Button onClick={handleAddLine}>
            <Plus className="h-4 w-4" />
            Add Line
          </Button>
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
              <span className="font-medium">{line.name}</span>
              <Badge variant={line.is_active ? 'green' : 'grey'}>
                {line.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Staffing Templates">
        <div className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-5">
          <select
            value={templateForm.production_line_id}
            onChange={(e) => setTemplateForm({ ...templateForm, production_line_id: e.target.value })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select line...</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select
            value={templateForm.position}
            onChange={(e) => setTemplateForm({ ...templateForm, position: e.target.value as SkillType })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {ALL_SKILLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={templateForm.quantity}
            onChange={(e) => setTemplateForm({ ...templateForm, quantity: parseInt(e.target.value) })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Qty"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={templateForm.is_required}
              onChange={(e) => setTemplateForm({ ...templateForm, is_required: e.target.checked })}
            />
            Required
          </label>
          <Button onClick={handleAddTemplate}>Add Template</Button>
        </div>

        <div className="space-y-4">
          {lines.map((line) => {
            const lineTemplates = templates.filter((t) => t.production_line_id === line.id);
            if (lineTemplates.length === 0) return null;
            return (
              <div key={line.id}>
                <h3 className="mb-2 font-medium text-slate-900">{line.name}</h3>
                <div className="flex flex-wrap gap-2">
                  {lineTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>{t.position} ×{t.quantity}</span>
                      <Badge variant={t.is_required ? 'green' : 'amber'}>
                        {t.is_required ? 'Required' : 'Optional'}
                      </Badge>
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
