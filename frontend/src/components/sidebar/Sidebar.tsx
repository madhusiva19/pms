'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, FileText, Users, LogOut, TrendingUp,
  LucideFileBarChart, User, Target, ChevronDown, ChevronRight,
  ClipboardList, UserCheck, CalendarDays, Settings, BarChart2,
  FilePlus, GitBranch, History, Snowflake,
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

// ── HQ Admin — Level 1 ───────────────────────────────────────────────────────
const hqAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/hq-admin/dashboard',           icon: LayoutDashboard    },
  { name: 'Template Management', href: '/hq-admin/template-management', icon: FileText, children: [
    { name: 'Overview',            href: '/hq-admin/template-management',                    icon: FileText           },
    { name: 'Template Creation',   href: '/hq-admin/template-management/template-creation',  icon: FilePlus           },
    { name: 'Template Assignment', href: '/hq-admin/template-management/template-assignment', icon: UserCheck          },
    { name: 'Template Variants',   href: '/hq-admin/template-management/template-variants',   icon: GitBranch          },
    { name: 'Template History',    href: '/hq-admin/template-management/template-history',    icon: History            },
    { name: 'Freeze Management',   href: '/hq-admin/template-management/freeze-management',   icon: Snowflake          },
  ]},
  { name: 'Appraisal Cycle',     href: '/hq-admin/appraisal-cycle',     icon: CalendarDays       },
  { name: 'My Team',             href: '/hq-admin/my-team',             icon: Users              },
  { name: 'Rating Settings',     href: '/hq-admin/rating-settings',     icon: Settings           },
  { name: 'Reports',             href: '/hq-admin/reports',             icon: BarChart2          },
  { name: 'Training Passport',   href: '/hq-admin/training-passport',   icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/hq-admin/potential-assessment', icon: Target, children: [
    { name: 'Team Review',           href: '/hq-admin/potential-assessment',            icon: UserCheck     },
    { name: 'Assessment Components', href: '/hq-admin/potential-assessment/components', icon: ClipboardList },
  ]},
  { name: 'My Profile',          href: '/hq-admin/profile',             icon: User               },
];

// ── Country Admin — Level 2 ──────────────────────────────────────────────────
const countryAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/country-admin/dashboard',           icon: LayoutDashboard    },
  { name: 'Template Management', href: '/country-admin/template-management', icon: FileText           },
  { name: 'My Team',             href: '/country-admin/my-team',             icon: Users              },
  { name: 'My Performance',      href: '/country-admin/my-performance',      icon: TrendingUp         },
  { name: 'Rating Settings',     href: '/country-admin/rating-settings',     icon: Settings           },
  { name: 'Reports',             href: '/country-admin/reports',             icon: BarChart2          },
  { name: 'Training Passport',   href: '/country-admin/training-passport',   icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/country-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/country-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/country-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile',          href: '/country-admin/profile',             icon: User               },
];

// ── Branch Admin — Level 3 ───────────────────────────────────────────────────
const branchAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/branch-admin/dashboard',           icon: LayoutDashboard    },
  { name: 'Template Management', href: '/branch-admin/template-management', icon: FileText           },
  { name: 'My Team',             href: '/branch-admin/my-team',             icon: Users              },
  { name: 'My Performance',      href: '/branch-admin/my-performance',      icon: TrendingUp         },
  { name: 'Rating Settings',     href: '/branch-admin/rating-settings',     icon: Settings           },
  { name: 'Reports',             href: '/branch-admin/reports',             icon: FileText           },
  { name: 'Training Passport',   href: '/branch-admin/training-passport',   icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/branch-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/branch-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/branch-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile',          href: '/branch-admin/profile',             icon: User               },
];

// ── Dept Admin — Level 4 ─────────────────────────────────────────────────────
const deptAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/dept-admin/dashboard',           icon: LayoutDashboard    },
  { name: 'Template Management', href: '/dept-admin/template-management', icon: FileText           },
  { name: 'My Team',             href: '/dept-admin/my-team',             icon: Users              },
  { name: 'My Performance',      href: '/dept-admin/my-performance',      icon: TrendingUp         },
  { name: 'Rating Settings',     href: '/dept-admin/rating-settings',     icon: Settings           },
  { name: 'Reports',             href: '/dept-admin/reports',             icon: FileText           },
  { name: 'Training Passport',   href: '/dept-admin/training-passport',   icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/dept-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/dept-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/dept-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile',          href: '/dept-admin/profile',             icon: User               },
];

