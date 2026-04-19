'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateActionStatus } from '@/app/actions/action-items';
import type { ActionRecord, ActionStatus } from '@/lib/ontology/core/objects';
import { ACTION_STATUS_LABEL } from '@/lib/ontology/core/objects';
import { getActionSpec } from '@/lib/ontology/core/action-registry';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { ConfirmCaseModal } from '@/app/workflow/components/ConfirmCaseModal';

export function WorkbenchActionItem({
  action,
  caseClientName,
  caseTitle,
}: {
  action: ActionRecord;
  caseClientName: string | null;
  caseTitle: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expand, setExpand] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const spec = getActionSpec(action.action_type);
  const dDays = action.due_date ? differenceInCalendarDays(parseISO(action.due_date), new Date()) : null;
  const isConfirmCase = action.action_type === 'confirm_new_case';

  const setStatus = (s: ActionStatus) => {
    setErr(null);
    startTransition(async () => {
      const r = await updateActionStatus({ id: action.id, status: s });
      if (!r.ok) setErr(r.error ?? '실패');
      else router.refresh();
    });
  };

  const priorityBorder =
    action.priority === 1 ? 'border-l-red-500' :
    action.priority === 2 ? 'border-l-amber-500' :
    action.priority === 3 ? 'border-l-blue-500' :
    'border-l-zinc-300';

  const bgClass = isConfirmCase
    ? 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-2 border-amber-300 dark:border-amber-900/50'
    : `bg-white dark:bg-zinc-900 border-l-4 ${priorityBorder}`;

  return (
    <div className={`rounded p-2 shadow-sm ${bgClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isConfirmCase && <span className="text-base">🔔</span>}
            <span className={`text-xs font-medium ${isConfirmCase ? 'text-amber-900 dark:text-amber-300' : ''}`}>
              {action.title}
            </span>
            {spec && <span className="text-[10px] text-zinc-500">· {spec.label}</span>}
          </div>
          <div className="text-[10px] text-zinc-500 mt-0.5 flex gap-1.5 flex-wrap">
            {caseClientName && (
              <Link href={`/workflow?case=${action.subject_id}`} className="hover:underline">
                👤 {caseClientName}
              </Link>
            )}
            {caseTitle && <span className="truncate">· {caseTitle}</span>}
            {action.due_date && (
              <span className={dDays !== null && dDays < 0 ? 'text-red-600' : dDays === 0 ? 'text-amber-600' : ''}>
                · {action.due_date} {dDays !== null && dDays < 0 ? `(D${dDays})` : dDays === 0 ? '(오늘)' : dDays !== null && dDays > 0 ? `(D+${dDays})` : ''}
              </span>
            )}
            {action.status === 'blocked' && <span className="text-red-600">🔒 {action.blocking_reason ?? '차단'}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {isConfirmCase ? (
            <button
              onClick={() => setConfirmModalOpen(true)}
              className="text-xs px-3 py-1 rounded bg-amber-600 text-white font-medium"
            >
              🔔 컨펌 →
            </button>
          ) : (
            <button
              onClick={() => setStatus('done')}
              disabled={pending}
              className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white disabled:opacity-40"
            >
              ✓ 완료
            </button>
          )}
          <button
            onClick={() => setExpand((v) => !v)}
            className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {expand ? '접기' : '상세 ▾'}
          </button>
        </div>
      </div>

      {confirmModalOpen && isConfirmCase && (
        <ConfirmCaseModal
          actionId={action.id}
          caseId={action.subject_id}
          clientName={caseClientName ?? '—'}
          onClose={() => setConfirmModalOpen(false)}
        />
      )}

      {expand && (
        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          {action.description && (
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{action.description}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {(['doing', 'blocked', 'cancelled'] as ActionStatus[])
              .filter((s) => s !== action.status)
              .map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={pending}
                  className="text-[10px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                >
                  → {ACTION_STATUS_LABEL[s]}
                </button>
              ))}
            <Link
              href={`/workflow?case=${action.subject_id}`}
              className="text-[10px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              사건 열기 →
            </Link>
          </div>
          {err && <p className="text-[10px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
