import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '../components/sidebar/Sidebar';
import { AuthProvider } from '@/lib/auth-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = { title: 'PMS - Dart Global Logistics' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#F9FAFB' }}>
        <AuthProvider>
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            <main style={{ flex: 1, minWidth: 0, overflow: 'auto', marginLeft: '251px' }}>
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}