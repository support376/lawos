'use client';

import { useState, useTransition } from 'react';
import { updateCaseNotes } from '@/app/actions/client-intel';

export function CaseNotes({
  caseId,
  initial,
}: {
  caseId: string;
  initial: string | null;
}) {
  const [text, setText] = useState(initial ?? '');
  const [saved, setSaved] = useState(initial ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = text !== saved;

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const r = await updateCaseNotes(caseId, text);
      if (!r.ok) setError(r.hint ? `${r.error} — ${r.hint}` : r.error ?? '저장 실패');
      else setSaved(text);
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          📝 사건 노트
          <span className="text-xs text-zinc-500 font-normal">자유 텍스트</span>
        </h3>
        {dirty && (
          <button
            onClick={onSave}
            disabled={pending}
            className="text-xs px-3 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          >
            {pending ? '저장 중...' : '저장'}
          </button>
        )}
      </div>
      <div className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="사건 관련 내용 자유 기재. 여기 쓴 내용도 의뢰인 인텔의 일부로 전략 수립에 참고됩니다."
          className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent resize-y min-h-[120px]"
        />
        {error && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
