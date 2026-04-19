'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types';
import { NewCaseModal } from './NewCaseModal';

// 리셋 중: 새 사건 생성만 지원. 고객/일괄등록/코파일럿은 온톨로지 재구축 후 복원 예정.
export function CreateMenu({ clients }: { clients: Client[]; cases: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        <span>+</span>
        <span>새 사건</span>
      </button>
      <NewCaseModal
        open={open}
        onClose={() => setOpen(false)}
        clients={clients}
      />
    </>
  );
}
