'use client';

import { useState } from 'react';
import { NewClientModal } from '@/app/kanban/components/NewClientModal';

export function NewClientButton({
  variant = 'primary',
  label,
}: {
  variant?: 'primary' | 'secondary' | 'cta';
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const className =
    variant === 'cta'
      ? 'px-6 py-3 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium shadow-sm'
      : variant === 'secondary'
        ? 'px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium'
        : 'px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium';

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {label ?? '+ 새 고객'}
      </button>
      <NewClientModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
