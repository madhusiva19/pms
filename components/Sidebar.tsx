'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, FileText, Users, BarChart3, LogOut, TrendingUp } from 'lucide-react';

const navItems = [
  { href: '/dashboard',       label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/view-template',   label: 'Template Management', icon: FileText },
  { href: '/my-performance',  label: 'My Performance',      icon: TrendingUp },
  { href: '/team',            label: 'My Team',             icon: Users },
  { href: '/reports',         label: 'Reports',             icon: BarChart3 },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside style={{ width: '256px', minHeight: '100vh', background: '#1C398E', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 0 }}>

      {/* ── Logo Section ── */}
      <div style={{ height: '97px', padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div style={{ width: '139px', height: '55px', position: 'relative' }}>
          <Image
            src="/pmslogo.png"
            alt="DGL PMS Logo"
            fill
            style={{ objectFit: 'contain', objectPosition: 'left' }}
            priority
          />
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ height: '1px', background: '#1E40AF' }} />

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '0 16px', height: '48px', borderRadius: '8px',
              textDecoration: 'none',
              background: active ? '#3B82F6' : 'transparent',
              color: active ? '#FFFFFF' : '#DBEAFE',
              fontSize: '15px', fontFamily: 'Inter',
              transition: 'background 0.15s',
            }}>
              <Icon size={20} style={{ flexShrink: 0 }} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ── User Profile ── */}
      <div style={{ padding: '16px', borderTop: '1px solid #1E40AF', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%', background: '#3B82F6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0,
          }}>KP</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '14px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Kasun Perera</p>
            <p style={{ color: '#BEDBFF', fontSize: '12px', margin: 0 }}>Admin</p>
          </div>
        </div>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '0 12px', height: '36px', borderRadius: '6px',
            background: 'transparent', border: 'none',
            color: '#DBEAFE', cursor: 'pointer', width: '100%',
            fontSize: '13.5px', fontWeight: 500,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1E40AF')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut size={16} style={{ flexShrink: 0 }} />
          Logout
        </button>
      </div>
    </aside>
  );
}