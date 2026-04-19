'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPaymentContract, confirmPayment, markDunningSent } from '@/app/actions/payments';
import { placeFinanceHold, releaseFinanceHold, type CaseFinancialHold } from '@/app/actions/finance-holds';
import type {
  PaymentContract,
  PaymentSchedule,
  PaymentPlanType,
  PaymentGate,
} from '@/lib/ontology/core/objects';
import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/ontology/core/objects';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function PaymentContractSection({
  caseId,
  contracts,
  schedules,
  hold,
}: {
  caseId: string;
  contracts: PaymentContract[];
  schedules: PaymentSchedule[];
  hold: CaseFinancialHold | null;
}) {
  const [showNew, setShowNew] = useState(false);

  const currentContract = contracts.find((c) => !c.cancelled_at);
  const currentSchedules = currentContract
    ? schedules.filter((s) => s.contract_id === currentContract.id).sort((a, b) => a.installment_no - b.installment_no)
    : [];

  const totalPaid = currentSchedules.reduce((sum, s) => sum + s.paid_amount_krw, 0);
  const totalDue = currentContract?.total_amount_krw ?? 0;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold">💰 수임료 계약</h2>
        {!currentContract ? (
          <button
            onClick={() => setShowNew(true)}
            className="text-xs px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            + 계약 생성
          </button>
        ) : (
          <span className="text-xs text-zinc-500">
            체결 {currentContract.signed_at?.slice(0, 10)} · {currentContract.plan_type === 'installment' ? '분할' : currentContract.plan_type === 'lump_sum' ? '일시' : '조건부'}
          </span>
        )}
      </div>

      {hold && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-900/50">
          🛑 Finance Hold 활성 — {hold.reason}
          <ReleaseButton holdId={hold.id} />
        </div>
      )}

      {!currentContract ? (
        <div className="p-5 text-center text-xs text-zinc-500">
          수임료 계약이 없습니다. "계약 생성" 버튼으로 총액·분할·회차를 설정하세요.
        </div>
      ) : (
        <div className="p-4 space-y-3 text-xs">
          <div className="flex items-baseline gap-4">
            <div>
              <span className="text-zinc-500">총액</span>{' '}
              <span className="font-semibold tabular-nums">{krw(totalDue)}원</span>
            </div>
            <div>
              <span className="text-zinc-500">수금</span>{' '}
              <span className="font-semibold tabular-nums text-emerald-600">{krw(totalPaid)}원</span>
            </div>
            <div>
              <span className="text-zinc-500">잔액</span>{' '}
              <span className="font-semibold tabular-nums text-red-600">{krw(totalDue - totalPaid)}원</span>
            </div>
            <div className="ml-auto text-zinc-500">
              {currentContract.payment_gate === 'hard' ? '🔒 Hard Gate' : '⚠ Soft Gate'}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-1.5 pr-3">회차</th>
                  <th className="py-1.5 pr-3">종류</th>
                  <th className="py-1.5 pr-3 text-right">금액</th>
                  <th className="py-1.5 pr-3">마감</th>
                  <th className="py-1.5 pr-3">상태</th>
                  <th className="py-1.5 pr-3 text-right">수금</th>
                  <th className="py-1.5 pr-3">액션</th>
                </tr>
              </thead>
              <tbody>
                {currentSchedules.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} />
                ))}
              </tbody>
            </table>
          </div>

          {!hold && currentSchedules.some((s) => s.status === 'overdue') && (
            <PlaceHoldInline caseId={caseId} />
          )}
        </div>
      )}

      {showNew && <NewContractModal caseId={caseId} onClose={() => setShowNew(false)} />}
    </section>
  );
}

