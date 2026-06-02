"use client";
import { useRef, useState } from "react";

interface AvatarUploadProps {
  currentUrl:  string | null;
  initials:    string;
  employeeId:  string;
  onUpdate:    (newUrl: string | null) => void;
  avatarBg:    string;
  viewMode?:   "own" | "supervisor";
}

export default function AvatarUpload({
  currentUrl, initials, employeeId, onUpdate, avatarBg, viewMode = "own"
}: AvatarUploadProps) {
  const fileInputRef              = useRef<HTMLInputElement>(null);
  const [preview, setPreview]     = useState<string | null>(null);
  const [showMenu, setShowMenu]   = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState("");
  const avatarRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, WebP allowed"); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be under 2MB"); return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => { setPreview(reader.result as string); setShowModal(true); };
    reader.readAsDataURL(file);
    setShowMenu(false);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("employee_id", employeeId);
      const res  = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/upload-avatar`, {
        method: "POST", body: formData
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "Upload failed"); return; }
      onUpdate(data.avatar_url);
      setShowModal(false);
      setPreview(null);
    } catch { setError("Upload failed. Try again."); }
    finally { setUploading(false); }
  };

  const handleRemove = async () => {
    setShowMenu(false);
    if (!confirm("Remove profile picture?")) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/profile/remove-avatar/${employeeId}`,
        { method: "DELETE" });
      onUpdate(null);
    } catch { setError("Failed to remove"); }
  };

  return (
    <>
      {/* ── Avatar with overlay menu ── */}
      <div style={{ position: "relative", display: "inline-block" }}>

        {/* Avatar circle */}
        <div style={{
          width: "88px", height: "88px", borderRadius: "50%",
          background: currentUrl ? "transparent" : avatarBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", border: "3px solid rgba(255,255,255,0.9)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          cursor: viewMode === "own" ? "pointer" : "default",
          transition: "box-shadow 0.2s",
          flexShrink: 0,
        }}
          onClick={() => viewMode === "own" && setShowMenu(!showMenu)}
          ref={avatarRef}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ color: "#fff", fontSize: "28px", fontWeight: 800,
              fontFamily: "'Segoe UI', Inter, sans-serif", letterSpacing: "-0.5px" }}>
              {initials}
            </span>
          )}
        </div>

        {/* Edit badge */}
        {viewMode === "own" && (
          <div
            onClick={() => setShowMenu(!showMenu)}
            style={{
              position: "absolute", bottom: "2px", right: "2px",
              width: "22px", height: "22px", borderRadius: "50%",
              background: "#2563EB", border: "2px solid #fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", boxShadow: "0 2px 6px rgba(37,99,235,0.4)",
              transition: "transform 0.15s",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
        )}

        {/* Dropdown menu — fixed position near avatar */}
{showMenu && viewMode === "own" && (
  <>
    {/* Backdrop */}
    <div 
      style={{ position: "fixed", inset: 0, zIndex: 99 }}
      onClick={() => setShowMenu(false)} 
    />

    {/* Floating menu — fixed so it doesn't affect layout */}
    <div style={{
      position:     "fixed",
      top:          avatarRef.current 
                      ? avatarRef.current.getBoundingClientRect().bottom + 8 
                      : "auto",
      left:         avatarRef.current 
                      ? avatarRef.current.getBoundingClientRect().left 
                      : "auto",
      background:   "#fff",
      borderRadius: "12px",
      boxShadow:    "0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
      border:       "1px solid #E5E7EB",
      minWidth:     "180px",
      overflow:     "hidden",
      zIndex:       100,
    }}>
      <button
        onClick={() => { fileInputRef.current?.click(); setShowMenu(false); }}
        style={{
          width: "100%", padding: "11px 16px", background: "none",
          border: "none", textAlign: "left", cursor: "pointer",
          fontSize: "13px", fontWeight: 600, color: "#374151",
          display: "flex", alignItems: "center", gap: "10px",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="#6B7280" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {currentUrl ? "Change Photo" : "Upload Photo"}
      </button>

      {currentUrl && (
        <>
          <div style={{ height: "1px", background: "#F3F4F6", margin: "0 12px" }} />
          <button
            onClick={handleRemove}
            style={{
              width: "100%", padding: "11px 16px", background: "none",
              border: "none", textAlign: "left", cursor: "pointer",
              fontSize: "13px", fontWeight: 600, color: "#EF4444",
              display: "flex", alignItems: "center", gap: "10px",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#FEF2F2")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
            Remove Photo
          </button>
        </>
      )}
    </div>
  </>
)}
      </div>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }} onChange={handleFileChange} />

      {/* Preview Modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#fff", borderRadius: "20px", padding: "32px 28px",
            width: "340px", textAlign: "center",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>
            <h3 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: 700, color: "#111827" }}>
              Preview Photo
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#9CA3AF" }}>
              This will be displayed on your profile
            </p>

            {/* Preview */}
            <div style={{
              width: "110px", height: "110px", borderRadius: "50%",
              overflow: "hidden", margin: "0 auto 20px",
              border: "4px solid #EFF6FF",
              boxShadow: "0 4px 16px rgba(37,99,235,0.15)"
            }}>
              {preview && <img src={preview} alt="Preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>

            {error && (
              <p style={{ color: "#EF4444", fontSize: "13px", marginBottom: "12px",
                background: "#FEF2F2", padding: "8px 12px", borderRadius: "8px" }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { setShowModal(false); setPreview(null); }}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "#fff",
                  cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151"
                }}>
                Cancel
              </button>
              <button onClick={() => { fileInputRef.current?.click(); }}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "1.5px solid #E5E7EB", background: "#F9FAFB",
                  cursor: "pointer", fontSize: "13px", fontWeight: 600, color: "#374151"
                }}>
                Retake
              </button>
              <button onClick={handleUpload} disabled={uploading}
                style={{
                  flex: 1, padding: "10px", borderRadius: "10px",
                  border: "none", background: uploading ? "#93C5FD" : "#2563EB",
                  color: "#fff", cursor: uploading ? "not-allowed" : "pointer",
                  fontSize: "13px", fontWeight: 700,
                  transition: "background 0.2s"
                }}>
                {uploading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}