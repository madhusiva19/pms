import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '../components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = { title: 'PMS - Dart Global Logistics' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#F9FAFB' }}>
        <Sidebar />
        <div style={{ marginLeft: '256px', minHeight: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  );
}