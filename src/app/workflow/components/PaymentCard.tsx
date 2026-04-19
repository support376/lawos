'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmPayment, markDunningSent } from '@/app/actions/payments';
import { placeFinanceHold } from '@/app/actions/finance-holds';
import type { PaymentSchedule } from '@/lib/ontology/core/objects';

function krw(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function PaymentCard({
  schedule,
  caseLabel,
  caseId,
}: {
  schedule: PaymentSchedule;
  caseLabel: string;
  caseId: string;
}) {
  const [open, setOpen] = useState(false);
  const overdueDays = schedule.status === 'overdue' ? daysFromDue(schedule.due_date) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left bg-white dark:bg-zinc-800 rounded p-2 shadow-sm hover:shadow-md"
      >
        <div className="text-xs font-medium truncate">{caseLabel}</div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-zinc-500">
          <span>{schedule.installment_no}회차</span>
          <span>·</span>
          <span className="tabular-nums">{krw(schedule.amount_krw)}원</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
          {overdueDays !== null && overdueDays > 0 && (
            <span className="text-red-600 dark:text-red-400 font-semibold">⚠ D+{overdueDays}</span>
          )}
          {schedule.dunning_count > 0 && (
            <span className="text-amber-600">📨 {schedule.dunning_count}회</span>
          )}
          <span className="text-zinc-400">{schedule.due_date}</span>
        </div>
      </button>
      {open && (
        <PaymentActionModal
          schedule={schedule}
          caseLabel={caseLabel}
          caseId={caseId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PaymentActionModal({
  schedule,
  caseLabel,
  caseId,
  onClose,
}: {
  schedule: PaymentSchedule;
  caseLabel: string;
  caseId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'main' | 'confirm' | 'hold'>('main');
  const [paidAmount, setPaidAmount] = useState((schedule.amount_krw - schedule.paid_amount_krw).toString());
  const [method, setMethod] = useState<'bank_transfer' | 'card' | 'cash' | 'check'>('bank_transfer');
  const [holdReason, setHoldReason] = useState(
    schedule.status === 'overdue'
      ? `${schedule.installment_no}회차 미납 · D+${daysFromDue(schedule.due_date)}`
      : '',
  );

  const runConfirm = () => {
    setError(null);
    const n = Number(paidAmount);
    if (!Number.isFinite(n) || n <= 0) return setError('금액 오류');
    startTransition(async () => {
      const r = await confirmPayment({
        scheduleId: schedule.id,
        paid_amount_krw: n,
        payment_method: method,
      });
      if (!r.ok) return setError(r.error ?? '실패');
      onClose();
      router.refresh();
    });
  };

  const runDunning = () => {
    setError(null);
    startTransition(async () => {
      const r = await markDunningSent({ scheduleId: schedule.id });
      if (!r.ok) return setError(r.error ?? '실패');
      // 실제 메시지 발송 연동은 추후. 지금은 카운터만 증가.
      onClose();
      router.refresh();
    });
  };

  const runHold = () => {
    setError(null);
    if (!holdReason.trim()) return setError('사유 필수');
    startTransition(async () => {
      const r = await placeFinanceHold({
        caseId,
        reason: holdReason.trim(),
      });
      if (!r.ok) return setError(r.error ?? '실패');
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-4 shadow-xl"
      >
        <div>
          <h2 className="text-base font-semibold">{caseLabel}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {schedule.installment_no}회차 · {krw(schedule.amount_krw)}원 · {schedule.due_date}
            {schedule.paid_amount_krw > 0 && ` · 입금 ${krw(schedule.paid_amount_krw)}원`}
          </p>
        </div>

        {mode === 'main' && (
          <div className="space-y-2">
            <button
              onClick={() => setMode('confirm')}
              disabled={schedule.status === 'paid' || schedule.status === 'waived'}
              className="w-full px-3 py-2 text-sm rounded bg-emerald-600 text-white hover:opacity-90 disabled:opacity-40"
            >
              ✓ 입금 확인
            </button>
            {schedule.status === 'overdue' && (
              <button
                onClick={runDunning}
                disabled={pending}
                className="w-full px-3 py-2 text-sm rounded bg-amber-600 text-white hover:opacity-90 disabled:opacity-40"
              >
                📨 독촉 발송 (#{schedule.dunning_count + 1})
              </button>
            )}
            <button
              onClick={() => setMode('hold')}
              disabled={pending}
              className="w-full px-3 py-2 text-sm rounded bg-red-600 text-white hover:opacity-90 disabled:opacity-40"
            >
              🛑 Finance Hold (작성 중단)
            </button>
          </div>
        )}

        {mode === 'confirm' && (
          <div className="space-y-2">
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            >
              <option value="bank_transfer">계좌이체</option>
              <option value="card">카드</option>
              <option value="cash">현금</option>
              <option value="check">수표</option>
            </select>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMode('main')} className="px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700">취소</button>
              <button onClick={runConfirm} disabled={pending} className="px-4 py-1.5 text-xs rounded bg-emerald-600 text-white">
                {pending ? '저장중...' : '확인'}
              </button>
            </div>
          </div>
        )}

        {mode === 'hold' && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              이 사건의 작성팀 Stage 전이를 완전 차단합니다. 재무팀·대표만 해제 가능.
            </p>
            <textarea
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="차단 사유"
              rows={3}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setMode('main')} className="px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700">취소</button>
              <button onClick={runHold} disabled={pending} className="px-4 py-1.5 text-xs rounded bg-red-600 text-white">
                {pending ? '적용중...' : '🛑 Hold 걸기'}
              </button>
            </div>
          </div>
        )}

        {mode === 'main' && (
          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="text-xs text-zinc-500">닫기</button>
          </div>
        )}
      </div>
    </div>
  );
}

function daysFromDue(due: string): number {
  return Math.floor((Date.now() - new Date(due).getTime()) / 86_400_000);
}
