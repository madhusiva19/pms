"use client";
import Sidebar from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles from "@/components/templatedashboard/TemplateDashboardBase.module.css";

export default function BranchAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.dashShell}>
      <Sidebar />
      <main className={styles.mainContent}>
        <Breadcrumb />
        {children}
      </main>
    </div>
  );
}