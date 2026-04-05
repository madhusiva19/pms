"use client";

import { useState } from 'react';
import styles from './page.module.css';

export default function EvaluateMemberPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
    // Auto-hide the message after 4 seconds
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div className={styles.container}>
      {submitted && (
        <div className={styles.successToast}>
          <div style={{background: '#10B981', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'}}>✓</div>
          <span>Evaluation submitted successfully!</span>
        </div>
      )}

      <div className={styles.mainWrapper}>
        <nav className={styles.breadcrumb}>
          <span>Home</span> <span>/</span> <span>My Team</span> <span>/</span> 
          <span style={{color: '#1E293B'}}>Sarah Johnson</span>
        </nav>

        <div className={styles.headerArea}>
          <h1>Evaluate Team Member</h1>
        </div>

        <section className={styles.profileCard}>
          <div className={styles.profileInfo}>
            <h2>L.E. Senevirathna</h2>
            <p>Asst. General Manager (OL-4) • Custom Brokerage</p>
            <p>Period: Annual Performance 2024</p>
          </div>
          <div className={styles.scoreBadge}>
            <span className={styles.scoreVal}>3.24</span>
            <span className={styles.scoreLabel}>Overall Score</span>
          </div>
        </section>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Objective</th>
                <th className={styles.th}>Weight</th>
                <th className={styles.th}>Target</th>
                <th className={styles.th}>Actual</th>
                <th className={styles.th}>Achieve %</th>
                <th className={styles.th}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {/* Financial Focus */}
              <tr className={styles.categoryRow}><td colSpan={6}>FINANCIAL FOCUS (30%)</td></tr>
              <tr>
                <td className={styles.td}>Revenue Achievement</td>
                <td className={styles.td}>0.10</td>
                <td className={styles.td}>4910.7M</td>
                <td className={styles.td}>4863.1M</td>
                <td className={styles.td}>99.0%</td>
                <td className={styles.td}><span className={styles.badge} style={{background: '#FFEDD5', color: '#9A3412'}}>2.81</span></td>
              </tr>
              <tr>
                <td className={styles.td}>GP Achievement</td>
                <td className={styles.td}>0.10</td>
                <td className={styles.td}>527.52M</td>
                <td className={styles.td}>454.82M</td>
                <td className={styles.td}>86.2%</td>
                <td className={styles.td}><span className={styles.badge} style={{background: '#FEE2E2', color: '#991B1B'}}>1.00</span></td>
              </tr>

              {/* Customer Focus */}
              <tr className={styles.categoryRow}><td colSpan={6}>CUSTOMER FOCUS (30%)</td></tr>
              <tr>
                <td className={styles.td}>NPS Index Score</td>
                <td className={styles.td}>0.10</td>
                <td className={styles.td}>0.35</td>
                <td className={styles.td}>0.27</td>
                <td className={styles.td}>78.0%</td>
                <td className={styles.td}><span className={styles.badge} style={{background: '#FFEDD5', color: '#9A3412'}}>2.00</span></td>
              </tr>
              <tr>
                <td className={styles.td}>GP on Personal Sales</td>
                <td className={styles.td}>0.04</td>
                <td className={styles.td}>-</td>
                <td className={styles.td}>High</td>
                <td className={styles.td}>100%</td>
                <td className={styles.td}><span className={styles.badge} style={{background: '#D1FAE5', color: '#065F46'}}>5.00</span></td>
              </tr>

              {/* HR Focus */}
              <tr className={styles.categoryRow}><td colSpan={6}>HUMAN RESOURCES FOCUS (40%)</td></tr>
              <tr>
                <td className={styles.td}>Statutory & Legal Compliance</td>
                <td className={styles.td}>0.20</td>
                <td className={styles.td}>100%</td>
                <td className={styles.td}>100%</td>
                <td className={styles.td}>100%</td>
                <td className={styles.td}><span className={styles.badge} style={{background: '#FEF9C3', color: '#854D0E'}}>3.00</span></td>
              </tr>
              <tr>
                <td className={styles.td}>360 Degree Feedback</td>
                <td className={styles.td}>0.05</td>
                <td className={styles.td}>0.85</td>
                <td className={styles.td}>0.81</td>
                <td className={styles.td}>95.2%</td>
                <td className={styles.td}><span className={styles.badge} style={{background: '#FEF9C3', color: '#854D0E'}}>3.00</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <section className={styles.aiPanel}>
          <h3>Group Admin Feedback</h3>
          <p style={{fontWeight: 300}}>L.E. Senevirathna is performing strongly in Statutory Compliance and Personal Sales. However, the GP Achievement (86.2%) is currently the primary bottleneck.</p>
          <p style={{marginTop: '16px'}}><strong>Recommendation:</strong> Initiate a cost-audit in the Brokerage department to identify margin leakages. Increasing NPS from 0.27 to 0.35 should be the focus for H2.</p>
        </section>

        <div className={styles.footerActions}>
          <button className={styles.btnSecondary}>Cancel</button>
          <button className={styles.btnSecondary}>Save Draft</button>
          <button className={styles.btnPrimary} onClick={handleSubmit}>Submit Evaluation</button>
        </div>
      </div>
    </div>
  );
}