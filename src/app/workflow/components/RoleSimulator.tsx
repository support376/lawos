'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import type { PipelineView, DomainKey } from '@/lib/auth/my-roles';

const SIM_OPTIONS: Array<{ view: PipelineView; domain: DomainKey; label: string }> = [
  { view: 'partner', domain: '*', label: '대표 · 전사' },
  { view: 'consultant', domain: 'personal_rehab', label: '상담원 · 개인회생' },
  { view: 'consultant', domain: 'divorce', label: '상담원 · 이혼' },
  { view: 'writer', domain: 'personal_rehab', label: '작성팀 · 개인회생' },
  { view: 'billing', domain: '*', label: '재무팀 · 전사' },
  { view: 'billing', domain: 'personal_rehab', label: '재무팀 · 개인회생' },
];

export function RoleSimulator({
  current,
}: {
  current: { view: PipelineView; domain: DomainKey };
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const currentLabel =
    SIM_OPTIONS.find((o) => o.view === current.view && o.domain === current.domain)?.label ??
    `${current.view} · ${current.domain}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-1.5 rounded border-2 border-dashed border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
        title="대표 전용 — 다른 역할 기준으로 뷰를 시뮬레이션"
      >
        🧪 시뮬: {currentLabel}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-900/50 rounded shadow-lg z-30">
          <div className="px-3 py-1.5 text-[10px] text-amber-700 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30">
            테스트용 역할 시뮬 (대표 전용)
          </div>
          <div className="py-1">
            {SIM_OPTIONS.map((o) => {
              const isActive = o.view === current.view && o.domain === current.domain;
              const href = `/workflow?view=${o.view}&domain=${o.domain}`;
              return (
                <Link
                  key={`${o.view}-${o.domain}`}
                  href={href}
                  className={`block px-3 py-1.5 text-xs ${
                    isActive
                      ? 'bg-zinc-100 dark:bg-zinc-800 font-medium'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {o.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
