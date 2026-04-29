'use client';

/**
 * Breadcrumb Component
 * Renders a navigation breadcrumb trail from an array of items
 */

import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex flex-wrap items-center gap-0 text-[13px] text-[#64748B]">
      {items.map((item, index) => (
        <span key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="w-3.5 h-3.5 mx-1.5" />}
          {item.href ? (
            <a href={item.href} className="hover:text-[#1E293B] transition-colors">
              {item.label}
            </a>
          ) : (
            <span className="text-[#1E293B] font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
