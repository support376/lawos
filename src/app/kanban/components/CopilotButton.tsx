'use client';

import { useState } from 'react';
import type { Client, Case } from '@/lib/types';
import { CopilotModal } from './CopilotModal';

export function CopilotButton({
  clients,
  cases,
  variant = 'header',
}: {
  clients: Client[];
  cases: Case[];
  variant?: 'header' | 'cta';
}) {
  const [open, setOpen] = useState(false);

  const className =
    variant === 'cta'
      ? 'px-6 py-3 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm'
      : 'px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium';

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        🎙 상담 코파일럿
      </button>
      <CopilotModal open={open} onClose={() => setOpen(false)} clients={clients} cases={cases} />
    </>
  );
}
