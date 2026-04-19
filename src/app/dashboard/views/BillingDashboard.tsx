import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, format, startOfMonth, subMonths, parseISO } from 'date-fns';
import type { MyRoleContext, DomainKey } from '@/lib/auth/my-roles';
import type { PaymentSchedule, PaymentContract } from '@/lib/ontology/core/objects';
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

  const [schedulesRes, contractsRes, casesRes, holdsRes] = await Promise.all([
    supabase
      .from('payment_schedules')
      .select(`
        *,
        case:cases(id, case_type, client:clients(name))
      `)
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('payment_contracts')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .is('cancelled_at', null),
    supabase
      .from('cases')
      .select('id, case_type, status, client:clients(name)')
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
  const contracts = (contractsRes.data ?? []) as PaymentContract[];
  const cases = ((casesRes.data ?? []) as unknown as Array<{
    id: string; case_type: string | null; status: string; client: { name: string } | null;
  }>);
  const holds = (holdsRes.data ?? []) as Array<{ case_id: string; reason: string; held_at: string }>;

  if (domain !== '*') {
    schedules = schedules.filter((s) => s.case?.case_type === domain);
  }

  // ============ KPI ============
  const overdue = schedules.filter((s) => s.status === 'overdue');
  const overdueSum = overdue.reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);
  const thisMonthDue = schedules.filter((s) => new Date(s.due_date) >= monthStart && s.status !== 'paid');
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

  // ============ 사건별 매출 표 ============
  const caseRevenueMap = new Map<string, {
    caseId: string;
    clientName: string;
    contractTotal: number;
    paidTotal: number;
    balance: number;
    overdueCount: number;
    nextDue: string | null;
    lastPaid: string | null;
    scheduleCount: number;
    isHeld: boolean;
  }>();
  const holdSet = new Set(holds.map((h) => h.case_id));
  for (const s of schedules) {
    if (!s.case?.id) continue;
    const id = s.case.id;
    const cur = caseRevenueMap.get(id) ?? {
      caseId: id,
      clientName: s.case.client?.name ?? '—',
      contractTotal: 0,
      paidTotal: 0,
      balance: 0,
      overdueCount: 0,
      nextDue: null as string | null,
      lastPaid: null as string | null,
      scheduleCount: 0,
      isHeld: holdSet.has(id),
    };
    cur.contractTotal += s.amount_krw;
    cur.paidTotal += s.paid_amount_krw;
    cur.balance += s.amount_krw - s.paid_amount_krw;
    cur.scheduleCount += 1;
    if (s.status === 'overdue') cur.overdueCount += 1;
    if (s.status !== 'paid' && (!cur.nextDue || s.due_date < cur.nextDue)) cur.nextDue = s.due_date;
    if (s.paid_date && (!cur.lastPaid || s.paid_date > cur.lastPaid)) cur.lastPaid = s.paid_date;
    caseRevenueMap.set(id, cur);
  }
  const caseRevenue = Array.from(caseRevenueMap.values()).sort((a, b) => b.balance - a.balance);

  // ============ 월별 수금 추이 (6개월) ============
  const monthlyKeys: string[] = [];
  for (let i = 5; i >= 0; i--) monthlyKeys.push(format(startOfMonth(subMonths(now, i)), 'yyyy-MM'));
  const monthlyStats = monthlyKeys.map((k) => {
    const paid = schedules
      .filter((s) => s.paid_date && format(parseISO(s.paid_date), 'yyyy-MM') === k)
      .reduce((sum, s) => sum + s.paid_amount_krw, 0);
    const scheduled = schedules
      .filter((s) => format(parseISO(s.due_date), 'yyyy-MM') === k)
      .reduce((sum, s) => sum + s.amount_krw, 0);
    const newContractCount = contracts.filter(
      (c) => c.signed_at && format(parseISO(c.signed_at), 'yyyy-MM') === k,
    ).length;
    const newContractSum = contracts
      .filter((c) => c.signed_at && format(parseISO(c.signed_at), 'yyyy-MM') === k)
      .reduce((sum, c) => sum + c.total_amount_krw, 0);
    return { month: k, paid, scheduled, newContractCount, newContractSum };
  });

  // ============ 연체 기간 분포 ============
  const overdueBuckets = { '1-7일': 0, '8-30일': 0, '31+일': 0 };
  for (const s of overdue) {
    const d = differenceInCalendarDays(now, new Date(s.due_date));
    if (d <= 7) overdueBuckets['1-7일']++;
    else if (d <= 30) overdueBuckets['8-30일']++;
    else overdueBuckets['31+일']++;
  }

  // ============ 오늘 독촉 대상 ============
  const dunningTargets = overdue.filter((s) => {
    if (!s.last_dunning_at) return true;
    const lastDays = differenceInCalendarDays(now, new Date(s.last_dunning_at));
    return lastDays >= 7;
  });

  // ============ 이번주 예정 입금 ============
  const upcomingDue = schedules
    .filter((s) => s.status !== 'paid' && differenceInCalendarDays(new Date(s.due_date), now) >= 0 && differenceInCalendarDays(new Date(s.due_date), now) <= 7)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="미수금" value={`${krw(overdueSum)}원`} sub={`${overdue.length}건 연체`} tone="red" />
        <KPI label="이번달 예정" value={`${krw(thisMonthDueSum)}원`} sub={`${thisMonthDue.length}회차`} />
        <KPI label="이번달 수금" value={`${krw(thisMonthPaidSum)}원`} sub={`${thisMonthPaid.length}건 완납`} tone="emerald" />
        <KPI label="전체 수금률" value={`${collectionRate}%`} sub={`활성 계약 ${contracts.length}건`} tone={collectionRate >= 80 ? 'emerald' : 'amber'} />
      </div>

      {/* 사건별 매출 표 ★ */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">📊 사건별 매출 현황 ({caseRevenue.length})</h2>
          <span className="text-[10px] text-zinc-500">잔액 높은 순 정렬</span>
        </div>
        {caseRevenue.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">활성 계약 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="py-1.5 pr-3">의뢰인</th>
                  <th className="py-1.5 pr-3 text-right">계약총액</th>
                  <th className="py-1.5 pr-3 text-right">수금</th>
                  <th className="py-1.5 pr-3 text-right">잔액</th>
                  <th className="py-1.5 pr-3 text-right">%</th>
                  <th className="py-1.5 pr-3 text-right">연체</th>
                  <th className="py-1.5 pr-3">다음 납기</th>
                  <th className="py-1.5 pr-3">최근 입금</th>
                  <th className="py-1.5 pr-3">상태</th>
                </tr>
              </thead>
              <tbody>
                {caseRevenue.map((r) => {
                  const pct = r.contractTotal > 0 ? Math.round((r.paidTotal / r.contractTotal) * 100) : 0;
                  return (
                    <tr key={r.caseId} className="border-b border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 pr-3">
                        <Link href={`/workflow?case=${r.caseId}`} className="hover:underline font-medium">
                          {r.clientName}
                        </Link>
                        {r.isHeld && <span className="ml-1 text-[10px] text-red-600">🛑</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(r.contractTotal)}원</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">{krw(r.paidTotal)}원</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${r.balance > 0 ? 'text-red-600 font-semibold' : ''}`}>
                        {krw(r.balance)}원
                      </td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${pct >= 100 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {pct}%
                      </td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${r.overdueCount > 0 ? 'text-red-600' : 'text-zinc-400'}`}>
                        {r.overdueCount > 0 ? r.overdueCount : '—'}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-500">{r.nextDue ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-zinc-500">{r.lastPaid ?? '—'}</td>
                      <td className="py-1.5 pr-3">
                        {r.balance === 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">완납</span>
                        ) : r.overdueCount > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300">연체</span>
                        ) : r.paidTotal > 0 ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">진행</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800">예정</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-zinc-50 dark:bg-zinc-800/30 font-semibold">
                <tr>
                  <td className="py-1.5 pr-3">합계</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {krw(caseRevenue.reduce((s, r) => s + r.contractTotal, 0))}원
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">
                    {krw(caseRevenue.reduce((s, r) => s + r.paidTotal, 0))}원
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">
                    {krw(caseRevenue.reduce((s, r) => s + r.balance, 0))}원
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* 월별 수금 추이 */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📈 월별 수금 추이 (6개월)</h2>
        <MonthlyRevenueChart stats={monthlyStats} />
      </section>

      {/* 연체 기간 분포 + 월별 신규계약 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">⏱ 연체 기간 분포</h2>
          <div className="space-y-2">
            {(Object.entries(overdueBuckets) as Array<[string, number]>).map(([k, v]) => {
              const pct = overdue.length > 0 ? (v / overdue.length) * 100 : 0;
              const color = k === '31+일' ? 'bg-red-500' : k === '8-30일' ? 'bg-amber-500' : 'bg-yellow-400';
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{k}</span>
                    <span className="tabular-nums">{v}건 ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {overdue.length === 0 && <p className="text-xs text-zinc-500">연체 없음</p>}
          </div>
        </section>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">📝 월별 신규 계약</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">월</th>
                <th className="py-1.5 pr-3 text-right">건수</th>
                <th className="py-1.5 pr-3 text-right">총액</th>
              </tr>
            </thead>
            <tbody>
              {monthlyStats.map((m) => (
                <tr key={m.month} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3">{m.month}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{m.newContractCount}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {m.newContractSum > 0 ? `${krw(m.newContractSum)}원` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* 오늘 독촉 대상 */}
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

      {/* 이번주 예정 입금 */}
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
                <span className="tabular-nums shrink-0 ml-2">{s.due_date} · {krw(s.amount_krw)}원</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">갱신: {format(now, 'yyyy-MM-dd HH:mm')}</p>
    </div>
  );
}

function MonthlyRevenueChart({
  stats,
}: {
  stats: Array<{ month: string; paid: number; scheduled: number; newContractCount: number; newContractSum: number }>;
}) {
  const max = Math.max(1, ...stats.map((s) => Math.max(s.paid, s.scheduled)));
  return (
    <div>
      <div className="flex items-end gap-3 h-48">
        {stats.map((s) => (
          <div key={s.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex-1 flex items-end gap-1 w-full justify-center">
              <div
                className="flex-1 max-w-[22px] bg-zinc-300 dark:bg-zinc-700 rounded-t"
                style={{ height: `${(s.scheduled / max) * 100}%`, minHeight: s.scheduled > 0 ? '3px' : 0 }}
                title={`예정: ${s.scheduled.toLocaleString()}원`}
              />
              <div
                className="flex-1 max-w-[22px] bg-emerald-500 rounded-t"
                style={{ height: `${(s.paid / max) * 100}%`, minHeight: s.paid > 0 ? '3px' : 0 }}
                title={`수금: ${s.paid.toLocaleString()}원`}
              />
            </div>
            <p className="text-[10px] text-zinc-500">{s.month.slice(5)}월</p>
            <p className="text-[10px] tabular-nums text-zinc-400">
              {s.paid > 0 ? krw(s.paid) : '—'}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[10px] text-zinc-500 mt-3">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-zinc-300 dark:bg-zinc-700 rounded-sm" /> 예정 (계약 기준)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded-sm" /> 실제 수금</span>
      </div>
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
