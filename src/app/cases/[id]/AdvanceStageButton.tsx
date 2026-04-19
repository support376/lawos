'use client';

import { useTransition } from 'react';
import { advanceStage } from '@/app/actions/workflow';

export function AdvanceStageButton({
  caseId,
  to,
}: {
  caseId: string;
  to: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => advanceStage(caseId, to))}
      disabled={pending}
      className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? '이동 중...' : '다음 단계로'}
    </button>
  );
}
