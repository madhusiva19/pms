'use client';

import Sidebar from "@/components/sidebar/Sidebar";
import { AuthProvider } from "@/lib/auth-context";

export default function HqAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: "auto", minWidth: 0, background: "#f4f6fb" }}>
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}