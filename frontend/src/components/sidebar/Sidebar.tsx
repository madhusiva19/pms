'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, FileText, Users, LogOut, TrendingUp, Bell,
  LucideFileBarChart, User, Target, ChevronDown, ChevronRight,
  ClipboardList, UserCheck,
} from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import styles from './sidebar.module.css';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  children?: NavItem[];
}

const badgeStyle: React.CSSProperties = {
  background: '#ef4444',
  color: '#fff',
  borderRadius: '999px',
  fontSize: '10px',
  fontWeight: 700,
  padding: '1px 5px',
  marginLeft: 'auto',
  minWidth: '18px',
  textAlign: 'center',
  lineHeight: '16px',
  display: 'inline-block',
};

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return <span style={badgeStyle}>{count > 99 ? '99+' : count}</span>;
}

// ── HQ Admin — Level 1
const hqAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/hq-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/hq-admin/templates', icon: FileText },
  { name: 'My Team', href: '/hq-admin/team', icon: Users },
  { name: 'Reports', href: '/hq-admin/reports', icon: FileText },
  { name: 'Notification', href: '/hq-admin/notification', icon: Bell },
  { name: 'Training Passport', href: '/hq-admin/training', icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/hq-admin/potential-assessment', icon: Target, children: [
    { name: 'Team Review',           href: '/hq-admin/potential-assessment',            icon: UserCheck     },
    { name: 'Assessment Components', href: '/hq-admin/potential-assessment/components', icon: ClipboardList },
  ]},
  { name: 'My Profile', href: '/hq-admin/profile', icon: User },
];

// ── Country Admin — Level 2
const countryAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/country-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/country-admin/templates', icon: FileText },
  { name: 'My Team', href: '/country-admin/team', icon: Users },
  { name: 'My Performance', href: '/country-admin/my-performance', icon: TrendingUp },
  { name: 'Reports', href: '/country-admin/reports', icon: FileText },
  { name: 'Notification', href: '/country-admin/notification', icon: Bell },
  { name: 'Training Passport', href: '/country-admin/training', icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/country-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/country-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/country-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile', href: '/country-admin/profile', icon: User },
];

// ── Branch Admin — Level 3
const branchAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/branch-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/branch-admin/templates', icon: FileText },
  { name: 'My Team', href: '/branch-admin/team', icon: Users },
  { name: 'My Performance', href: '/branch-admin/my-performance', icon: TrendingUp },
  { name: 'Reports', href: '/branch-admin/reports', icon: FileText },
  { name: 'Notification', href: '/branch-admin/notification', icon: Bell },
  { name: 'Training Passport', href: '/branch-admin/training', icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/branch-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/branch-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/branch-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile', href: '/branch-admin/profile', icon: User },
];

// ── Dept Admin — Level 4
const deptAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/dept-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/dept-admin/templates', icon: FileText },
  { name: 'My Team', href: '/dept-admin/team', icon: Users },
  { name: 'My Performance', href: '/dept-admin/my-performance', icon: TrendingUp },
  { name: 'Reports', href: '/dept-admin/reports', icon: FileText },
  { name: 'Notification', href: '/dept-admin/notification', icon: Bell },
  { name: 'Training Passport', href: '/dept-admin/training', icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/dept-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/dept-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/dept-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile', href: '/dept-admin/profile', icon: User },
];

// ── Sub Dept Admin — Level 5
const subDeptAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/sub-dept-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/sub-dept-admin/templates', icon: FileText },
  { name: 'My Team', href: '/sub-dept-admin/team', icon: Users },
  { name: 'My Performance', href: '/sub-dept-admin/my-performance', icon: TrendingUp },
  { name: 'Reports', href: '/sub-dept-admin/reports', icon: FileText },
  { name: 'Notification', href: '/sub-dept-admin/notification', icon: Bell },
  { name: 'Training Passport', href: '/sub-dept-admin/training', icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/sub-dept-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/sub-dept-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/sub-dept-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile', href: '/sub-dept-admin/profile', icon: User },
];

