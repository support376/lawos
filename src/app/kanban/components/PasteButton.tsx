'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types';
import { PasteAnalyzeModal } from './PasteAnalyzeModal';

interface PasteButtonProps {
  clients: Client[];
  variant?: 'primary' | 'header' | 'cta';
  label?: string;
}

export function PasteButton({ clients, variant = 'header', label }: PasteButtonProps) {
  const [open, setOpen] = useState(false);

  const className =
    variant === 'primary'
      ? 'px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium'
      : variant === 'cta'
        ? 'px-6 py-3 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium shadow-sm'
        : 'px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium';

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {label ?? '📋 텍스트 분석'}
      </button>
      <PasteAnalyzeModal
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
      />
    </>
  );
}
