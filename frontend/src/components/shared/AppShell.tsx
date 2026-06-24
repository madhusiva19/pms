'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar/Sidebar';

const AUTH_ROUTES = ['/login', '/', '/reset-password'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!pathname || AUTH_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F8F9FC' }}>
      <Sidebar />
      <main style={{
        marginLeft: '251px',
        flex: 1,
        minWidth: 0,
        overflowY: 'auto',
        display: 'block',
      }}>
        {children}
      </main>
    </div>
  );
}