// ── Sub Dept Admin — Level 5 ─────────────────────────────────────────────────
const subDeptAdminNavItems: NavItem[] = [
  { name: 'Dashboard',           href: '/sub-dept-admin/dashboard',           icon: LayoutDashboard    },
  { name: 'Template Management', href: '/sub-dept-admin/template-management', icon: FileText           },
  { name: 'My Team',             href: '/sub-dept-admin/my-team',              icon: Users              },
  { name: 'My Performance',      href: '/sub-dept-admin/my-performance',      icon: TrendingUp         },
  { name: 'Rating Settings',     href: '/sub-dept-admin/rating-settings',     icon: Settings           },
  { name: 'Reports',             href: '/sub-dept-admin/reports',             icon: FileText           },
  { name: 'Training Passport',   href: '/sub-dept-admin/training-passport',   icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/sub-dept-admin/potential-assessment', icon: Target, children: [
    { name: 'Self Assessment', href: '/sub-dept-admin/potential-assessment/self-assessment',   icon: ClipboardList },
    { name: 'Team Review',     href: '/sub-dept-admin/potential-assessment/supervisor-review', icon: UserCheck     },
  ]},
  { name: 'My Profile',          href: '/sub-dept-admin/profile',             icon: User               },
];

// ── Employee — Level 6 ───────────────────────────────────────────────────────
const employeeNavItems: NavItem[] = [
  { name: 'My Performance',      href: '/employee/my-performance',       icon: TrendingUp         },
  { name: 'Training Passport',   href: '/employee/training-passport',    icon: LucideFileBarChart },
  { name: 'Potential Assessment', href: '/employee/potential-assessment', icon: Target             },
  { name: 'My Profile',          href: '/employee/profile',              icon: User               },
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
  const { user, trainingBadgeCount, logout, clearBrokenAvatar } = useAuth();

  const roleFromPath = pathname?.split('/')[1]?.replace(/-/g, '_');
  const role = user?.role ?? roleFromPath;
  const navItems = getNavItems(role);

  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());
  const [imgError, setImgError] = useState(false);

  const toggleMenu = (name: string) =>
    setOpenMenus(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  useEffect(() => {
    if (pathname?.includes('/potential-assessment/'))
      setOpenMenus(prev => new Set([...prev, 'Potential Assessment']));
    if (pathname?.includes('/template-management/'))
      setOpenMenus(prev => new Set([...prev, 'Template Management']));
  }, [pathname]);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar_url]);

  const userInitials = user?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const userName = user?.full_name || 'User';

  const userRole = user?.role
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase()) || '';

  const handleLogout = () => {
    logout();
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
          style={{ width: '100%', height: 'auto', maxWidth: '160px' }}
        />
      </div>

      {/* Nav */}
      <nav className={styles.sideNav}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;

          if (hasChildren) {
            const isChildActive = item.children!.some(c => pathname === c.href);
            const isOpen = openMenus.has(item.name);
            return (
              <React.Fragment key={item.name}>
                <button
                  type="button"
                  onClick={() => toggleMenu(item.name)}
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

          const isActive =
            pathname === item.href ||
            pathname?.startsWith(item.href + '/') ||
            (item.href.includes('template-management') &&
              pathname?.includes('create-template'));

          const isTraining = item.href.includes("/training-passport");
          const badgeCount = isTraining ? trainingBadgeCount : 0;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`${styles.sideItem} ${isActive ? styles.active : ''}`}
            >
              <Icon className={styles.navSvg} />
              <span className={styles.sideLabel}>{item.name}</span>
              <Badge count={badgeCount} />
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={styles.sideFooter}>
        <div className={styles.profileRow}>
          <div className={styles.avatarCircle}>
            {user?.avatar_url && !imgError ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                onError={() => { setImgError(true); clearBrokenAvatar(); }}
              />
            ) : (
              userInitials
            )}
          </div>
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