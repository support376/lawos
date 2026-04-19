'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Client } from '@/lib/types';
import { NewClientModal } from './NewClientModal';

export function Sidebar({
  clients,
  activeClientId,
}: {
  clients: Client[];
  activeClientId: string | null;
}) {
  const [showNew, setShowNew] = useState(false);

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col">
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">고객 ({clients.length})</span>
        <button
          onClick={() => setShowNew(true)}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          + 추가
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <Link
          href="/kanban"
          className={`block px-3 py-1.5 rounded text-sm ${
            !activeClientId
              ? 'bg-zinc-100 dark:bg-zinc-800 font-medium'
              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'
          }`}
        >
          전체
        </Link>
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/kanban?client=${c.id}`}
            className={`block px-3 py-1.5 rounded text-sm truncate ${
              activeClientId === c.id
                ? 'bg-zinc-100 dark:bg-zinc-800 font-medium'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'
            }`}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <NewClientModal open={showNew} onClose={() => setShowNew(false)} />
    </aside>
  );
}
