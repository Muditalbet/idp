'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/services', label: 'Services', icon: Boxes },
  { href: '/services/new', label: 'New Service', icon: PlusCircle },
  { href: '/admin', label: 'Admin', icon: ShieldCheck, adminOnly: true },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';

  const onLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            ID
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">IDP</p>
            <p className="text-[11px] text-slate-500">Developer Platform</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-brand-600/15 text-brand-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-3 py-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-200">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-500">
                {user?.role === 'PLATFORM_ADMIN' ? 'Platform Admin' : user?.team?.name ?? 'Developer'}
              </p>
            </div>
            <button
              onClick={onLogout}
              title="Sign out"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}
