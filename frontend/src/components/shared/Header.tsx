'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, Users, TrendingUp, Bell,
  LucideFileBarChart, User, Target, ClipboardList, UserCheck,
  CalendarDays, Settings, BarChart2, FilePlus, GitBranch, History,
  Snowflake, CheckSquare, XCircle, Activity, HelpCircle, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import styles from './Header.module.css';

interface RouteMeta {
  match: string;
  title: string;
  icon: React.ElementType;
  // Breadcrumb parent label shown before the title, e.g. "My Team" for Approvals.
  // Omitted for top-level pages (Dashboard, Reports, etc.).
  parent?: string;
  // Role-relative path the parent crumb links to, e.g. "/my-team". Prefixed with
  // the current role segment at render time to build the clickable href.
  parentPath?: string;
}

// Suffixes are matched against the pathname with the role segment stripped,
// most specific first, mirroring the labels used in the sidebar nav items.
// Parent labels for "My Team" sub-pages (Approvals, Rejection, Status Tracking,
// Evaluate) and "Status Tracking" > Enquiry are taken verbatim from those pages'
// own in-page breadcrumbs, since those pages aren't sidebar dropdown children.
// Note: Template Management's and Potential Assessment's dropdown children (below)
// intentionally have no `parent`/`parentPath` — they're sidebar nav items themselves,
// so the sidebar's own expanded/highlighted state already shows where you are; a
// breadcrumb repeating "Potential Assessment / Assessment Components" under a title
// that already says "Assessment Components" would just be noise. The breadcrumb is
// reserved for pages the sidebar has no entry for at all (My Team family, drill-downs).
const ROUTE_META: RouteMeta[] = [
  { match: '/template-management/template-creation',   title: 'Template Creation',   icon: FilePlus     },
  { match: '/template-management/template-assignment', title: 'Template Assignment', icon: UserCheck    },
  { match: '/template-management/template-variants',   title: 'Template Variants',   icon: GitBranch    },
  { match: '/template-management/template-history',    title: 'Template History',    icon: History      },
  { match: '/template-management/freeze-management',   title: 'Freeze Management',   icon: Snowflake    },
  { match: '/template-management',                     title: 'Template Management', icon: FileText     },
  { match: '/potential-assessment/components',         title: 'Assessment Components', icon: ClipboardList },
  { match: '/potential-assessment/self-assessment',    title: 'Self Assessment',     icon: ClipboardList },
  { match: '/potential-assessment/supervisor-review',  title: 'Team Review',         icon: UserCheck    },
  { match: '/potential-assessment',                     title: 'Potential Assessment', icon: Target      },
  { match: '/dashboard',                                title: 'Dashboard',          icon: LayoutDashboard },
  { match: '/appraisal-cycle',                          title: 'Appraisal Cycle',    icon: CalendarDays },
  { match: '/my-team',                                  title: 'My Team',            icon: Users        },
  { match: '/approvals',                                title: 'Approvals',          icon: CheckSquare,  parent: 'My Team', parentPath: '/my-team' },
  { match: '/rejection',                                title: 'Evaluation Rejected', icon: XCircle,      parent: 'My Team', parentPath: '/my-team' },
  { match: '/status-tracking',                          title: 'Status Tracking',    icon: Activity,     parent: 'My Team', parentPath: '/my-team' },
  { match: '/evaluate',                                 title: 'Evaluate Team Member', icon: ClipboardList, parent: 'My Team', parentPath: '/my-team' },
  { match: '/enquiry',                                  title: 'Enquiry',            icon: HelpCircle,   parent: 'Status Tracking', parentPath: '/status-tracking' },
  { match: '/manual-rating',                            title: 'Manual Ratings',     icon: ClipboardList, parent: 'Rating Settings', parentPath: '/rating-settings' },
  { match: '/workforce-report',                         title: 'Workforce Report',   icon: BarChart2,    parent: 'Reports', parentPath: '/reports' },
  { match: '/branches',                                 title: 'Branch Reports',     icon: BarChart2    },
  { match: '/members',                                  title: 'Member Directory',   icon: Users        },
  { match: '/notifications',                            title: 'Notifications',      icon: Bell         },
  { match: '/my-performance',                           title: 'My Performance',     icon: TrendingUp   },
  { match: '/rating-settings',                          title: 'Rating Settings',    icon: Settings     },
  { match: '/reports',                                  title: 'Reports',            icon: BarChart2    },
  { match: '/training-passport',                        title: 'Training Passport',  icon: LucideFileBarChart },
  { match: '/profile',                                  title: 'My Profile',         icon: User         },
  { match: '/notification',                             title: 'Notifications',      icon: Bell         },
];

