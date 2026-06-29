import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { RosterPage } from '@/pages/RosterPage';
import { AdminPage } from '@/pages/AdminPage';

function AppLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout><DashboardPage /></AppLayout>} />
        <Route path="/schedule" element={<AppLayout><SchedulePage /></AppLayout>} />
        <Route path="/roster" element={<AppLayout><RosterPage /></AppLayout>} />
        <Route path="/admin" element={<AppLayout><AdminPage /></AppLayout>} />
        <Route path="/assignments" element={<Navigate to="/" replace />} />
        <Route path="/employees" element={<Navigate to="/" replace />} />
        <Route path="/reports" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
