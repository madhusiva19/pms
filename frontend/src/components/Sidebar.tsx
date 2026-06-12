'use client';

// Shared sidebar navigation for the React app.
// It highlights the current workflow and keeps profile/logout controls in one place.
import { useMemo } from 'react';
import Link, { useRouter } from '../lib/routing';
import { ROUTES, SIDEBAR_DEFAULT_USER, STORAGE_KEYS, WORKFLOW_ROUTES } from '../lib/constants';
import styles from './sidebar.module.css';

const iconPaths = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  file: 'M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5M8 13h8M8 17h8M8 9h4',
  users: 'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3ZM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.67 0-5 1.34-5 3v2h10v-2c0-1.66-2.33-3-5-3Zm8 0c-.31 0-.61.02-.9.07 1.16.84 1.9 1.94 1.9 3.18V18h4v-2c0-1.66-2.33-3-5-3Z',
  chart: 'M4 19h16v2H2V3h2v16Zm3-2V9h3v8H7Zm5 0V5h3v12h-3Zm5 0v-6h3v6h-3Z',
  bell: 'M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Zm-6 6a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z',
  user: 'M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-3.86 0-7 2.24-7 5v1h14v-1c0-2.76-3.14-5-7-5Z',
  passport: 'M5 3h11a3 3 0 0 1 3 3v15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 4h8V5H6v2Zm0 4h10V9H6v2Zm0 4h7v-2H6v2Z',
  trending: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6Z',
  logout: 'M10 17v-2h4V9h-4V7l-5 5 5 5Zm8 4H9v-2h9V5H9V3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2Z',
} as const;

type IconName = keyof typeof iconPaths;

interface NavItem {
  name: string;
  href: string;
  icon: IconName;
}

interface StoredUser {
  full_name?: string;
  role?: string;
}

// Get initials from user name
function getInitials(fullName?: string): string {
  if (!fullName) return '?';
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  { name: 'Template Management', href: '/template-management', icon: 'file' },
  { name: 'My Team', href: ROUTES.myTeam, icon: 'users' },
  { name: 'My Performance', href: '/performance', icon: 'trending' },
  { name: 'Reports', href: '/reports', icon: 'chart' },
  { name: 'Notifications', href: ROUTES.notifications, icon: 'bell' },
  { name: 'Training Passport', href: '/training-passport', icon: 'passport' },
  { name: 'My Profile', href: '/profile', icon: 'user' },
];

const branchAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/branch-admin/dashboard', icon: 'dashboard' },
  { name: 'Template Management', href: '/branch-admin/template-management', icon: 'file' },
  { name: 'My Team', href: '/branch-admin/team', icon: 'users' },
  { name: 'My Performance', href: '/branch-admin/performance', icon: 'trending' },
  { name: 'Reports', href: '/branch-admin/reports', icon: 'chart' },
  { name: 'Notifications', href: '/branch-admin/notifications', icon: 'bell' },
  { name: 'Training Passport', href: '/branch-admin/training-passport', icon: 'passport' },
  { name: 'My Profile', href: '/branch-admin/profile', icon: 'user' },
];

// Renders one SVG icon from the icon path map above.
function SidebarIcon({ name }: { name: IconName }) {
  return (
    <svg className={styles.navSvg} viewBox="0 0 24 24" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  );
}

// Reads the saved user profile from localStorage, if login saved one.
function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null') as StoredUser | null;
  } catch {
    return null;
  }
}

export default function Sidebar() {
  const router = useRouter();
  // Current URL path is used to highlight the active sidebar item.
  const pathname = router.pathname || '';
  // Memo keeps localStorage parsing from running again on every render.
  const user = useMemo(() => getStoredUser(), []);

  // Profile display values fall back to Group Admin when no stored user exists.
  const userName = user?.full_name || SIDEBAR_DEFAULT_USER.name;
  const userRole = user?.role?.replace(/_/g, ' ') || SIDEBAR_DEFAULT_USER.role;

  // The whole evaluation workflow should keep "My Team" selected in the sidebar.
  const isMyTeamRoute = WORKFLOW_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Decides which sidebar item receives the active style.
  const isActive = (item: NavItem): boolean => {
    if (item.name === 'My Team') {
      return isMyTeamRoute;
    }

    if (isMyTeamRoute) {
      return false;
    }

    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  // Clears the stored user and returns to the main team page.
  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.user);
    router.push(ROUTES.myTeam);
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <img
          src="/logo.png"
          alt="DGL Logo"
          className={styles.brandLogoImg}
        />
      </div>

      {/* Main navigation links shown in the fixed sidebar. */}
      <nav className={styles.sideNav}>
        {navItems.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`${styles.sideItem} ${isActive(item) ? styles.active : ''}`}
          >
            <SidebarIcon name={item.icon} />
            <span className={styles.sideLabel}>{item.name}</span>
          </Link>
        ))}
      </nav>

      {/* Footer shows profile identity and logout action. */}
      <div className={styles.sideFooter}>
        <div className={styles.profileRow}>
          <div className={styles.avatarCircle} title={`${userName} - ${userRole}`}>
            {getInitials(userName)}
          </div>
          <div className={styles.profileText}>
            <div className={styles.profileName}>{userName}</div>
            <div className={styles.profileRole}>{userRole}</div>
          </div>
        </div>

        <button className={styles.logoutBtn} type="button" onClick={handleLogout}>
          <SidebarIcon name="logout" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
