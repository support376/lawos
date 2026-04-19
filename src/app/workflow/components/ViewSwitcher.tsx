'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PipelineView, DomainKey, MyRoleContext } from '@/lib/auth/my-roles';

interface ViewOption {
  view: PipelineView;
  domain: DomainKey;
  label: string;
}

export function ViewSwitcher({
  current,
  ctx,
}: {
  current: { view: PipelineView; domain: DomainKey };
  ctx: MyRoleContext;
}) {
  const [open, setOpen] = useState(false);
  const views: ViewOption[] = ctx.accessibleViews;
  if (views.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        뷰 전환 ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-lg z-20 py-1">
          {views.map((v) => {
            const isActive = v.view === current.view && v.domain === current.domain;
            const href = `/workflow?view=${v.view}&domain=${v.domain}`;
            return (
              <Link
                key={`${v.view}-${v.domain}`}
                href={href}
                className={`block px-3 py-1.5 text-xs ${
                  isActive
                    ? 'bg-zinc-100 dark:bg-zinc-800 font-medium'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}
                onClick={() => setOpen(false)}
              >
                {v.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
