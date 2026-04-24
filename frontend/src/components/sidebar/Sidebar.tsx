'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FileText, Users, LogOut, TrendingUp, Bell, LucideFileBarChart, User } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import styles from './sidebar.module.css';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

// ── HQ Admin — Level 1
const hqAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/hq-admin/dashboard',        icon: LayoutDashboard    },
  { name: 'Template Management', href: '/hq-admin/templates',         icon: FileText           },
  { name: 'My Team',             href: '/hq-admin/team',              icon: Users              },
  { name: 'Reports',             href: '/hq-admin/reports',           icon: FileText           },
  { name: 'Notifications',        href: '/hq-admin/notification',      icon: Bell               },
  { name: 'Training Passport',        href: '/hq-admin/training-passport', icon: LucideFileBarChart },
  { name: 'My Profile',          href: '/hq-admin/profile',           icon: User               },
];

// ── Country Admin — Level 2
const countryAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/country-admin/dashboard',        icon: LayoutDashboard    },
  { name: 'Template Management', href: '/country-admin/templates',         icon: FileText           },
  { name: 'My Team',             href: '/country-admin/team',              icon: Users              },
  { name: 'My Performance',      href: '/country-admin/performance',       icon: TrendingUp         },
  { name: 'Reports',             href: '/country-admin/reports',           icon: FileText           },
  { name: 'Notifications',        href: '/country-admin/notification',      icon: Bell               },
  { name: 'Training Passport',        href: '/country-admin/training-passport', icon: LucideFileBarChart },
  { name: 'My Profile',          href: '/country-admin/profile',           icon: User               },
];

// ── Branch Admin — Level 3
const branchAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/branch-admin/dashboard',        icon: LayoutDashboard    },
  { name: 'Template Management', href: '/branch-admin/templates',         icon: FileText           },
  { name: 'My Team',             href: '/branch-admin/team',              icon: Users              },
  { name: 'My Performance',      href: '/branch-admin/performance',       icon: TrendingUp         },
  { name: 'Reports',             href: '/branch-admin/reports',           icon: FileText           },
  { name: 'Notifications',        href: '/branch-admin/notification',      icon: Bell               },
  { name: 'Training Passport',        href: '/branch-admin/training-passport', icon: LucideFileBarChart },
  { name: 'My Profile',          href: '/branch-admin/profile',           icon: User               },
];

// ── Dept Admin — Level 4
const deptAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/dept-admin/dashboard',        icon: LayoutDashboard    },
  { name: 'Template Management', href: '/dept-admin/templates',         icon: FileText           },
  { name: 'My Team',             href: '/dept-admin/team',              icon: Users              },
  { name: 'My Performance',      href: '/dept-admin/performance',       icon: TrendingUp         },
  { name: 'Reports',             href: '/dept-admin/reports',           icon: FileText           },
  { name: 'Notifications',        href: '/dept-admin/notification',      icon: Bell               },
  { name: 'Training Passport',        href: '/dept-admin/training-passport', icon: LucideFileBarChart },
  { name: 'My Profile',          href: '/dept-admin/profile',           icon: User               },
];

// ── Sub Dept Admin — Level 5
const subDeptAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/sub-dept-admin/dashboard',        icon: LayoutDashboard    },
  { name: 'Template Management', href: '/sub-dept-admin/templates',         icon: FileText           },
  { name: 'My Team',             href: '/sub-dept-admin/team',              icon: Users              },
  { name: 'My Performance',      href: '/sub-dept-admin/performance',       icon: TrendingUp         },
  { name: 'Reports',             href: '/sub-dept-admin/reports',           icon: FileText           },
  { name: 'Notifications',        href: '/sub-dept-admin/notification',      icon: Bell               },
  { name: 'Training Passport',        href: '/sub-dept-admin/training-passport', icon: LucideFileBarChart },
  { name: 'My Profile',          href: '/sub-dept-admin/profile',           icon: User               },
];

// ── Employee — Level 6
const employeeNavItems: NavItem[] = [
  { name: 'My Performance', href: '/employee/performance',       icon: TrendingUp         },
  { name: 'Notifications',   href: '/employee/notification',      icon: Bell               },
  { name: 'Training Passport',   href: '/employee/training-passport', icon: LucideFileBarChart },
  { name: 'My Profile',     href: '/employee/profile',           icon: User               },
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
  const router   = useRouter();
  const { user } = useAuth();

  const navItems = getNavItems(user?.role);

  const userInitials = user?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const userName = user?.full_name || 'User';
  const userRole = user?.role?.replace(/_/g, ' ') || '';

  const handleLogout = () => {
    localStorage.removeItem('pms_user');
    router.push('/login');
  };

  return (
    <aside className={styles.sidebar}>

      {/* Logo */}
      <div className={styles.brand}>
        <Image
          src="/Dart_Logo_new.png"
          alt="DGL Logo"
          width={160}
          height={56}
          className={styles.brandLogoImg}
          priority
          style={{width: '100%', height: 'auto', maxWidth: '160px'}}
        />
      </div>

      {/* Nav */}
      <nav className={styles.sideNav}>
        {navItems.map((item) => {
          const Icon     = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`${styles.sideItem} ${isActive ? styles.active : ''}`}
            >
              <Icon className={styles.navSvg} />
              <span className={styles.sideLabel}>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={styles.sideFooter}>
        <div className={styles.profileRow}>
          <div className={styles.avatarCircle}>{userInitials}</div>
          <div className={styles.profileText}>
            <div className={styles.profileName}>{userName}</div>
            <div className={styles.profileRole}>{userRole}</div>
          </div>
        </div>
        <button className={styles.logoutBtn} type="button" onClick={handleLogout}>
          <LogOut style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>Logout</span>
        </button>
      </div>

    </aside>
  );
}












