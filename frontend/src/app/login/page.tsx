"use client";
import React, { useState } from "react";
import styles from "./login.module.css";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSignIn = async () => {
    if (!email || !password) {
      alert("Email and password are required");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Login failed");
        return;
      }

      // Simplified: If the backend gives us a path, go there immediately
      if (data.redirectTo) {
      // Save user session to localStorage
      localStorage.setItem("pms_user", JSON.stringify({
        employee_id: data.employee_id,
        full_name: data.full_name,
        email: data.email,
        org_level: data.org_level,
        role: data.role,
        iata_branch_code: data.iata_branch_code,
      }));

  router.push(data.redirectTo);

      } else {
        // Fallback in case a new role is added to USERS but not ROLE_REDIRECTS in app.py
        alert("Login successful, but no dashboard path was found for your role.");
      }
    } catch (err) {
      alert("Cannot connect to the server. Is the Flask backend running? ❌");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgImage} />
      <div className={styles.overlay} />

      <main className={styles.container}>
        <section className={styles.card}>
          <header className={styles.header}>
            <div className={styles.logoBox}>
              <img
                src="/dgl-logo.svg"
                alt="Dart Global Logistics"
                className={styles.logo}
              />
            </div>

            <h1 className={styles.title}>Performance Management System</h1>
            <p className={styles.subtitle}>
              Enterprise Performance Tracking &amp; Evaluation
            </p>
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
                  disabled={loading}
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
                  disabled={loading}
                />
              </div>
            </div>

            <button
              className={styles.primaryBtn}
              type="button"
              onClick={handleSignIn}
              disabled={loading}
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>

            <div className={styles.divider}>
              <span className={styles.line} />
              <span className={styles.or}>OR</span>
              <span className={styles.line} />
            </div>

            <button className={styles.msBtn} type="button" disabled={loading}>
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

        <p className={styles.footer}>
          © 2026 PerformancePro. All rights reserved.
        </p>
      </main>
    </div>
  );
}
