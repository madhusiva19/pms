'use client';


import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FileText, Users, LogOut, TrendingUp, Bell, LucideFileBarChart, User2Icon, User } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

// ── HQ Admin — Level 1
const hqAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/hq-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/hq-admin/templates', icon: FileText },
  { name: 'My Team', href: '/hq-admin/team', icon: Users },
  { name: 'Reports', href: '/hq-admin/reports', icon: FileText },
  { name: 'Notification', href: '/hq-admin/notification', icon: Bell },
  { name: 'Training Log', href: '/hq-admin/training', icon: LucideFileBarChart },
  { name: 'My Profile', href: '/hq-admin/profile', icon: User },
];

// ── Country Admin — Level 2
const countryAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/country-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/country-admin/templates', icon: FileText },
  { name: 'My Team', href: '/country-admin/team', icon: Users },
  { name: 'My Performance', href: '/country-admin/performance', icon: TrendingUp },
  { name: 'Reports', href: '/country-admin/reports', icon: FileText },
  { name: 'Notification', href: '/country-admin/notification', icon: Bell },
  { name: 'Training Log', href: '/country-admin/training', icon: LucideFileBarChart },
  { name: 'My Profile', href: '/country-admin/profile', icon: User },
];

// ── Branch Admin — Level 3 
const branchAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/branch-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/branch-admin/templates', icon: FileText },
  { name: 'My Team', href: '/branch-admin/team', icon: Users },
  { name: 'My Performance', href: '/branch-admin/performance', icon: TrendingUp },
  { name: 'Reports', href: '/branch-admin/reports', icon: FileText },
  { name: 'notification', href: '/branch-admin/notification', icon: Bell },
  { name: 'Training Log', href: '/branch-admin/training', icon: LucideFileBarChart },
  { name: 'My Profile', href: '/branch-admin/profile', icon: User },
];

// ── Dept Admin — Level 4
const deptAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/dept-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/dept-admin/templates', icon: FileText },
  { name: 'My Team', href: '/dept-admin/team', icon: Users },
  { name: 'My Performance', href: '/dept-admin/performance', icon: TrendingUp },
  { name: 'Reports', href: '/dept-admin/reports', icon: FileText },
  { name: 'Notification', href: '/dept-admin/notification', icon: Bell },
  { name: 'Training Log', href: '/dept-admin/training', icon: LucideFileBarChart },
  { name: 'My Profile', href: '/dept-admin/profile', icon: User },
];

// ── Sub Dept Admin — Level 5
const subDeptAdminNavItems: NavItem[] = [
  { name: 'Dashboard', href: '/sub-dept-admin/dashboard', icon: LayoutDashboard },
  { name: 'Template Management', href: '/sub-dept-admin/templates', icon: FileText },
  { name: 'My Team', href: '/sub-dept-admin/team', icon: Users },
  { name: 'My Performance', href: '/sub-dept-admin/performance', icon: TrendingUp },
  { name: 'Reports', href: '/sub-dept-admin/reports', icon: FileText },
  { name: 'Notification', href: '/sub-dept-admin/notification', icon: Bell },
  { name: 'Training Log', href: '/sub-dept-admin/training', icon: LucideFileBarChart },
  { name: 'My Profile', href: '/sub-dept-admin/profile', icon: User },
];

const employeeNavItems: NavItem[] = [
  { name: 'My Performance', href: '/employee/performance', icon: TrendingUp },
  { name: 'Training Log', href: '/employee/training', icon: LucideFileBarChart },
  { name: 'My Profile', href: '/employee/profile', icon: User },
];


function getNavItems(role: string | undefined): NavItem[] {
  switch (role) {
    case 'hq_admin': return hqAdminNavItems;
    case 'country_admin': return countryAdminNavItems;
    case 'branch_admin': return branchAdminNavItems;
    case 'dept_admin': return deptAdminNavItems;
    case 'sub_dept_admin': return subDeptAdminNavItems;
    case 'employee': return employeeNavItems;
    default: return [];
  }
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  const navItems = getNavItems(user?.role);

  // Get user initials
  const userInitials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const userName = user?.full_name || 'User';
  const userRole = user?.role || '';

  const handleLogout = () => {
    localStorage.removeItem('demo-role');
    router.push('/');
  };

  return (
    <aside className="w-[251px] bg-[#1E3A8A] min-h-screen flex flex-col text-white flex-shrink-0">
      {/* Logo Section */}
      <div className="h-[100px] px-0 py-0 flex justify-left items-start">
        <div className="w-[139px] h-[68px] relative">
          <Image
            src="/Dart_Logo_new.png"
            alt="DGL PMS Logo"
            fill
            className="object-contain object-left"
            priority
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="h-[5px] p-1.5 border-t border-[#1E40AF] flex flex-col gap-1"></div>

      <nav className="flex-1 px-4 py-4 overflow-y-auto">
        <ul className="flex flex-col gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href);

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 rounded-lg transition-colors h-[46px] ${isActive
                    ? 'bg-[#3B82F6] text-white'
                    : 'text-[#DBEAFE] hover:bg-[#1E40AF]'
                    }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-[13px] font-normal leading-6">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Profile Section */}
      <div className="h-[124.8px] p-4 border-t border-[#1E40AF] flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-gray-700">{userInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium leading-6 text-white truncate">{userName}</p>
            <p className="text-[10px] font-normal leading-4 text-[#BEDBFF] capitalize truncate">
              {userRole.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 w-full rounded-md hover:bg-[#1E40AF] transition-colors h-[36px]"
        >
          <LogOut className="w-4 h-4 text-[#DBEAFE] flex-shrink-0" />
          <span className="text-[13.5px] font-medium text-[#DBEAFE] text-center">Logout</span>
        </button>
      </div>
    </aside>
  );
}