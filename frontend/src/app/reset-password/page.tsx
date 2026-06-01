"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [status,    setStatus]    = useState<"idle"|"success"|"error">("idle");
  const [msg,       setMsg]       = useState("");
  const [token,     setToken]     = useState("");

 useEffect(() => {
  // Get token from URL search params
  const params    = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const type      = params.get("type");

  if (tokenHash && type === "recovery") {
    setToken(tokenHash);
  } else {
    setStatus("error");
    setMsg("Invalid or expired reset link. Please request a new one.");
  }
}, []);

  const handleReset = async () => {
    if (!password || !confirm) {
      setStatus("error");
      setMsg("Please fill in both fields.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setMsg("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setStatus("error");
      setMsg("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setStatus("idle");

    try {
      const res  = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/reset-password`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token, password }),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMsg(data.message || "Reset failed. Please try again.");
        return;
      }

      setStatus("success");
      setMsg("Password reset successfully! You can close this tabb and login. ");

    } catch {
      setStatus("error");
      setMsg("Cannot connect to server. Please try again.");
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

          {/* Header */}
          <header className={styles.header}>
            <div className={styles.logoBox}>
              <img src="/Dart_Logo_new.png" alt="Dart Global Logistics"
                className={styles.logo} />
            </div>
            <div className={styles.brandBadge}>
              <span className={styles.brandDot} />
              <span className={styles.brandBadgeText}>Password Reset</span>
              <span className={styles.brandDot} />
            </div>
            <h1 className={styles.title}>Set New Password</h1>
            <div className={styles.brandDivider} />
            <p className={styles.subtitle}>
              Dart Global Logistics · Secure Access Portal
            </p>
          </header>

          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>

            {/* New Password */}
            <div className={styles.field}>
              <label className={styles.label}>New Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.leftIcon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="#99A1AF"
                      strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M6 11h12v9H6v-9Z" stroke="#99A1AF"
                      strokeWidth="1.6" strokeLinejoin="round"/>
                  </svg>
                </span>
                <input className={styles.input} type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || status === "success"} />
              </div>
            </div>

            {/* Confirm Password */}
            <div className={styles.field}>
              <label className={styles.label}>Confirm Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.leftIcon} aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="#99A1AF"
                      strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M6 11h12v9H6v-9Z" stroke="#99A1AF"
                      strokeWidth="1.6" strokeLinejoin="round"/>
                  </svg>
                </span>
                <input className={styles.input} type="password"
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading || status === "success"} />
              </div>
            </div>

            <p className={styles.hintText}>
                 Minimum 8 characters required
            </p>


            
{status === "error" && (
  <div className={`${styles.statusBox} ${styles.statusError}`}>
    <span>⚠️</span>
    {msg}
  </div>
)}
            {/* Submit button */}
{status !== "success" && (
  <button className={styles.primaryBtn} type="button"
    onClick={handleReset} disabled={loading || !token}>
    {loading ? "Resetting..." : "Reset Password"}
  </button>
)}

{status === "success" && (
                <div className={`${styles.statusBox} ${styles.statusSuccess}`}>
                    <span>✅</span>
                <div>
                    <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        Password reset successfully!
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.85 }}>
                        Close this tab and sign in with your new password.
                </div>
                </div>
            </div>
            )}

          </form>
        </section>

        <p className={styles.footer}>© 2026 PerformancePro. All rights reserved.</p>
      </main>
    </div>
  );
}