'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

interface Template {
  id: number;
  name: string;
  description: string;
  status: string;
  created_by: string;
}

const API = 'http://127.0.0.1:5000';



export default function TemplatesListPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [inputVal, setInputVal]   = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/templates`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setTemplates(data);
        else setError('Unexpected response from server.');
        setLoading(false);
      })
      .catch(err => {
        setError(`Network error: ${err.message}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const suggestions = inputVal.trim().length > 0
    ? templates.filter(t => t.name.toLowerCase().includes(inputVal.toLowerCase()))
    : [];

  const displayed = inputVal.trim()
    ? templates.filter(t => t.name.toLowerCase().includes(inputVal.toLowerCase()))
    : templates;

  const handleSelect = (t: Template) => {
    setInputVal(t.name);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setInputVal('');
    setShowDropdown(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F9FC',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: '32px',
      boxSizing: 'border-box',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tmpl-card { animation: fadeUp 0.38s ease both; }
        .tmpl-card:nth-child(1) { animation-delay: 0.04s; }
        .tmpl-card:nth-child(2) { animation-delay: 0.08s; }
        .tmpl-card:nth-child(3) { animation-delay: 0.12s; }
        .tmpl-card:nth-child(4) { animation-delay: 0.16s; }
        .tmpl-card:nth-child(5) { animation-delay: 0.20s; }
        .tmpl-card:nth-child(6) { animation-delay: 0.24s; }
        .skel {
          background: linear-gradient(90deg, #E8EEF8 25%, #F0F4FA 50%, #E8EEF8 75%);
          background-size: 400px 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 6px;
        }
        .view-btn {
          display: flex; align-items: center; justify-content: center;
          width: 100%; padding: 0 12px; height: 32px;
          border-radius: 6px; font-size: 13.1px;
          font-weight: 500; font-family: 'Inter', inherit;
          background: #2563EB; color: #fff;
          border: none; cursor: pointer; text-decoration: none;
          transition: background 0.15s, box-shadow 0.15s;
          box-sizing: border-box; line-height: 20px;
        }
        .view-btn:hover {
          background: #1D4ED8;
          box-shadow: 0 4px 12px rgba(37,99,235,0.35);
        }
        .sugg-item {
          padding: 9px 12px; font-size: 13px; color: #1E293B;
          cursor: pointer; display: flex; align-items: center; gap: 10px;
          border-radius: 7px; transition: background 0.12s;
        }
        .sugg-item:hover { background: #EFF6FF; color: #2563EB; }
        .search-field {
          width: 100%; height: 42px;
          padding: 0 42px 0 44px;
          border: 1.5px solid #E2E8F0;
          outline: none;
          background: #fff;
          border-radius: 8px;
          font-size: 13.5px; color: #1E293B;
          font-family: 'Inter', inherit;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .search-field:focus {
          border-color: #2563EB;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
        }
        .search-field::placeholder { color: #A0ABBB; }
      `}</style>

      <div style={{ maxWidth: 1218, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28, animation: 'fadeUp 0.32s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13.5, color: '#64748B' }}>
            <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#2563EB')}
              onMouseLeave={e => (e.currentTarget.style.color = '#64748B')}
            >Home</Link>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3L9 7L5 11" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ color: '#1E293B' }}>Template Management</span>
          </div>
          <h1 style={{ fontSize: 27.7, fontWeight: 600, color: '#101828', margin: '0 0 8px', lineHeight: '36px' }}>
            Template Management
          </h1>
          <p style={{ fontSize: 14.6, color: '#4A5565', margin: 0, lineHeight: '24px' }}>
            Select an evaluation template to view, edit, or manage assignments
          </p>
        </div>

        {/* Search */}
        {!loading && !error && (
          <div style={{ marginBottom: 32, maxWidth: 520 }} ref={searchRef}>
            <div style={{ position: 'relative' }}>
              {/* Search icon */}
              <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}
                width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle cx="8.5" cy="8.5" r="5.5" stroke="#A0ABBB" strokeWidth="1.67"/>
                <path d="M13.5 13.5L17 17" stroke="#A0ABBB" strokeWidth="1.67" strokeLinecap="round"/>
              </svg>

              <input
                className="search-field"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={e => { if (e.key === 'Escape') setShowDropdown(false); }}
                placeholder="Search templates…"
              />

              {/* Clear button */}
              {inputVal && (
                <button onClick={handleClear} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: '#F1F5F9', border: 'none', borderRadius: '50%',
                  width: 22, height: 22, cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}

              {/* Suggestions dropdown */}
              {showDropdown && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: '#fff', border: '1.5px solid #E2E8F0',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.09)',
                  zIndex: 200, padding: 6, animation: 'dropIn 0.14s ease',
                }}>
                  {suggestions.map(t => (
                    <div key={t.id} className="sugg-item" onMouseDown={() => handleSelect(t)}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, background: '#EFF6FF',
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2563EB' }}>{getAbbr(t.name)}</span>
                      </div>
                      {t.name}
                    </div>
                  ))}
                </div>
              )}
              {showDropdown && inputVal.trim().length > 0 && suggestions.length === 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                  background: '#fff', border: '1.5px solid #E2E8F0',
                  borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.09)',
                  zIndex: 200, padding: '12px 16px', fontSize: 13, color: '#A0ABBB',
                }}>
                  No templates match "{inputVal}"
                </div>
              )}
            </div>
          </div>
        )}

        {/* Skeletons */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                background: '#fff', borderRadius: 12, padding: '20px',
                border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div className="skel" style={{ width: 48, height: 48, borderRadius: 12, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skel" style={{ height: 14, width: '80%', marginBottom: 8 }} />
                    <div className="skel" style={{ height: 11, width: '50%' }} />
                  </div>
                </div>
                <div className="skel" style={{ height: 32, width: '100%', borderRadius: 6 }} />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '20px 24px', maxWidth: 520 }}>
            <div style={{ fontWeight: 600, color: '#DC2626', fontSize: 14, marginBottom: 6 }}>⚠️ Failed to load templates</div>
            <div style={{ fontSize: 13, color: '#7F1D1D', fontFamily: 'monospace' }}>{error}</div>
            <p style={{ fontSize: 12.5, color: '#64748B', marginTop: 10, marginBottom: 0 }}>Make sure Flask is running on port 5000.</p>
          </div>
        )}

        {/* Cards grid */}
        {!loading && !error && displayed.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
            {displayed.map((tmpl, idx) => (
              <TemplateCard key={tmpl.id} tmpl={tmpl} index={idx} />
            ))}
          </div>
        )}

        {/* No search results */}
        {!loading && !error && inputVal.trim() && displayed.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', margin: '0 0 6px' }}>No templates found</p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 16px' }}>No match for "<strong>{inputVal}</strong>"</p>
            <button onClick={handleClear} style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid #BFDBFE',
              background: '#EFF6FF', color: '#2563EB', fontWeight: 500,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>Clear search</button>
          </div>
        )}

        {/* Empty DB */}
        {!loading && !error && templates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1E293B', margin: '0 0 6px' }}>No templates found</p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Templates added to the database will appear here automatically.</p>
          </div>
        )}

      </div>
    </div>
  );
}

function getAbbr(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const skip = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'in', 'to']);
  const m = words.filter(w => !skip.has(w.toLowerCase()));
  if (m.length >= 2) return (m[0][0] + m[1][0]).toUpperCase();
  return (words[0][0] + (words[1]?.[0] ?? words[0][1])).toUpperCase();
}

function TemplateCard({ tmpl, index }: { tmpl: Template; index: number }) {
  const [hovered, setHovered] = useState(false);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);
  const abbr = getAbbr(tmpl.name);

  useEffect(() => {
    fetch(`${API}/api/templates/${tmpl.id}/assignments`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAssignedCount(data.length); })
      .catch(() => setAssignedCount(0));
  }, [tmpl.id]);

  return (
    <div
      className="tmpl-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        boxShadow: hovered
          ? '0 8px 24px rgba(37,99,235,0.11), 0 2px 8px rgba(0,0,0,0.05)'
          : '0 1px 4px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.2s, transform 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      <div style={{ padding: '23.8px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

        {/* Icon + Name row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: '#EFF6FF', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 4H20L26 10V28H8V4Z" stroke="#155DFC" strokeWidth="2.13" strokeLinejoin="round"/>
              <path d="M20 4V10H26" stroke="#155DFC" strokeWidth="2.13" strokeLinejoin="round"/>
              <path d="M12 16H20M12 20H20M12 24H16" stroke="#155DFC" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#101828', lineHeight: '26px', flex: 1, minWidth: 0 }}>
            {tmpl.name}
          </h3>
        </div>

        {/* Meta rows — below both icon and name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Made by */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M2 14c0-2.21 2.686-4 6-4s6 1.79 6 4" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="8" cy="5.5" r="2.5" stroke="#94A3B8" strokeWidth="1.4"/>
            </svg>
            <span style={{ fontSize: 12.7, color: '#94A3B8', lineHeight: '20px' }}>
              Made by {tmpl.created_by || 'Group Admin'}
            </span>
          </div>
          {/* Assigned count */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="5.5" cy="5" r="2" stroke="#94A3B8" strokeWidth="1.4"/>
              <circle cx="10.5" cy="5" r="2" stroke="#94A3B8" strokeWidth="1.4"/>
              <path d="M1 13c0-1.66 2.015-3 4.5-3" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M8 13c0-1.66 2.015-3 4.5-3s4.5 1.34 4.5 3" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            {assignedCount === null ? (
              <div style={{ height: 11, width: 90, borderRadius: 4, background: 'linear-gradient(90deg,#E8EEF8 25%,#F0F4FA 50%,#E8EEF8 75%)', backgroundSize: '400px 100%', animation: 'shimmer 1.4s infinite' }} />
            ) : (
              <span style={{ fontSize: 12.7, color: '#94A3B8', lineHeight: '20px' }}>
                {assignedCount} {assignedCount === 1 ? 'employee' : 'employees'} assigned
              </span>
            )}
          </div>
        </div>

        {/* Full-width CTA button */}
        <Link href={`/view-template/${tmpl.id}`} className="view-btn">
          View Template
        </Link>

      </div>
    </div>
  );
}