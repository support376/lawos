'use client';

import { useTransition } from 'react';
import { loadSampleData } from '../actions';

export function SampleDataButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => loadSampleData())}
      disabled={pending}
      className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? '로드 중...' : '샘플 데이터 불러오기'}
    </button>
  );
}
