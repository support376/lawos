'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { PipelineView, DomainKey } from '@/lib/auth/my-roles';

// AppHeader에 붙는 대표 전용 시뮬레이터. URL ?as=<view>&as_domain=<domain> 파라미터 전파.

const OPTIONS: Array<{ view: PipelineView; domain: DomainKey; label: string }> = [
  { view: 'partner', domain: '*', label: '대표·관리자' },
  { view: 'consultant', domain: 'personal_rehab', label: '상담 · 개인회생' },
  { view: 'consultant', domain: 'divorce', label: '상담 · 이혼' },
  { view: 'writer', domain: 'personal_rehab', label: '작성 · 개인회생' },
  { view: 'billing', domain: '*', label: '재무' },
];

function keyOf(view: PipelineView, domain: DomainKey) {
  return `${view}__${domain}`;
}

export function RoleSimulatorHeader({
  initialView,
  initialDomain,
}: {
  initialView: PipelineView;
  initialDomain: DomainKey;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const current = OPTIONS.find((o) => o.view === initialView && o.domain === initialDomain);
  const label = current?.label ?? '대표·관리자';

  const hrefFor = (view: PipelineView, domain: DomainKey) => {
    // 페이지 유지, 파라미터만 교체
    const base = pathname || '/dashboard';
    if (base.startsWith('/workflow')) {
      return `/workflow?view=${view}&domain=${domain}`;
    }
    return `${base}?as=${view}&as_domain=${domain}`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2.5 py-1 rounded border-2 border-dashed border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 flex items-center gap-1"
        title="대표 전용 — 다른 역할 기준으로 뷰 시뮬"
      >
        🧪 {label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-900/50 rounded shadow-lg z-40">
          <div className="px-3 py-1.5 text-[10px] text-amber-700 dark:text-amber-400 border-b border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30">
            테스트용 역할 시뮬
          </div>
          <div className="py-1">
            {OPTIONS.map((o) => {
              const isActive = o.view === initialView && o.domain === initialDomain;
              return (
                <Link
                  key={keyOf(o.view, o.domain)}
                  href={hrefFor(o.view, o.domain)}
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
