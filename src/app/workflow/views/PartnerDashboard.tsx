import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { MyRoleContext } from '@/lib/auth/my-roles';
import type { LeadStatus } from '@/lib/ontology/core/objects';
import { LEAD_STATUS_LABEL } from '@/lib/ontology/core/objects';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';
import { startOfMonth, subMonths, format, differenceInCalendarDays, parseISO } from 'date-fns';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export async function PartnerDashboard({ ctx }: { ctx: MyRoleContext }) {
  const supabase = await createClient();
  const monthStart = startOfMonth(new Date());
  const prevMonthStart = startOfMonth(subMonths(new Date(), 1));

  const [
    leadsRes,
    casesRes,
    schedulesRes,
    actionsRes,
    holdsRes,
    stageHistoryRes,
    membersRes,
  ] = await Promise.all([
    supabase
      .from('leads')
      .select('id, status, case_type_hint, created_at, assigned_consultant_id')
      .eq('workspace_id', ctx.workspaceId)
      .gte('created_at', subMonths(new Date(), 3).toISOString()),
    supabase
      .from('cases')
      .select(`
        id, title, case_type, status, assigned_to, retainer_date, created_at, closed_date,
        client:clients(id, name),
        rehab_case_details(current_stage_key)
      `)
      .eq('status', 'active'),
    supabase
      .from('payment_schedules')
      .select('id, case_id, status, amount_krw, paid_amount_krw, due_date')
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('actions')
      .select('id, status, assigned_to, due_date, subject_id')
      .eq('workspace_id', ctx.workspaceId)
      .in('status', ['pending', 'doing', 'blocked']),
    supabase
      .from('case_financial_holds')
      .select('case_id, reason')
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true),
    supabase
      .from('rehab_stage_history')
      .select('case_id, stage_key, entry_date, exit_date')
      .eq('workspace_id', ctx.workspaceId)
      .is('exit_date', null),
    supabase
      .from('workspace_members')
      .select('user_id, user:users(id, name, email)')
      .eq('workspace_id', ctx.workspaceId),
  ]);

  const leads = (leadsRes.data ?? []) as Array<{
    id: string;
    status: LeadStatus;
    case_type_hint: string;
    created_at: string;
    assigned_consultant_id: string | null;
  }>;

  const cases = ((casesRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    case_type: string | null;
    status: string;
    assigned_to: string | null;
    retainer_date: string | null;
    created_at: string;
    closed_date: string | null;
    client: { id: string; name: string } | null;
    rehab_case_details: Array<{ current_stage_key: string | null }> | null;
  }>);

  const schedules = (schedulesRes.data ?? []) as Array<{
    id: string;
    case_id: string;
    status: string;
    amount_krw: number;
    paid_amount_krw: number;
    due_date: string;
  }>;

  const actions = (actionsRes.data ?? []) as Array<{
    id: string;
    status: string;
    assigned_to: string | null;
    due_date: string | null;
    subject_id: string;
  }>;

  const holds = (holdsRes.data ?? []) as Array<{ case_id: string; reason: string }>;
  const stageHistory = (stageHistoryRes.data ?? []) as Array<{
    case_id: string;
    stage_key: string;
    entry_date: string;
  }>;
  const members = ((membersRes.data ?? []) as unknown as Array<{
    user_id: string;
    user: { id: string; name: string | null; email: string };
  }>);

  // ============ KPI ============
  const thisMonthCases = cases.filter((c) => {
    const d = c.retainer_date ?? c.created_at;
    return d && new Date(d) >= monthStart;
  }).length;
  const prevMonthCases = cases.filter((c) => {
    const d = c.retainer_date ?? c.created_at;
    if (!d) return false;
    const dd = new Date(d);
    return dd >= prevMonthStart && dd < monthStart;
  }).length;

  const activeCases = cases.length;
  const overdueTotal = schedules
    .filter((s) => s.status === 'overdue')
    .reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);

  // 평균 Stage 체류일
  const avgStageDays =
    stageHistory.length > 0
      ? Math.round(
          stageHistory.reduce(
            (sum, h) => sum + differenceInCalendarDays(new Date(), new Date(h.entry_date)),
            0,
          ) / stageHistory.length,
        )
      : 0;

  // ============ Lead 퍼널 ============
  const leadByStatus: Record<LeadStatus, number> = {
    new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, cold: 0,
  };
  leads.forEach((l) => { leadByStatus[l.status]++; });
  const conversionRate =
    leads.length > 0 ? Math.round((leadByStatus.converted / leads.length) * 100) : 0;

  // ============ Case Stage 분포 (개인회생만) ============
  const stageDistribution = new Map<string, number>();
  for (const c of cases) {
    if (c.case_type !== 'personal_rehab') continue;
    const sk = c.rehab_case_details?.[0]?.current_stage_key ?? 'consultation';
    stageDistribution.set(sk, (stageDistribution.get(sk) ?? 0) + 1);
  }

  // ============ Payment 현황 ============
  const totalScheduled = schedules.reduce((sum, s) => sum + s.amount_krw, 0);
  const totalPaid = schedules.reduce((sum, s) => sum + s.paid_amount_krw, 0);
  const collectionRate =
    totalScheduled > 0 ? Math.round((totalPaid / totalScheduled) * 100) : 0;
  const topOverdue = schedules
    .filter((s) => s.status === 'overdue')
    .sort((a, b) => {
      const aDays = differenceInCalendarDays(new Date(), new Date(a.due_date));
      const bDays = differenceInCalendarDays(new Date(), new Date(b.due_date));
      return bDays - aDays;
    })
    .slice(0, 5);

  // ============ 담당자 Workload ============
  const workload = members.map((m) => {
    const myCases = cases.filter((c) => c.assigned_to === m.user_id);
    const myActions = actions.filter((a) => a.assigned_to === m.user_id);
    const today = new Date();
    const dueToday = myActions.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), today) === 0).length;
    const overdue = myActions.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), today) < 0).length;
    return {
      user: m.user,
      caseCount: myCases.length,
      actionCount: myActions.length,
      dueToday,
      overdue,
    };
  }).filter((w) => w.caseCount > 0 || w.actionCount > 0);

  return (
    <div className="space-y-5">
      {/* ============ KPI ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="이번달 수임"
          value={`${thisMonthCases}건`}
          delta={
            prevMonthCases > 0
              ? `${thisMonthCases >= prevMonthCases ? '+' : ''}${thisMonthCases - prevMonthCases} vs 전월`
              : '전월 대비'
          }
          deltaColor={thisMonthCases >= prevMonthCases ? 'emerald' : 'red'}
        />
        <KPICard label="활성 사건" value={`${activeCases}건`} delta={`Hold ${holds.length}건`} />
        <KPICard
          label="미수금"
          value={`${krw(overdueTotal)}원`}
          delta={`수금률 ${collectionRate}%`}
          deltaColor={collectionRate >= 80 ? 'emerald' : collectionRate >= 50 ? 'amber' : 'red'}
        />
        <KPICard
          label="평균 Stage 체류"
          value={`${avgStageDays}일`}
          delta={`활성 Stage ${stageHistory.length}개`}
        />
      </div>

      {/* ============ Lead 퍼널 ============ */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">📞 Lead 퍼널 (최근 3개월)</h2>
          <div className="text-xs">
            <span className="text-zinc-500">전환율 </span>
            <span className="font-semibold tabular-nums">{conversionRate}%</span>
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {(Object.keys(leadByStatus) as LeadStatus[]).map((s) => (
            <FunnelStep
              key={s}
              label={LEAD_STATUS_LABEL[s]}
              count={leadByStatus[s]}
              tone={s === 'converted' ? 'ok' : s === 'lost' ? 'red' : s === 'cold' ? 'zinc' : 'info'}
            />
          ))}
        </div>
      </section>

      {/* ============ Stage 분포 (개인회생) ============ */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📁 개인회생 Stage 분포</h2>
        <div className="flex gap-1 overflow-x-auto">
          {Object.values(STAGES)
            .filter((s) => !s.is_bypass)
            .sort((a, b) => {
              const order = ['consultation', 'engagement', 'document_prep', 'filing', 'correction_loop', 'opening_decision', 'claim_filing', 'creditor_meeting', 'plan_approval', 'repayment', 'modification', 'discharge', 'termination'];
              return order.indexOf(a.key) - order.indexOf(b.key);
            })
            .map((s) => {
              const count = stageDistribution.get(s.key) ?? 0;
              return (
                <div
                  key={s.key}
                  className={`flex-1 min-w-[70px] text-center p-2 rounded ${count > 0 ? 'bg-zinc-100 dark:bg-zinc-800' : 'opacity-40'}`}
                >
                  <div className="text-[10px] text-zinc-500 truncate">{s.label}</div>
                  <div className="text-lg font-semibold tabular-nums">{count}</div>
                </div>
              );
            })}
        </div>
        {holds.length > 0 && (
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded text-xs space-y-0.5">
            <div className="font-semibold text-red-700 dark:text-red-400">🛑 Finance Hold {holds.length}건</div>
            {holds.slice(0, 3).map((h) => (
              <div key={h.case_id} className="text-red-600 dark:text-red-300">
                — {h.reason}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============ Payment ============ */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">💰 결제 현황</h2>
          <Link href="/workflow?view=billing&domain=*" className="text-xs text-zinc-500 hover:underline">
            재무 파이프라인 →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
          <Metric label="계약 총액" value={`${krw(totalScheduled)}원`} />
          <Metric label="수금액" value={`${krw(totalPaid)}원`} tone="emerald" />
          <Metric label="미수금" value={`${krw(overdueTotal)}원`} tone="red" />
        </div>
        {topOverdue.length > 0 ? (
          <div>
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
              🔴 연체 Top {topOverdue.length}
            </div>
            <div className="space-y-1 text-xs">
              {topOverdue.map((s) => {
                const days = differenceInCalendarDays(new Date(), new Date(s.due_date));
                const caseInfo = cases.find((c) => c.id === s.case_id);
                return (
                  <Link
                    key={s.id}
                    href={`/workflow?case=${s.case_id}`}
                    className="flex justify-between items-center py-1 px-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span className="truncate">{caseInfo?.client?.name ?? '—'}</span>
                    <span className="text-red-600 tabular-nums">
                      D+{days} · {krw(s.amount_krw - s.paid_amount_krw)}원
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">연체 없음</p>
        )}
      </section>

      {/* ============ Workload ============ */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">👥 담당자별 Workload</h2>
        {workload.length === 0 ? (
          <p className="text-xs text-zinc-500">할당된 Case 또는 Action 없음</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">이름</th>
                <th className="py-1.5 pr-3 text-right">활성 Case</th>
                <th className="py-1.5 pr-3 text-right">Action</th>
                <th className="py-1.5 pr-3 text-right">오늘 마감</th>
                <th className="py-1.5 pr-3 text-right">지연</th>
              </tr>
            </thead>
            <tbody>
              {workload
                .sort((a, b) => b.caseCount + b.actionCount - a.caseCount - a.actionCount)
                .map((w) => (
                  <tr key={w.user.id} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3">{w.user.name ?? w.user.email.split('@')[0]}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{w.caseCount}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{w.actionCount}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${w.dueToday > 0 ? 'text-amber-600' : ''}`}>
                      {w.dueToday > 0 ? w.dueToday : '—'}
                    </td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums ${w.overdue > 0 ? 'text-red-600' : ''}`}>
                      {w.overdue > 0 ? w.overdue : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">
        갱신: {format(new Date(), 'yyyy-MM-dd HH:mm')} · 실시간 집계
      </p>
    </div>
  );
}

function KPICard({
  label,
  value,
  delta,
  deltaColor,
}: {
  label: string;
  value: string;
  delta: string;
  deltaColor?: 'emerald' | 'red' | 'amber';
}) {
  const deltaC = deltaColor === 'emerald' ? 'text-emerald-600' : deltaColor === 'red' ? 'text-red-600' : deltaColor === 'amber' ? 'text-amber-600' : 'text-zinc-500';
  return (
    <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
      <div className={`text-[10px] mt-0.5 ${deltaC}`}>{delta}</div>
    </div>
  );
}

function FunnelStep({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'ok' | 'red' | 'zinc' | 'info';
}) {
  const bg = {
    ok: 'bg-emerald-100 dark:bg-emerald-950/30',
    red: 'bg-red-50 dark:bg-red-950/20',
    zinc: 'bg-zinc-100 dark:bg-zinc-800',
    info: 'bg-blue-50 dark:bg-blue-950/20',
  }[tone];
  return (
    <div className={`text-center p-2 rounded ${bg}`}>
      <div className="text-[10px] text-zinc-600 dark:text-zinc-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{count}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'emerald' | 'red';
}) {
  const c = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : '';
  return (
    <div>
      <div className="text-zinc-500">{label}</div>
      <div className={`font-semibold tabular-nums text-sm ${c}`}>{value}</div>
    </div>
  );
}
