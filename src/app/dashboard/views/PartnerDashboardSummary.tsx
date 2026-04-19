import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { startOfMonth, startOfWeek, subMonths, subWeeks, format, parseISO } from 'date-fns';
import type { MyRoleContext } from '@/lib/auth/my-roles';
import { listPendingConfirms } from '@/app/actions/case-approval';
import { PendingConfirmsBanner } from '@/app/workflow/components/PendingConfirmsBanner';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export async function PartnerDashboardSummary({ ctx }: { ctx: MyRoleContext }) {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  // 주차별 6주
  const weekKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const w = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    weekKeys.push(format(w, 'yyyy-MM-dd'));
  }
  // 월별 6개월
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = startOfMonth(subMonths(now, i));
    monthKeys.push(format(m, 'yyyy-MM'));
  }

  const pendingConfirms = await listPendingConfirms();

  const [casesRes, leadsRes, schedulesRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id, status, retainer_date, closed_date, created_at')
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('leads')
      .select('id, status, created_at, converted_at')
      .eq('workspace_id', ctx.workspaceId),
    supabase
      .from('payment_schedules')
      .select('id, status, amount_krw, paid_amount_krw, paid_date, due_date')
      .eq('workspace_id', ctx.workspaceId),
  ]);

  const cases = (casesRes.data ?? []) as Array<{
    id: string; status: string; retainer_date: string | null; closed_date: string | null; created_at: string;
  }>;
  const leads = (leadsRes.data ?? []) as Array<{
    id: string; status: string; created_at: string; converted_at: string | null;
  }>;
  const schedules = (schedulesRes.data ?? []) as Array<{
    id: string; status: string; amount_krw: number; paid_amount_krw: number; paid_date: string | null; due_date: string;
  }>;

  // 주차별 집계
  const weeklyStats = weekKeys.map((k) => {
    const start = parseISO(k);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const newLeads = leads.filter((l) => {
      const d = new Date(l.created_at);
      return d >= start && d < end;
    }).length;
    const converted = leads.filter((l) => {
      if (!l.converted_at) return false;
      const d = new Date(l.converted_at);
      return d >= start && d < end;
    }).length;
    const newCases = cases.filter((c) => {
      const d = c.retainer_date ?? c.created_at;
      if (!d) return false;
      const dd = new Date(d);
      return dd >= start && dd < end;
    }).length;
    const revenueIn = schedules.filter((s) => {
      if (!s.paid_date) return false;
      const d = new Date(s.paid_date);
      return d >= start && d < end;
    }).reduce((sum, s) => sum + s.paid_amount_krw, 0);
    return { week: format(start, 'MM/dd'), newLeads, converted, newCases, revenueIn };
  });

  // KPI
  const activeCases = cases.filter((c) => c.status === 'active').length;
  const thisMonthCases = cases.filter((c) => {
    const d = c.retainer_date ?? c.created_at;
    return d && new Date(d) >= monthStart;
  }).length;
  const thisMonthRevenue = schedules.filter((s) => s.paid_date && new Date(s.paid_date) >= monthStart).reduce((sum, s) => sum + s.paid_amount_krw, 0);
  const totalDue = schedules.reduce((sum, s) => sum + s.amount_krw, 0);
  const totalPaid = schedules.reduce((sum, s) => sum + s.paid_amount_krw, 0);
  const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
  const overdueSum = schedules
    .filter((s) => s.status === 'overdue')
    .reduce((sum, s) => sum + (s.amount_krw - s.paid_amount_krw), 0);

  const conversionRate =
    leads.length > 0 ? Math.round((leads.filter((l) => l.status === 'converted').length / leads.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <PendingConfirmsBanner items={pendingConfirms} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="활성 사건" value={`${activeCases}건`} sub={`이번달 신규 ${thisMonthCases}`} />
        <KPI label="이번달 수금" value={krw(thisMonthRevenue)} sub={`전체 수금률 ${collectionRate}%`} tone="emerald" />
        <KPI label="미수금" value={krw(overdueSum)} sub={`연체 ${schedules.filter((s) => s.status === 'overdue').length}건`} tone={overdueSum > 0 ? 'red' : 'emerald'} />
        <KPI label="Lead 전환율" value={`${conversionRate}%`} sub={`총 ${leads.length}건`} />
      </div>

      {/* 주차별 트렌드 차트 */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📊 주차별 트렌드 (최근 6주)</h2>
        <WeeklyChart stats={weeklyStats} />
      </section>

      {/* 월별 요약 */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📅 월별 요약 (최근 6개월)</h2>
        <MonthlyTable monthKeys={monthKeys} cases={cases} leads={leads} schedules={schedules} />
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">🔗 바로가기</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <QuickLink href="/workflow" label="🎯 워크플로우" hint="파이프라인 보드·개입" />
          <QuickLink href="/workbench" label="📋 업무" hint="내 할일 실행 큐" />
          <QuickLink href="/cases" label="📁 사건" hint="모든 사건 리스트" />
          <QuickLink href="/settings/team" label="👥 팀" hint="멤버·역할" />
        </div>
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">
        갱신: {format(now, 'yyyy-MM-dd HH:mm')}
      </p>
    </div>
  );
}

function WeeklyChart({
  stats,
}: {
  stats: Array<{ week: string; newLeads: number; converted: number; newCases: number; revenueIn: number }>;
}) {
  const max = Math.max(1, ...stats.map((s) => Math.max(s.newLeads, s.newCases)));
  const revMax = Math.max(1, ...stats.map((s) => s.revenueIn));
  return (
    <div>
      <div className="flex items-end gap-4 h-48 pt-2">
        {stats.map((s) => (
          <div key={s.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex-1 flex items-end gap-1 w-full justify-center">
              <div
                className="flex-1 max-w-[18px] bg-blue-500 rounded-t"
                style={{ height: `${(s.newLeads / max) * 100}%`, minHeight: s.newLeads > 0 ? '3px' : 0 }}
                title={`신규 리드: ${s.newLeads}`}
              />
              <div
                className="flex-1 max-w-[18px] bg-emerald-500 rounded-t"
                style={{ height: `${(s.newCases / max) * 100}%`, minHeight: s.newCases > 0 ? '3px' : 0 }}
                title={`수임: ${s.newCases}`}
              />
              <div
                className="flex-1 max-w-[18px] bg-amber-500 rounded-t"
                style={{ height: `${(s.revenueIn / revMax) * 100}%`, minHeight: s.revenueIn > 0 ? '3px' : 0 }}
                title={`수금: ${s.revenueIn.toLocaleString()}원`}
              />
            </div>
            <p className="text-[10px] text-zinc-500">{s.week}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[10px] text-zinc-500 mt-3">
        <Legend color="bg-blue-500" label="신규 Lead" />
        <Legend color="bg-emerald-500" label="수임 전환" />
        <Legend color="bg-amber-500" label="수금액" />
      </div>
    </div>
  );
}

function MonthlyTable({
  monthKeys,
  cases,
  leads,
  schedules,
}: {
  monthKeys: string[];
  cases: Array<{ retainer_date: string | null; closed_date: string | null; created_at: string }>;
  leads: Array<{ created_at: string; status: string; converted_at: string | null }>;
  schedules: Array<{ paid_date: string | null; paid_amount_krw: number }>;
}) {
  const rows = monthKeys.map((k) => {
    const newCases = cases.filter((c) => {
      const d = c.retainer_date ?? c.created_at;
      return d && format(parseISO(d), 'yyyy-MM') === k;
    }).length;
    const closedCases = cases.filter((c) => c.closed_date && format(parseISO(c.closed_date), 'yyyy-MM') === k).length;
    const newLeads = leads.filter((l) => format(parseISO(l.created_at), 'yyyy-MM') === k).length;
    const revenue = schedules
      .filter((s) => s.paid_date && format(parseISO(s.paid_date), 'yyyy-MM') === k)
      .reduce((sum, s) => sum + s.paid_amount_krw, 0);
    return { key: k, newCases, closedCases, newLeads, revenue };
  });

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
          <th className="py-1.5 pr-3">월</th>
          <th className="py-1.5 pr-3 text-right">신규 Lead</th>
          <th className="py-1.5 pr-3 text-right">수임</th>
          <th className="py-1.5 pr-3 text-right">종결</th>
          <th className="py-1.5 pr-3 text-right">수금액</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-zinc-100 dark:border-zinc-800">
            <td className="py-1.5 pr-3 font-medium">{r.key}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums">{r.newLeads}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums">{r.newCases}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums text-zinc-500">{r.closedCases}</td>
            <td className="py-1.5 pr-3 text-right tabular-nums">{krw(r.revenue)}원</td>
          </tr>
        ))}
      </tbody>
    </table>
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

function QuickLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link href={href} className="block p-3 rounded border border-zinc-200 dark:border-zinc-800 hover:shadow">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{hint}</div>
    </Link>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`w-3 h-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
