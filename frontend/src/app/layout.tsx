import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Sidebar from '@/components/Sidebar';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Performance Management System',
  description: 'Digital Employee Performance Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <div className="flex h-screen bg-[#F8F9FC] overflow-hidden">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-8 pb-12 px-10">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}