// Dynamic (database-id-keyed) drill-downs can't show the specific record's name in a
// pathname-only header, so these use a confirmed static label (taken verbatim from
// that page's own former title text) instead of inventing one. See conversation notes.
function getDynamicRouteMeta(rest: string, role: string | undefined): { title: string; icon: React.ElementType; parent?: string; parentPath?: string } | null {
  // "View Template" detail: /template-management/<id>, id isn't one of HQ's named sub-pages.
  if (/^\/template-management\/(?!template-creation|template-assignment|template-variants|template-history|freeze-management)[^/]+$/.test(rest)) {
    return { title: 'View Template', icon: FileText, parent: 'Template Management', parentPath: '/template-management' };
  }

  const paParent = role === 'hq_admin' ? 'Potential Assessment' : 'Team Review';
  const paParentPath = role === 'hq_admin' ? '/potential-assessment' : '/potential-assessment/supervisor-review';

  if (/^\/potential-assessment\/reconsideration\/[^/]+$/.test(rest)) {
    return { title: 'Reconsideration Review', icon: UserCheck, parent: paParent, parentPath: paParentPath };
  }

  // "Review" drill-down: /potential-assessment/<id>, id is a countryAdminId/branchAdminId/etc, opaque in the URL.
  if (/^\/potential-assessment\/(?!components|self-assessment|supervisor-review|reconsideration)[^/]+$/.test(rest)) {
    return { title: 'Review', icon: UserCheck, parent: paParent, parentPath: paParentPath };
  }

  if (/^\/approvals\/[^/]+$/.test(rest)) {
    return { title: 'Review Evaluation', icon: CheckSquare, parent: 'Approvals', parentPath: '/approvals' };
  }

  // Reports drill-downs (country/branch/dept/employee) and country-admin's branch-detail
  // equivalent all render the same confirmed generic title.
  if (/^\/reports\/(?!workforce)[^/]+$/.test(rest) || /^\/branches\/[^/]+$/.test(rest)) {
    return { title: 'Performance Reports', icon: BarChart2, parent: 'Reports', parentPath: '/reports' };
  }

  return null;
}

function getPageMeta(pathname: string | null, role: string | undefined): { title: string; icon: React.ElementType; parent?: string; parentPath?: string } {
  const fallback = { title: 'Dashboard', icon: LayoutDashboard };
  if (!pathname) return fallback;

  if (pathname === '/saved-reports') {
    return { title: 'Saved Reports', icon: BarChart2 };
  }

  const rest = '/' + pathname.split('/').slice(2).join('/');

  if (rest.includes('create-template')) {
    return { title: 'Template Management', icon: FileText };
  }

  const dynamic = getDynamicRouteMeta(rest, role);
  if (dynamic) return dynamic;

  const found = ROUTE_META.find((r) => rest === r.match || rest.startsWith(r.match + '/'));
  return found ? { title: found.title, icon: found.icon, parent: found.parent, parentPath: found.parentPath } : fallback;
}

function getNotificationHref(role: string | undefined): string | undefined {
  switch (role) {
    case 'hq_admin':       return '/hq-admin/notification';
    case 'country_admin':  return '/country-admin/notification';
    case 'branch_admin':   return '/branch-admin/notification';
    case 'dept_admin':     return '/dept-admin/notification';
    case 'sub_dept_admin': return '/sub-dept-admin/notification';
    case 'employee':       return '/employee/notification';
    default:                return undefined;
  }
}

function getProfileHref(role: string | undefined): string | undefined {
  switch (role) {
    case 'hq_admin':       return '/hq-admin/profile';
    case 'country_admin':  return '/country-admin/profile';
    case 'branch_admin':   return '/branch-admin/profile';
    case 'dept_admin':     return '/dept-admin/profile';
    case 'sub_dept_admin': return '/sub-dept-admin/profile';
    case 'employee':       return '/employee/profile';
    default:                return undefined;
  }
}

export default function Header() {
  const pathname = usePathname();
  const { user, notificationCount, clearBrokenAvatar } = useAuth();

  const roleFromPath = pathname?.split('/')[1]?.replace(/-/g, '_');
  const role = user?.role ?? roleFromPath;
  const notificationHref = getNotificationHref(role);
  const profileHref = getProfileHref(role);

  const { title, icon: TitleIcon, parent, parentPath } = getPageMeta(pathname, role);
  const rolePrefix = pathname ? `/${pathname.split('/')[1] ?? ''}` : '';
  const parentHref = parentPath ? `${rolePrefix}${parentPath}` : undefined;

  const userInitials = user?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar_url]);

  return (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        <TitleIcon className={styles.titleIcon} />
        <div className={styles.titleStack}>
          <h1 className={styles.title}>{title}</h1>
          {parent && (
            <nav className={styles.breadcrumbRow} aria-label="Breadcrumb">
              {parentHref ? (
                <Link href={parentHref} className={styles.crumbParentLink}>{parent}</Link>
              ) : (
                <span className={styles.crumbParent}>{parent}</span>
              )}
              <ChevronRight className={styles.crumbSep} />
              <span className={styles.crumbCurrent}>{title}</span>
            </nav>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        {notificationHref && (
          <Link href={notificationHref} className={styles.bellButton} aria-label="Notifications">
            <Bell className={styles.bellIcon} />
            {notificationCount > 0 && (
              <span className={styles.bellBadge}>
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </Link>
        )}

        {profileHref && (
          <Link href={profileHref} className={styles.avatarCircle} aria-label="My Profile">
            {user?.avatar_url && !imgError ? (
              <img
                src={user.avatar_url}
                alt=""
                className={styles.avatarImg}
                onError={() => { setImgError(true); clearBrokenAvatar(); }}
              />
            ) : (
              userInitials
            )}
          </Link>
        )}
      </div>
    </header>
  );
}
