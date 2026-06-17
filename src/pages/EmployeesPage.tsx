import { useState } from 'react';
import { Plus, Edit2 } from 'lucide-react';
import { Card, Button, Badge, LoadingSpinner } from '@/components/ui';
import { useAppData } from '@/hooks/useAppData';
import { dataService } from '@/services/dataService';
import { ALL_SKILLS, type SkillType } from '@/lib/types';

const emptyForm = {
  first_name: '',
  last_name: '',
  employee_number: '',
  is_active: true,
  skills: [] as SkillType[],
};

export function EmployeesPage() {
  const { loading, employees, refresh } = useAppData();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) {
        await dataService.updateEmployee(
          editId,
          {
            first_name: form.first_name,
            last_name: form.last_name,
            employee_number: form.employee_number,
            is_active: form.is_active,
          },
          form.skills,
        );
      } else {
        await dataService.createEmployee(
          {
            first_name: form.first_name,
            last_name: form.last_name,
            employee_number: form.employee_number,
            is_active: form.is_active,
          },
          form.skills,
        );
      }
      await refresh();
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (emp: typeof employees[0]) => {
    setForm({
      first_name: emp.first_name,
      last_name: emp.last_name,
      employee_number: emp.employee_number,
      is_active: emp.is_active,
      skills: [...emp.skills],
    });
    setEditId(emp.id);
    setShowForm(true);
  };

  const toggleSkill = (skill: SkillType) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter((s) => s !== skill)
        : [...f.skills, skill],
    }));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employees</h1>
          <p className="text-slate-500">Manage employee database and skills matrix</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}>
          <Plus className="h-4 w-4" />
          Add Employee
        </Button>
      </div>

      {showForm && (
        <Card title={editId ? 'Edit Employee' : 'New Employee'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">First Name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Last Name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Employee Number</label>
                <input
                  type="text"
                  value={form.employee_number}
                  onChange={(e) => setForm({ ...form, employee_number: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Skills</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_SKILLS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.skills.includes(skill)
                        ? 'bg-wine-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Skills Matrix" subtitle={`${employees.length} employees`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">Number</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                {ALL_SKILLS.map((s) => (
                  <th key={s} className="pb-3 px-1 text-center font-medium">{s}</th>
                ))}
                <th className="pb-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">
                    {emp.first_name} {emp.last_name}
                  </td>
                  <td className="py-3 pr-4">{emp.employee_number}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={emp.is_active ? 'green' : 'grey'}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {ALL_SKILLS.map((skill) => (
                    <td key={skill} className="py-3 px-1 text-center">
                      {emp.skills.includes(skill) ? (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                      ) : (
                        <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-200" />
                      )}
                    </td>
                  ))}
                  <td className="py-3">
                    <button
                      onClick={() => handleEdit(emp)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
