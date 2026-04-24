'use client';

import React from 'react';
import styles from './page.module.css';

export default function DashboardPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>Welcome to the Performance Management System Dashboard</p>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Overview</h2>
          <p className={styles.cardText}>
            View performance metrics, team evaluations, and key performance indicators at a glance.
          </p>
        </div>

        <div className={styles.statsSection}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Total Evaluations</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Completed</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>Pending</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>0</div>
            <div className={styles.statLabel}>In Progress</div>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Quick Actions</h2>
          <div className={styles.actionButtons}>
            <a href="/my-team" className={styles.actionButton}>
              View My Team
            </a>
            <a href="/template-management" className={styles.actionButton}>
              Manage Templates
            </a>
            <a href="/reports" className={styles.actionButton}>
              View Reports
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
