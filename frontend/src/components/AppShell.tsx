'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

const AUTH_ROUTES = ['/login', '/'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (AUTH_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FC]">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
