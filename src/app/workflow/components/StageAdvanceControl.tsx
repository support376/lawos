'use client';

import { useState, useTransition } from 'react';
import { advanceStage } from '@/app/actions/rehab';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';

export function StageAdvanceControl({
  caseId,
  currentStage,
  nextStages,
}: {
  caseId: string;
  currentStage: StageKey;
  nextStages: StageKey[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const advance = (to: StageKey) => {
    setError(null);
    startTransition(async () => {
      const r = await advanceStage({ caseId, toStage: to });
      if (!r.ok) setError(r.error ?? '실패');
      else setOpen(false);
    });
  };

  if (nextStages.length === 0) {
    return <span className="text-xs text-zinc-400">종결 단계</span>;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Stage 전이 ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-lg z-10 py-1">
          <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wide">
            현재: {STAGES[currentStage]?.label}
          </div>
          {nextStages.map((s) => {
            const meta = STAGES[s];
            return (
              <button
                key={s}
                onClick={() => advance(s)}
                disabled={pending}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 ${
                  meta.is_bypass ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                → {meta.label}
                {meta.is_bypass && <span className="ml-1 text-[10px]">(우회)</span>}
              </button>
            );
          })}
          {error && (
            <div className="px-3 py-1.5 text-xs text-red-600 border-t border-zinc-200 dark:border-zinc-800">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