const employeeNavItems: NavItem[] = [
  { name: 'My Performance', href: '/employee/my-performance', icon: TrendingUp },
  { name: 'Training Passport', href: '/employee/training', icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/employee/potential-assessment', icon: Target },
  { name: 'Notification', href: '/employee/notification', icon: Bell },
  { name: 'My Profile', href: '/employee/profile', icon: User },
];

function getNavItems(role: string | undefined): NavItem[] {
  switch (role) {
    case 'hq_admin':       return hqAdminNavItems;
    case 'country_admin':  return countryAdminNavItems;
    case 'branch_admin':   return branchAdminNavItems;
    case 'dept_admin':     return deptAdminNavItems;
    case 'sub_dept_admin': return subDeptAdminNavItems;
    case 'employee':       return employeeNavItems;
    default:               return [];
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user, notificationCount, trainingBadgeCount, logout } = useAuth() as any;

  const roleFromPath = pathname?.startsWith('/hq-admin')       ? 'hq_admin'
    : pathname?.startsWith('/country-admin')  ? 'country_admin'
    : pathname?.startsWith('/branch-admin')   ? 'branch_admin'
    : pathname?.startsWith('/dept-admin')     ? 'dept_admin'
    : pathname?.startsWith('/sub-dept-admin') ? 'sub_dept_admin'
    : pathname?.startsWith('/employee')       ? 'employee'
    : undefined;

  const role = user?.role || roleFromPath;
  const navItems = getNavItems(role);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  useEffect(() => {
    if (pathname?.includes('/potential-assessment/')) setDropdownOpen(true);
  }, [pathname]);

  const userInitials = user?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const userName = user?.full_name || 'User';
  const userRole = user?.role || role || '';

  const handleLogout = () => {
    logout?.();
    router.push('/login');
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Image
          src="/Dart_Logo_new.png"
          alt="DGL PMS Logo"
          className={styles.brandLogoImg}
          width={251}
          height={80}
          priority
        />
      </div>

      <nav className={styles.sideNav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;

          if (hasChildren) {
            const isChildActive = item.children!.some(c => pathname === c.href);
            const isOpen = dropdownOpen;
            return (
              <React.Fragment key={item.name}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(prev => !prev)}
                  className={`${styles.sideItem}${isChildActive ? ' ' + styles.active : ''}`}
                >
                  <Icon className={styles.navSvg} />
                  <span className={styles.sideLabel}>{item.name}</span>
                  {isOpen
                    ? <ChevronDown className={styles.dropdownChevron} />
                    : <ChevronRight className={styles.dropdownChevron} />}
                </button>
                {isOpen && item.children!.map((child) => {
                  const ChildIcon = child.icon;
                  const isChildItemActive = pathname === child.href;
                  return (
                    <Link
                      key={child.name}
                      href={child.href}
                      className={`${styles.sideItem} ${styles.childItem}${isChildItemActive ? ' ' + styles.active : ''}`}
                    >
                      <ChildIcon className={styles.navSvg} />
                      <span className={styles.sideLabel}>{child.name}</span>
                    </Link>
                  );
                })}
              </React.Fragment>
            );
          }

          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          const badgeCount = item.name === 'Notification'
            ? (notificationCount || 0)
            : item.name === 'Training Passport'
            ? (trainingBadgeCount || 0)
            : 0;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`${styles.sideItem}${isActive ? ' ' + styles.active : ''}`}
            >
              <Icon className={styles.navSvg} />
              <span className={styles.sideLabel}>{item.name}</span>
              <Badge count={badgeCount} />
            </Link>
          );
        })}
      </nav>

      <footer className={styles.sideFooter}>
        <div className={styles.profileRow}>
          <div className={styles.avatarCircle}>
            {userInitials}
          </div>
          <div className={styles.profileText}>
            <span className={styles.profileName}>{userName}</span>
            <span className={styles.profileRole}>{userRole.replace(/_/g, ' ')}</span>
          </div>
        </div>
        <button type="button" onClick={handleLogout} className={styles.logoutBtn}>
          <LogOut style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>Logout</span>
        </button>
      </footer>
    </aside>
  );
}
