import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, parseISO, startOfMonth, subMonths } from 'date-fns';
import type { MyRoleContext, DomainKey } from '@/lib/auth/my-roles';
import { ConsultantPipeline } from './ConsultantPipeline';
import { WriterPipeline } from './WriterPipeline';
import { BillingPipeline } from './BillingPipeline';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

// 대표 워크플로우 = 3개 파이프라인을 한 화면에 쌓아 보고 **직접 개입** 가능
// 대시보드와의 차이: 대시보드=집계/그래프, 여기=개별 카드 + 즉각 조작
export async function PartnerDashboard({ ctx }: { ctx: MyRoleContext }) {
  const supabase = await createClient();
  const monthStart = startOfMonth(new Date());
  const prevMonthStart = startOfMonth(subMonths(new Date(), 1));

  const [casesRes, schedulesRes, actionsRes, holdsRes, stageHistRes, membersRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id, status, retainer_date, created_at, assigned_to')
      .eq('status', 'active'),
    supabase
      .from('payment_schedules')
      .select('id, case_id, status, amount_krw, paid_amount_krw, due_date')
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('actions')
      .select('id, status, assigned_to, due_date')
      .eq('workspace_id', ctx.workspaceId)
      .in('status', ['pending', 'doing', 'blocked']),
    supabase
      .from('case_financial_holds')
      .select('case_id, reason')
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true),
    supabase
      .from('rehab_stage_history')
      .select('case_id, entry_date')
      .eq('workspace_id', ctx.workspaceId)
      .is('exit_date', null),
    supabase
      .from('workspace_members')
      .select('user_id, user:users(id, name, email)')
      .eq('workspace_id', ctx.workspaceId),
  ]);

  const cases = (casesRes.data ?? []) as Array<{
    id: string; status: string; retainer_date: string | null; created_at: string; assigned_to: string | null;
  }>;
  const schedules = (schedulesRes.data ?? []) as Array<{
    id: string; case_id: string; status: string; amount_krw: number; paid_amount_krw: number; due_date: string;
  }>;
  const actions = (actionsRes.data ?? []) as Array<{
    id: string; status: string; assigned_to: string | null; due_date: string | null;
  }>;
  const holds = (holdsRes.data ?? []) as Array<{ case_id: string; reason: string }>;
  const stageHistory = (stageHistRes.data ?? []) as Array<{ case_id: string; entry_date: string }>;
  const members = ((membersRes.data ?? []) as unknown as Array<{
    user_id: string; user: { id: string; name: string | null; email: string };
  }>);

  // KPI
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
  const overdueTotal = schedules
    .filter((s) => s.status === 'overdue')
    .reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);
  const avgStageDays =
    stageHistory.length > 0
      ? Math.round(
          stageHistory.reduce(
            (sum, h) => sum + differenceInCalendarDays(new Date(), new Date(h.entry_date)),
            0,
          ) / stageHistory.length,
        )
      : 0;

  const today = new Date();
  const workload = members
    .map((m) => {
      const myCases = cases.filter((c) => c.assigned_to === m.user_id);
      const myActions = actions.filter((a) => a.assigned_to === m.user_id);
      const dueToday = myActions.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), today) === 0).length;
      const overdue = myActions.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), today) < 0).length;
      return {
        user: m.user,
        caseCount: myCases.length,
        actionCount: myActions.length,
        dueToday,
        overdue,
      };
    })
    .filter((w) => w.caseCount > 0 || w.actionCount > 0)
    .sort((a, b) => b.caseCount + b.actionCount - a.caseCount - a.actionCount);

  return (
    <div className="space-y-6">
      {/* ======== KPI 스트립 ======== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KPIChip label="이번달 수임" value={`${thisMonthCases}건`} delta={prevMonthCases > 0 ? `${thisMonthCases >= prevMonthCases ? '+' : ''}${thisMonthCases - prevMonthCases}` : '—'} tone={thisMonthCases >= prevMonthCases ? 'emerald' : 'red'} />
        <KPIChip label="활성 사건" value={`${cases.length}건`} delta={holds.length > 0 ? `🛑 Hold ${holds.length}` : '정상'} tone={holds.length > 0 ? 'red' : 'zinc'} />
        <KPIChip label="미수금" value={krw(overdueTotal)} delta={`연체 ${schedules.filter((s) => s.status === 'overdue').length}건`} tone={overdueTotal > 0 ? 'red' : 'emerald'} />
        <KPIChip label="진행 Action" value={`${actions.length}개`} delta={`지연 ${actions.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), today) < 0).length}`} tone="zinc" />
        <KPIChip label="평균 Stage 체류" value={`${avgStageDays}일`} delta={`${stageHistory.length} Stage`} tone="zinc" />
      </div>

      {/* ======== 📞 상담 파이프라인 (카드 개입 가능) ======== */}
      <SectionHeader title="📞 상담 파이프라인 (Lead)" note="카드 클릭 → 상담기록·수임확정" />
      <ConsultantPipeline domain="*" ctx={ctx} />

      {/* ======== ✍️ 작성 파이프라인 ======== */}
      <SectionHeader title="✍️ 작성 파이프라인 (Case Stage)" note="카드 클릭 → 사건 상세 · Stage 전이 · 재정 입력" />
      <WriterPipeline domain={'personal_rehab' as DomainKey} ctx={ctx} />

      {/* ======== 💰 재무 파이프라인 ======== */}
      <SectionHeader title="💰 재무 파이프라인 (Payment)" note="카드 클릭 → 입금확인·독촉·Finance Hold" />
      <BillingPipeline domain="*" ctx={ctx} />

      {/* ======== 👥 담당자 Workload ======== */}
      <SectionHeader title="👥 담당자 Workload" note="담당자 이름 클릭 → 개인별 뷰 (향후)" />
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        {workload.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">할당된 Case/Action 없음</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">담당자</th>
                <th className="py-1.5 pr-3 text-right">활성 Case</th>
                <th className="py-1.5 pr-3 text-right">Action</th>
                <th className="py-1.5 pr-3 text-right">오늘 마감</th>
                <th className="py-1.5 pr-3 text-right">지연</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w) => (
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
        💡 상담·작성·재무 파이프라인은 각 팀 뷰와 동일. 대표는 여기서 한꺼번에 보고 개입.
      </p>
    </div>
  );
}

function KPIChip({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: 'emerald' | 'red' | 'zinc';
}) {
  const c = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : 'text-zinc-500';
  return (
    <div className="p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
      <div className={`text-[10px] mt-0.5 ${c}`}>{delta}</div>
    </div>
  );
}

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between mt-2 mb-1 pb-1 border-b border-zinc-200 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <span className="text-[10px] text-zinc-500 italic">{note}</span>}
    </div>
  );
}
