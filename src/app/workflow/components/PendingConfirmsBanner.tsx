'use client';

import { useState } from 'react';
import { ConfirmCaseModal } from './ConfirmCaseModal';

interface PendingConfirm {
  id: string;
  title: string;
  case_id: string;
  case_title: string;
  client_name: string;
  created_at: string;
  due_date: string | null;
  priority: number;
}

export function PendingConfirmsBanner({ items }: { items: PendingConfirm[] }) {
  const [openFor, setOpenFor] = useState<PendingConfirm | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <section className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 border-2 border-amber-300 dark:border-amber-900/50 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔔</span>
            <div>
              <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                수임 컨펌 대기 ({items.length}건)
              </h2>
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                상담원이 수임 확정한 사건. 담당자 지정 + 승인 필요.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-1">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenFor(c)}
              className="w-full text-left flex items-center justify-between gap-3 p-2 rounded bg-white dark:bg-zinc-900 hover:shadow border border-amber-200 dark:border-amber-900/50"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{c.title}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  접수: {new Date(c.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {c.due_date && ` · 마감: ${c.due_date}`}
                </div>
              </div>
              <span className="text-xs px-3 py-1 rounded bg-amber-600 text-white shrink-0">
                컨펌 →
              </span>
            </button>
          ))}
        </div>
      </section>

      {openFor && (
        <ConfirmCaseModal
          actionId={openFor.id}
          caseId={openFor.case_id}
          clientName={openFor.client_name}
          onClose={() => setOpenFor(null)}
        />
      )}
    </>
  );
}
