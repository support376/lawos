'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bootstrapSelfAsManagingPartner } from '@/app/actions/workspace-roles';

export function BootstrapRoleButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = () => {
    setError(null);
    startTransition(async () => {
      const r = await bootstrapSelfAsManagingPartner();
      if (!r.ok) setError(r.error ?? '실패');
      else router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <button
        onClick={run}
        disabled={pending}
        className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
      >
        {pending ? '부여중...' : '→ 나에게 대표변호사 × 전사 부여'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
