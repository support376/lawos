import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, format, startOfMonth } from 'date-fns';
import type { MyRoleContext, DomainKey } from '@/lib/auth/my-roles';
import type { PaymentSchedule } from '@/lib/ontology/core/objects';
import { PAYMENT_KIND_LABEL } from '@/lib/ontology/core/objects';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export async function BillingDashboard({
  ctx,
  domain,
}: {
  ctx: MyRoleContext;
  domain: DomainKey;
}) {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [schedulesRes, casesRes, holdsRes] = await Promise.all([
    supabase
      .from('payment_schedules')
      .select(`
        *,
        case:cases(id, case_type, client:clients(name))
      `)
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('cases')
      .select('id, case_type, status')
      .eq('status', 'active'),
    supabase
      .from('case_financial_holds')
      .select('case_id, reason, held_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true),
  ]);

  let schedules = ((schedulesRes.data ?? []) as unknown as Array<
    PaymentSchedule & { case: { id: string; case_type: string | null; client: { name: string } | null } | null }
  >);
  if (domain !== '*') {
    schedules = schedules.filter((s) => s.case?.case_type === domain);
  }

  const cases = (casesRes.data ?? []) as Array<{ id: string; case_type: string | null; status: string }>;
  const holds = (holdsRes.data ?? []) as Array<{ case_id: string; reason: string; held_at: string }>;

  // KPI
  const overdue = schedules.filter((s) => s.status === 'overdue');
  const overdueSum = overdue.reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);
  const thisMonthDue = schedules.filter((s) => {
    const d = new Date(s.due_date);
    return d >= monthStart && s.status !== 'paid';
  });
  const thisMonthDueSum = thisMonthDue.reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);
  const thisMonthPaid = schedules.filter((s) => s.paid_date && new Date(s.paid_date) >= monthStart);
  const thisMonthPaidSum = thisMonthPaid.reduce((sum, s) => sum + s.paid_amount_krw, 0);
  const collectionRate =
    schedules.length > 0
      ? Math.round(
          (schedules.reduce((sum, s) => sum + s.paid_amount_krw, 0) /
            schedules.reduce((sum, s) => sum + s.amount_krw, 0)) *
            100,
        )
      : 0;

  // 오늘 독촉 대상: overdue 중 last_dunning_at 비어있거나 next_dunning_at <= now
  const dunningTargets = overdue.filter((s) => {
    if (!s.last_dunning_at) return true;
    if (s.next_dunning_at && new Date(s.next_dunning_at) <= now) return true;
    // 단순 기본: 마지막 독촉 7일 경과
    const lastDays = differenceInCalendarDays(now, new Date(s.last_dunning_at));
    return lastDays >= 7;
  });

  // 이번주 예정 입금
  const upcomingDue = schedules
    .filter((s) => {
      if (s.status === 'paid') return false;
      const d = differenceInCalendarDays(new Date(s.due_date), now);
      return d >= 0 && d <= 7;
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="미수금" value={`${krw(overdueSum)}원`} sub={`${overdue.length}건 연체`} tone="red" />
        <KPI label="이번달 예정" value={`${krw(thisMonthDueSum)}원`} sub={`${thisMonthDue.length}회차`} />
        <KPI label="이번달 수금" value={`${krw(thisMonthPaidSum)}원`} sub={`${thisMonthPaid.length}건 완납`} tone="emerald" />
        <KPI label="전체 수금률" value={`${collectionRate}%`} sub={`활성 계약 ${cases.length}건`} tone={collectionRate >= 80 ? 'emerald' : 'amber'} />
      </div>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">🎯 오늘 독촉 대상 ({dunningTargets.length})</h2>
        {dunningTargets.length === 0 ? (
          <p className="text-xs text-zinc-500">예약된 독촉 없음</p>
        ) : (
          <div className="space-y-1">
            {dunningTargets.slice(0, 10).map((s) => {
              const days = differenceInCalendarDays(now, new Date(s.due_date));
              return (
                <Link
                  key={s.id}
                  href={`/workflow?case=${s.case_id}`}
                  className="flex justify-between items-center text-xs p-2 rounded bg-red-50 dark:bg-red-950/20 hover:shadow"
                >
                  <span className="truncate flex-1">
                    <span className="font-medium">{s.case?.client?.name ?? '—'}</span>
                    <span className="text-zinc-500 ml-2">
                      {s.installment_no}회차 · {PAYMENT_KIND_LABEL[s.kind]}
                    </span>
                  </span>
                  <span className="text-red-600 tabular-nums shrink-0 ml-2">
                    D+{days} · {krw(s.amount_krw - s.paid_amount_krw)}원
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📅 이번주 예정 입금 ({upcomingDue.length})</h2>
        {upcomingDue.length === 0 ? (
          <p className="text-xs text-zinc-500">예정 없음</p>
        ) : (
          <div className="space-y-1">
            {upcomingDue.map((s) => (
              <Link
                key={s.id}
                href={`/workflow?case=${s.case_id}`}
                className="flex justify-between items-center text-xs p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="truncate flex-1">
                  <span className="font-medium">{s.case?.client?.name ?? '—'}</span>
                  <span className="text-zinc-500 ml-2">
                    {s.installment_no}회차 · {PAYMENT_KIND_LABEL[s.kind]}
                  </span>
                </span>
                <span className="tabular-nums shrink-0 ml-2">
                  {s.due_date} · {krw(s.amount_krw)}원
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {holds.length > 0 && (
        <section className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2 text-red-700 dark:text-red-400">🛑 내가 건 Finance Hold ({holds.length})</h2>
          <div className="space-y-1 text-xs">
            {holds.map((h) => (
              <Link
                key={h.case_id}
                href={`/workflow?case=${h.case_id}`}
                className="flex justify-between items-center p-2 rounded bg-white dark:bg-zinc-900 hover:shadow"
              >
                <span className="truncate flex-1">{h.reason}</span>
                <span className="text-[10px] text-zinc-500 shrink-0 ml-2">{h.held_at.slice(0, 10)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="text-[10px] text-zinc-500 text-right italic">
        갱신: {format(now, 'yyyy-MM-dd HH:mm')}
      </p>
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'emerald' | 'red' | 'amber' }) {
  const c = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-zinc-500';
  return (
    <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
      <div className={`text-[10px] mt-0.5 ${c}`}>{sub}</div>
    </div>
  );
}
