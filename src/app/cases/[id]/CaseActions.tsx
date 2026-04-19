'use client';

import { useState, useTransition } from 'react';
import { closeCase, reopenCase, addMilestone } from '@/app/actions/onboarding';

export function CaseActions({
  caseId,
  status,
}: {
  caseId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [showClose, setShowClose] = useState(false);
  const [showMilestone, setShowMilestone] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [msDate, setMsDate] = useState(new Date().toISOString().slice(0, 10));
  const [msText, setMsText] = useState('');

  const isActive = status === 'active';

  const onClose = () => {
    startTransition(async () => {
      await closeCase(caseId, outcome || null);
      setShowClose(false);
      setOutcome('');
    });
  };

  const onReopen = () => {
    if (!confirm('이 사건을 다시 열까요?')) return;
    startTransition(() => reopenCase(caseId));
  };

  const onAddMilestone = () => {
    if (!msText.trim()) return;
    startTransition(async () => {
      await addMilestone({ caseId, date: msDate, summary: msText });
      setMsText('');
      setShowMilestone(false);
    });
  };

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <button
        onClick={() => setShowMilestone((v) => !v)}
        className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        + 이력 추가
      </button>
      {isActive ? (
        <button
          onClick={() => setShowClose((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          사건 종결
        </button>
      ) : (
        <button
          onClick={onReopen}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          다시 열기
        </button>
      )}

      {showMilestone && (
        <div className="absolute right-6 mt-20 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-3 shadow-lg space-y-2 z-10">
          <div className="text-xs font-medium">이력 추가</div>
          <input
            type="date"
            value={msDate}
            onChange={(e) => setMsDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
          />
          <input
            value={msText}
            onChange={(e) => setMsText(e.target.value)}
            placeholder="내용 (예: 답변서 수신, 조정 기일 참석)"
            className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setShowMilestone(false)}
              className="text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700"
            >
              취소
            </button>
            <button
              onClick={onAddMilestone}
              disabled={pending || !msText.trim()}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {showClose && (
        <div className="absolute right-6 mt-20 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md p-3 shadow-lg space-y-2 z-10">
          <div className="text-xs font-medium">사건 종결</div>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="결과/비고 (예: 개시 결정, 조정 성립, 승소)"
            rows={3}
            className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <button
              onClick={() => setShowClose(false)}
              className="text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700"
            >
              취소
            </button>
            <button
              onClick={onClose}
              disabled={pending}
              className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              종결
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