function ScheduleRow({ schedule }: { schedule: PaymentSchedule }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [paidAmount, setPaidAmount] = useState((schedule.amount_krw - schedule.paid_amount_krw).toString());
  const router = useRouter();

  const daysOverdue = schedule.status === 'overdue'
    ? Math.floor((Date.now() - new Date(schedule.due_date).getTime()) / 86_400_000)
    : null;

  const doConfirm = () => {
    const n = Number(paidAmount);
    if (!Number.isFinite(n) || n <= 0) return setErr('금액 오류');
    startTransition(async () => {
      const r = await confirmPayment({ scheduleId: schedule.id, paid_amount_krw: n });
      if (!r.ok) setErr(r.error ?? '실패');
      else {
        setConfirming(false);
        router.refresh();
      }
    });
  };

  const doDunning = () => {
    startTransition(async () => {
      const r = await markDunningSent({ scheduleId: schedule.id });
      if (!r.ok) setErr(r.error ?? '실패');
      else router.refresh();
    });
  };

  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <td className="py-1.5 pr-3 tabular-nums">{schedule.installment_no}</td>
      <td className="py-1.5 pr-3">{PAYMENT_KIND_LABEL[schedule.kind]}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(schedule.amount_krw)}원</td>
      <td className="py-1.5 pr-3">
        {schedule.due_date}
        {daysOverdue !== null && daysOverdue > 0 && (
          <span className="ml-1 text-red-600">D+{daysOverdue}</span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
          schedule.status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' :
          schedule.status === 'overdue' ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300' :
          schedule.status === 'partial' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' :
          'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }`}>
          {PAYMENT_STATUS_LABEL[schedule.status]}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums">
        {schedule.paid_amount_krw > 0 ? krw(schedule.paid_amount_krw) + '원' : '—'}
      </td>
      <td className="py-1.5 pr-3">
        {!confirming && schedule.status !== 'paid' && schedule.status !== 'waived' && (
          <div className="flex gap-1">
            <button
              onClick={() => setConfirming(true)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white"
            >
              ✓ 입금
            </button>
            {schedule.status === 'overdue' && (
              <button
                onClick={doDunning}
                disabled={pending}
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600 text-white"
              >
                📨 {schedule.dunning_count + 1}차
              </button>
            )}
          </div>
        )}
        {confirming && (
          <div className="flex gap-1 items-center">
            <input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-20 px-1 py-0.5 text-[10px] border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
            <button onClick={doConfirm} disabled={pending} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white disabled:opacity-50">
              확인
            </button>
            <button onClick={() => setConfirming(false)} className="text-[10px] text-zinc-500">
              ✕
            </button>
          </div>
        )}
        {err && <div className="text-[10px] text-red-600">{err}</div>}
      </td>
    </tr>
  );
}

function NewContractModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [totalAmount, setTotalAmount] = useState('3000000');
  const [planType, setPlanType] = useState<PaymentPlanType>('installment');
  const [count, setCount] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [cycleDays, setCycleDays] = useState(30);
  const [gate, setGate] = useState<PaymentGate>('hard');
  const [gateStages, setGateStages] = useState('filing,opening_decision');
  const [retainerRatio, setRetainerRatio] = useState(0.33);

  const submit = () => {
    setErr(null);
    const n = Number(totalAmount);
    if (!Number.isFinite(n) || n <= 0) return setErr('총액 오류');
    startTransition(async () => {
      const r = await createPaymentContract({
        caseId,
        total_amount_krw: n,
        plan_type: planType,
        installment_count: planType === 'lump_sum' ? 1 : count,
        first_due_date: firstDueDate,
        cycle_days: cycleDays,
        payment_gate: gate,
        gate_blocks_stages: gate === 'hard' ? gateStages.split(',').map((s) => s.trim()).filter(Boolean) : [],
        retainer_ratio: retainerRatio,
      });
      if (!r.ok) setErr(r.error ?? '실패');
      else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-3 shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <h3 className="text-base font-semibold">수임료 계약 생성</h3>

        <Field label="총 계약금액 (원)">
          <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
        </Field>

        <Field label="지급 방식">
          <select value={planType} onChange={(e) => setPlanType(e.target.value as PaymentPlanType)} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent">
            <option value="lump_sum">일시 지급</option>
            <option value="installment">분할</option>
            <option value="conditional">조건부 (성공보수)</option>
          </select>
        </Field>

        {planType === 'installment' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="회차 수">
                <input type="number" min={2} max={12} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
              </Field>
              <Field label="주기 (일)">
                <input type="number" value={cycleDays} onChange={(e) => setCycleDays(Number(e.target.value))} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
              </Field>
            </div>
            <Field label="첫 회차 비율 (0~1, 착수금)">
              <input type="number" step="0.05" min={0} max={1} value={retainerRatio} onChange={(e) => setRetainerRatio(Number(e.target.value))} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
            </Field>
          </>
        )}

        <Field label="첫 납입일">
          <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
        </Field>

        <Field label="Payment Gate">
          <select value={gate} onChange={(e) => setGate(e.target.value as PaymentGate)} className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent">
            <option value="hard">Hard (미납시 Stage 진행 차단)</option>
            <option value="soft">Soft (경고만)</option>
          </select>
        </Field>

        {gate === 'hard' && (
          <Field label="차단할 Stage (쉼표)">
            <input value={gateStages} onChange={(e) => setGateStages(e.target.value)} placeholder="filing,opening_decision" className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent" />
            <p className="text-[10px] text-zinc-500 mt-0.5">이 Stage 진입 시도 시 미납 회차 있으면 차단</p>
          </Field>
        )}

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700">취소</button>
          <button type="submit" disabled={pending} className="px-4 py-1.5 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50">
            {pending ? '생성중...' : '계약 · 회차 자동 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 block mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function ReleaseButton({ holdId }: { holdId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const doRelease = () => {
    startTransition(async () => {
      const r = await releaseFinanceHold({ holdId });
      if (r.ok) router.refresh();
    });
  };
  return (
    <button onClick={doRelease} disabled={pending} className="ml-2 text-[10px] underline disabled:opacity-50">
      {pending ? '...' : '해제'}
    </button>
  );
}

function PlaceHoldInline({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!reason.trim()) return;
    startTransition(async () => {
      const r = await placeFinanceHold({ caseId, reason: reason.trim() });
      if (r.ok) {
        setOpen(false);
        setReason('');
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[10px] text-red-600 hover:underline">
        🛑 Finance Hold 걸기
      </button>
    );
  }

  return (
    <div className="flex gap-1 items-center">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="사유"
        className="flex-1 px-2 py-0.5 text-[10px] border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
      />
      <button onClick={submit} disabled={pending} className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white disabled:opacity-50">
        Hold
      </button>
      <button onClick={() => setOpen(false)} className="text-[10px] text-zinc-500">
        ✕
      </button>
    </div>
  );
}
