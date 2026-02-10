"use client";
import React, { cache, useState } from "react";
import styles from "./login.module.css";

export default function LoginPage() {
    const handleSignIn = async () => {
  try {
    const res = await fetch("/api/health",{ cache: "no-store" });
    const data = await res.json();
    console.log("Backend response:", data);
    alert("Backend connected ✅");
  } catch (err) {
    console.error("Backend connection failed:", err);
    alert("Backend connection failed ❌");
  }
};
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className={styles.page}>
      <div className={styles.bgImage} />
      <div className={styles.overlay} />

      <main className={styles.container}>
        <section className={styles.card}>
          <header className={styles.header}>
            <div className={styles.iconBox} aria-hidden="true">
              {/* simple icon box (you can replace with logo later) */}
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 21V3h10v18M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <h1 className={styles.title}>Performance Management System</h1>
            <p className={styles.subtitle}>Enterprise Performance Tracking &amp; Evaluation</p>
          </header>

          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <div className={styles.field}>
              <label className={styles.label}>Email Address</label>
              <div className={styles.inputWrap}>
                <span className={styles.leftIcon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 6h16v12H4V6Z"
                      stroke="#99A1AF"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4.5 7l7.5 6 7.5-6"
                      stroke="#99A1AF"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.leftIcon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 11V8a5 5 0 0 1 10 0v3"
                      stroke="#99A1AF"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6 11h12v9H6v-9Z"
                      stroke="#99A1AF"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button className={styles.primaryBtn} type="button" onClick={handleSignIn}>
            Sign In
            </button>

            <div className={styles.divider}>
              <span className={styles.line} />
              <span className={styles.or}>OR</span>
              <span className={styles.line} />
            </div>

            <button className={styles.msBtn} type="button">
              <span className={styles.msIcon} aria-hidden="true">
                <span className={`${styles.msSq} ${styles.msRed}`} />
                <span className={`${styles.msSq} ${styles.msGray}`} />
                <span className={`${styles.msSq} ${styles.msGreen}`} />
                <span className={`${styles.msSq} ${styles.msYellow}`} />
              </span>
              Sign in with Microsoft
            </button>
          </form>
        </section>

        <p className={styles.footer}>© 2026 PerformancePro. All rights reserved.</p>
      </main>
    </div>
  );
}