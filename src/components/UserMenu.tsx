'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export function UserMenu({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const displayName = name ?? email?.split('@')[0] ?? '사용자';
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pr-2 pl-1 py-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
        title={displayName}
      >
        <span className="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium">
          {initial}
        </span>
        <span className="text-sm text-zinc-700 dark:text-zinc-300 hidden md:inline max-w-[8rem] truncate">
          {displayName}
        </span>
        <span className="text-xs text-zinc-500 hidden md:inline">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-lg z-50 py-1.5">
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="text-sm font-medium truncate">{displayName}</div>
            {email && (
              <div className="text-xs text-zinc-500 truncate mt-0.5">
                {email}
              </div>
            )}
          </div>
          <div className="py-1">
            <Link
              href="/calendar"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span>📅</span>
              <span>캘린더</span>
            </Link>
            <Link
              href="/settings/team"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span>⚙</span>
              <span>팀 설정</span>
            </Link>
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
