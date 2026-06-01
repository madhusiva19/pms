"use client";
import React, { useState } from "react";
import styles from "./login.module.css";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router    = useRouter();
  const { setUser } = useAuth();

  // Sign in state
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);

  // Forgot password state
  const [forgotMode,    setForgotMode]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState("");
  const [forgotStatus,  setForgotStatus]  = useState<"idle"|"success"|"error">("idle");
  const [forgotMsg,     setForgotMsg]     = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    if (!email || !password) { alert("Email and password are required"); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) { alert(data.message || "Login failed"); return; }

      if (data.redirect) {
        const userData = {
          id:               data.user.id,
          employee_id:      data.user.id,
          full_name:        data.user.full_name,
          email:            data.user.email,
          org_level:        data.user.org_level,
          role:             data.user.role,
          iata_branch_code: data.user.iata_branch_code,
          country_id:       data.user.country_id,
          branch_id:        data.user.branch_id,
          dept_id:          data.user.dept_id,
          sub_dept_id:      data.user.sub_dept_id,
          avatar_url:       data.user.avatar_url || null,
        };
        localStorage.setItem("pms_user", JSON.stringify(userData));
        document.cookie = "pms_auth=1; path=/; max-age=604800; SameSite=Lax";
        setUser(userData);
        router.push(data.redirect);
      } else {
        alert("Login successful, but no dashboard path was found for your role.");
      }
    } catch (err) {
      alert("Cannot connect to the server. Is the Flask backend running? ❌");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      setForgotStatus("error");
      setForgotMsg("Please enter your email address.");
      return;
    }
    setForgotLoading(true);
    setForgotStatus("idle");
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/forgot-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      setForgotStatus("success");
      setForgotMsg("If this email exists in our system, a reset link has been sent. Please check your inbox.");
    } catch {
      setForgotStatus("error");
      setForgotMsg("Cannot connect to server. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const openForgot = () => {
    setForgotMode(true);
    setForgotStatus("idle");
    setForgotMsg("");
    setForgotEmail("");
  };

  const closeForgot = () => {
    setForgotMode(false);
    setForgotStatus("idle");
    setForgotMsg("");
    setForgotEmail("");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.bgImage} />
      <div className={styles.overlay} />

      <main className={styles.container}>
        <section className={styles.card}>

                    {/* Header */}
          <header className={styles.header}>

            {/* Logo */}
            <div className={styles.logoBox}>
              <img
                src="/Dart_Logo_new.png"
                alt="Dart Global Logistics"
                className={styles.logo}
              />
            </div>

          {/* Brand text */}
            <div className={styles.brandRow}>
              <span className={styles.brandTag}>
                <span className={styles.brandDot} />
                
              </span>

              <h1 className={styles.title}>
                Performance <span className={styles.titleAccent}>Management</span>
              </h1>
              <h1 className={styles.title} style={{ marginTop: "-2px" }}>
                System
              </h1>

              <p className={styles.subtitle}>
                Dart Global Logistics Inc. — Workforce Analytics &amp; Evaluation
              </p>

              <div className={styles.dividerLine} />
            </div>

          </header>

          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>

            {!forgotMode ? (
              /* ── Sign In ── */
              <>
                {/* Email field */}
                <div className={styles.field}>
                  <label className={styles.label}>Email Address</label>
                  <div className={styles.inputWrap}>
                    <span className={styles.leftIcon} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M4 6h16v12H4V6Z" stroke="#99A1AF" strokeWidth="1.6" strokeLinejoin="round"/>
                        <path d="M4.5 7l7.5 6 7.5-6" stroke="#99A1AF" strokeWidth="1.6" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <input className={styles.input} type="email"
                      placeholder="Enter your email"
                      value={email} onChange={(e) => setEmail(e.target.value)}
                      disabled={loading} />
                  </div>
                </div>

                {/* Password field */}
                <div className={styles.field}>
                  <div className={styles.passwordLabelRow}>
                    <label className={styles.label}>Password</label>
                    <button type="button" className={styles.forgotLink} onClick={openForgot}>
                      Forgot password?
                    </button>
                  </div>
                  <div className={styles.inputWrap}>
                    <span className={styles.leftIcon} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="#99A1AF" strokeWidth="1.6" strokeLinecap="round"/>
                        <path d="M6 11h12v9H6v-9Z" stroke="#99A1AF" strokeWidth="1.6" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <input className={styles.input} type="password"
                      placeholder="Enter your password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      disabled={loading} />
                  </div>
                </div>

                <button className={styles.primaryBtn} type="button"
                  onClick={handleSignIn} disabled={loading}>
                  {loading ? "Signing In..." : "Sign In"}
                </button>

                <div className={styles.divider}>
                  <span className={styles.line}/>
                  <span className={styles.or}>OR</span>
                  <span className={styles.line}/>
                </div>

                <button className={styles.msBtn} type="button" disabled={loading}>
                  <span className={styles.msIcon} aria-hidden="true">
                    <span className={`${styles.msSq} ${styles.msRed}`}/>
                    <span className={`${styles.msSq} ${styles.msGray}`}/>
                    <span className={`${styles.msSq} ${styles.msGreen}`}/>
                    <span className={`${styles.msSq} ${styles.msYellow}`}/>
                  </span>
                  Sign in with Microsoft
                </button>
              </>

            ) : (
              /* ── Forgot Password ── */
              <>
                {/* Header */}
                <div className={styles.resetHeader}>
                  <div className={styles.resetIconBox}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                      stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="M2 7l10 7 10-7"/>
                    </svg>
                  </div>
                  <h2 className={styles.resetTitle}>Reset Password</h2>
                  <p className={styles.resetSubtitle}>
                    Enter your work email and we'll send a reset link if the account exists.
                  </p>
                </div>

                {/* Email input */}
                <div className={styles.field}>
                  <label className={styles.label}>Work Email</label>
                  <div className={styles.inputWrap}>
                    <span className={styles.leftIcon} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <path d="M4 6h16v12H4V6Z" stroke="#99A1AF" strokeWidth="1.6" strokeLinejoin="round"/>
                        <path d="M4.5 7l7.5 6 7.5-6" stroke="#99A1AF" strokeWidth="1.6" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <input className={styles.input} type="email"
                      placeholder="Enter your work email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      disabled={forgotLoading || forgotStatus === "success"} />
                  </div>
                </div>

                {/* Status message */}
                {forgotStatus !== "idle" && (
                  <div className={`${styles.statusBox} ${
                    forgotStatus === "success" ? styles.statusSuccess : styles.statusError
                  }`}>
                    <span>{forgotStatus === "success" ? "✅" : "⚠️"}</span>
                    {forgotMsg}
                  </div>
                )}

                {/* Send button */}
                {forgotStatus !== "success" && (
                  <button className={styles.primaryBtn} type="button"
                    onClick={handleForgotPassword} disabled={forgotLoading}>
                    {forgotLoading ? "Sending..." : "Send Reset Link"}
                  </button>
                )}

                {/* Back button */}
                <button type="button" className={styles.backBtn} onClick={closeForgot}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                  Back to Sign In
                </button>
              </>
            )}

          </form>
        </section>

        <p className={styles.footer}>© 2026 PMS. All rights reserved.</p>
      </main>
    </div>
  );
}