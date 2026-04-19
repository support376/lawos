'use client';

import { useState } from 'react';
import { BulkImportModal } from './BulkImportModal';

export function BulkImportButton({
  variant = 'header',
  label,
}: {
  variant?: 'header' | 'cta';
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const className =
    variant === 'cta'
      ? 'px-6 py-3 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium'
      : 'px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-medium';

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {label ?? '📦 일괄 등록'}
      </button>
      <BulkImportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
