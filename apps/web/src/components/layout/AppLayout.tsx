import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#1a1a1a]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-white dark:bg-[#0f0f0f]">
        <Outlet />
      </main>
    </div>
  );
}
