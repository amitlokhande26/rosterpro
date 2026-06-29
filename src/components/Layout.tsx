import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Settings,
  Wine,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dataService } from '@/services/dataService';
import { localStore } from '@/services/localStore';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/schedule', label: 'Production Schedule', icon: Calendar },
  { to: '/roster', label: 'Roster Board', icon: ClipboardList },
  { to: '/admin', label: 'Administration', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [resetting, setResetting] = useState(false);

  const handleResetRoster = async () => {
    if (
      !confirm(
        'Reset roster?\n\nThis clears all production jobs and shift assignments. Employees and settings are kept.',
      )
    ) {
      return;
    }
    setResetting(true);
    await dataService.resetRoster();
    localStore.reload();
    setResetting(false);
    window.location.reload();
  };

  const handleResetAll = async () => {
    if (
      !confirm(
        'Reset everything?\n\nThis restores all defaults — jobs, assignments, employees, and settings.',
      )
    ) {
      return;
    }
    setResetting(true);
    await dataService.resetAll();
    localStore.reload();
    setResetting(false);
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="no-print fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wine-600 text-white">
            <Wine className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Roster Pro</h1>
            <p className="text-xs text-slate-500">Labour Allocation</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-wine-50 text-wine-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <p className="mb-3 px-1 text-xs text-slate-500">Data saved in this browser</p>
          <button
            onClick={handleResetRoster}
            disabled={resetting}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Roster
          </button>
          <button
            onClick={handleResetAll}
            disabled={resetting}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Everything
          </button>
        </div>
      </aside>

      <main className="ml-64 flex-1">
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
