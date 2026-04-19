'use client';

import { useTransition } from 'react';
import { updateCaseVisibility } from '@/app/actions/team';
import { CASE_VISIBILITY_LABEL, type CaseVisibility } from '@/lib/types';

export function VisibilitySelect({
  caseId,
  value,
}: {
  caseId: string;
  value: CaseVisibility;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value as CaseVisibility;
        startTransition(() => updateCaseVisibility(caseId, v));
      }}
      className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 disabled:opacity-50"
    >
      {(Object.keys(CASE_VISIBILITY_LABEL) as CaseVisibility[]).map((k) => (
        <option key={k} value={k}>
          {CASE_VISIBILITY_LABEL[k]}
        </option>
      ))}
    </select>
  );
}
