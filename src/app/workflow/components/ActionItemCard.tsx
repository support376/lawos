'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateActionStatus } from '@/app/actions/action-items';
import type { ActionRecord, ActionStatus } from '@/lib/ontology/core/objects';
import { ACTION_STATUS_LABEL } from '@/lib/ontology/core/objects';
import { getActionSpec } from '@/lib/ontology/core/action-registry';

const STATUS_OPTIONS: ActionStatus[] = ['pending', 'doing', 'blocked', 'done', 'cancelled'];

export function ActionItemCard({
  action,
  assigneeName,
}: {
  action: ActionRecord;
  assigneeName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const spec = getActionSpec(action.action_type);

  const changeStatus = (status: ActionStatus) => {
    startTransition(async () => {
      const r = await updateActionStatus({ id: action.id, status });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  };

  const statusColor =
    action.status === 'doing'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
      : action.status === 'blocked'
        ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
        : action.status === 'pending'
          ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';

  const priorityBorder =
    action.priority === 1
      ? 'border-l-red-500'
      : action.priority === 2
        ? 'border-l-amber-500'
        : action.priority === 3
          ? 'border-l-blue-500'
          : 'border-l-zinc-300';

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded p-1.5 text-[11px] border-l-2 ${priorityBorder}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="font-medium line-clamp-2 flex-1">{action.title}</div>
        <button
          onClick={() => setOpen(!open)}
          className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] ${statusColor}`}
        >
          {ACTION_STATUS_LABEL[action.status]}
        </button>
      </div>
      <div className="text-[10px] text-zinc-500 flex gap-1.5 mt-0.5 flex-wrap">
        {spec && <span>{spec.label}</span>}
        {assigneeName && <span>· {assigneeName}</span>}
        {action.due_date && <span>· {action.due_date}</span>}
      </div>
      {open && (
        <div className="mt-1.5 pt-1.5 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap gap-1">
          {STATUS_OPTIONS.filter((s) => s !== action.status).map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              disabled={pending}
              className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              → {ACTION_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
