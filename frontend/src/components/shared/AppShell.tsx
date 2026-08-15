'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar/Sidebar';
import Header from './Header';
import styles from './AppShell.module.css';

const AUTH_ROUTES = ['/login', '/', '/reset-password'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!pathname || AUTH_ROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className={styles.shell}>
      <Sidebar />
      <Header />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}