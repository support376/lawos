import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, format, startOfWeek, startOfMonth, subWeeks, subMonths, parseISO } from 'date-fns';
import type { Lead, LeadStatus, LeadSource } from '@/lib/ontology/core/objects';
import { LEAD_STATUS_LABEL, LEAD_SOURCE_LABEL } from '@/lib/ontology/core/objects';
import type { MyRoleContext, DomainKey } from '@/lib/auth/my-roles';

const LOST_REASON_LABEL: Record<string, string> = {
  fee_mismatch: '수임료 불일치',
  competitor: '타 사무소',
  cooled_off: '관심 식음',
  ineligible: '자격 미달',
  no_response: '연락 두절',
  other: '기타',
};

export async function ConsultantDashboard({
  ctx,
  domain,
  asUserId,
}: {
  ctx: MyRoleContext;
  domain: DomainKey;
  asUserId?: string;
}) {
  const supabase = await createClient();
  const targetUserId = asUserId ?? ctx.userId;

  let q = supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .eq('assigned_consultant_id', targetUserId)
    .limit(1000);
  if (domain !== '*') q = q.in('case_type_hint', [domain, 'undetermined']);

  const { data } = await q;
  const leads = (data ?? []) as Lead[];

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

  // KPI
  const totalActive = leads.filter((l) => l.status !== 'converted' && l.status !== 'lost').length;
  const thisWeekNew = leads.filter((l) => new Date(l.created_at) >= weekStart).length;
  const lastWeekNew = leads.filter((l) => {
    const d = new Date(l.created_at);
    return d >= lastWeekStart && d < weekStart;
  }).length;
  const thisMonthConverted = leads.filter(
    (l) => l.status === 'converted' && l.converted_at && new Date(l.converted_at) >= monthStart,
  ).length;
  const thisMonthLost = leads.filter(
    (l) => l.status === 'lost' && new Date(l.updated_at) >= monthStart,
  ).length;
  const convRate =
    leads.length > 0
      ? Math.round((leads.filter((l) => l.status === 'converted').length / leads.length) * 100)
      : 0;

  // 오늘 할일
  const noContact = leads.filter((l) => l.status === 'new' && !l.last_contact_at);
  const coldLeads = leads.filter((l) => {
    if (l.status === 'converted' || l.status === 'lost') return false;
    if (!l.last_contact_at) return false;
    return differenceInCalendarDays(now, new Date(l.last_contact_at)) > 14;
  });
  const qualifiedWaiting = leads.filter((l) => l.status === 'qualified');

  // 상태 분포
  const byStatus: Record<LeadStatus, number> = {
    new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, cold: 0,
  };
  leads.forEach((l) => byStatus[l.status]++);

  // 주별 트렌드 (6주)
  const weekKeys: string[] = [];
  for (let i = 5; i >= 0; i--) weekKeys.push(format(startOfWeek(subWeeks(now, i), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const weeklyStats = weekKeys.map((k) => {
    const start = parseISO(k);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    const newCount = leads.filter((l) => {
      const d = new Date(l.created_at);
      return d >= start && d < end;
    }).length;
    const converted = leads.filter((l) => {
      if (!l.converted_at) return false;
      const d = new Date(l.converted_at);
      return d >= start && d < end;
    }).length;
    const lost = leads.filter((l) => {
      if (l.status !== 'lost') return false;
      const d = new Date(l.updated_at);
      return d >= start && d < end;
    }).length;
    return { week: format(start, 'MM/dd'), newCount, converted, lost };
  });

  // 월별 집계 (6개월)
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) monthKeys.push(format(startOfMonth(subMonths(now, i)), 'yyyy-MM'));
  const monthlyStats = monthKeys.map((k) => {
    const newCount = leads.filter((l) => format(parseISO(l.created_at), 'yyyy-MM') === k).length;
    const converted = leads.filter((l) => l.converted_at && format(parseISO(l.converted_at), 'yyyy-MM') === k).length;
    const lost = leads.filter((l) => l.status === 'lost' && format(parseISO(l.updated_at), 'yyyy-MM') === k).length;
    return { month: k, newCount, converted, lost };
  });

  // 이탈 사유
  const lostReasons = new Map<string, number>();
  leads.filter((l) => l.status === 'lost').forEach((l) => {
    const r = l.lost_reason ?? 'other';
    lostReasons.set(r, (lostReasons.get(r) ?? 0) + 1);
  });
  const totalLost = Array.from(lostReasons.values()).reduce((a, b) => a + b, 0);

  // 유입 채널
  const sourceStats = new Map<string, { total: number; converted: number; lost: number }>();
  leads.forEach((l) => {
    const s = l.source ?? 'other';
    const cur = sourceStats.get(s) ?? { total: 0, converted: 0, lost: 0 };
    cur.total++;
    if (l.status === 'converted') cur.converted++;
    if (l.status === 'lost') cur.lost++;
    sourceStats.set(s, cur);
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="진행중 리드" value={`${totalActive}건`} sub={`전체 ${leads.length}건`} />
        <KPI label="이번주 신규" value={`${thisWeekNew}건`} sub={`전주 ${lastWeekNew}건`} tone={thisWeekNew >= lastWeekNew ? 'emerald' : 'red'} />
        <KPI label="이번달 수임" value={`${thisMonthConverted}건`} sub="전환 확정" tone="emerald" />
        <KPI label="이번달 이탈" value={`${thisMonthLost}건`} sub="드롭 처리" tone={thisMonthLost > 0 ? 'red' : 'zinc'} />
        <KPI label="누적 전환율" value={`${convRate}%`} sub={`${leads.length}건 기준`} />
      </div>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📈 주별 트렌드 (6주)</h2>
        <WeeklyChart stats={weeklyStats} />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">📅 월별 수임/이탈 (6개월)</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">월</th>
                <th className="py-1.5 pr-3 text-right">신규</th>
                <th className="py-1.5 pr-3 text-right">수임</th>
                <th className="py-1.5 pr-3 text-right">이탈</th>
                <th className="py-1.5 pr-3 text-right">전환율</th>
              </tr>
            </thead>
            <tbody>
              {monthlyStats.map((m) => {
                const rate = m.newCount > 0 ? Math.round((m.converted / m.newCount) * 100) : 0;
                return (
                  <tr key={m.month} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3">{m.month}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.newCount}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">{m.converted}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{m.lost}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">❌ 이탈 사유 (전체 {totalLost}건)</h2>
          {totalLost === 0 ? (
            <p className="text-xs text-zinc-500">이탈 없음</p>
          ) : (
            <div className="space-y-2">
              {Array.from(lostReasons.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => {
                  const pct = (count / totalLost) * 100;
                  return (
                    <div key={reason}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{LOST_REASON_LABEL[reason] ?? reason}</span>
                        <span className="tabular-nums">{count}건 ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      </div>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📣 유입 채널 × 전환율</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-3">채널</th>
              <th className="py-1.5 pr-3 text-right">총 리드</th>
              <th className="py-1.5 pr-3 text-right">수임</th>
              <th className="py-1.5 pr-3 text-right">이탈</th>
              <th className="py-1.5 pr-3 text-right">전환율</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(sourceStats.entries())
              .sort((a, b) => b[1].total - a[1].total)
              .map(([s, st]) => {
                const rate = st.total > 0 ? Math.round((st.converted / st.total) * 100) : 0;
                return (
                  <tr key={s} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3">{LEAD_SOURCE_LABEL[s as LeadSource] ?? s}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{st.total}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">{st.converted}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{st.lost}</td>
                    <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${rate >= 30 ? 'text-emerald-600' : rate >= 10 ? 'text-amber-600' : 'text-red-600'}`}>{rate}%</td>
                  </tr>
                );
              })}
            {sourceStats.size === 0 && <tr><td colSpan={5} className="py-3 text-center text-zinc-500">데이터 없음</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">🎯 오늘 할 일</h2>
        <div className="space-y-3">
          <ActionGroup title="미접촉 신규 리드" count={noContact.length} leads={noContact} tone="red" emptyMsg="없음" subLabel="첫 통화 대기" />
          <ActionGroup title="콜드 (14일+ 무접촉)" count={coldLeads.length} leads={coldLeads} tone="amber" emptyMsg="정상" subLabel="재연락" />
          <ActionGroup title="적격 확인 (수임 대기)" count={qualifiedWaiting.length} leads={qualifiedWaiting} tone="emerald" emptyMsg="없음" subLabel="수임확정/드롭" />
        </div>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📊 내 리드 상태 분포</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {(Object.keys(byStatus) as LeadStatus[]).map((s) => (
            <div key={s} className={`text-center p-2 rounded ${s === 'converted' ? 'bg-emerald-100 dark:bg-emerald-950/30' : s === 'lost' ? 'bg-red-50 dark:bg-red-950/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
              <div className="text-[10px] text-zinc-500">{LEAD_STATUS_LABEL[s]}</div>
              <div className="text-lg font-semibold tabular-nums">{byStatus[s]}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">갱신: {format(now, 'yyyy-MM-dd HH:mm')}</p>
    </div>
  );
}

function WeeklyChart({ stats }: { stats: Array<{ week: string; newCount: number; converted: number; lost: number }> }) {
  const max = Math.max(1, ...stats.map((s) => s.newCount));
  return (
    <div>
      <div className="flex items-end gap-3 h-48">
        {stats.map((s) => (
          <div key={s.week} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex-1 flex items-end gap-1 w-full justify-center">
              <div className="flex-1 max-w-[20px] bg-blue-500 rounded-t" style={{ height: `${(s.newCount / max) * 100}%`, minHeight: s.newCount > 0 ? '3px' : 0 }} title={`신규: ${s.newCount}`} />
              <div className="flex-1 max-w-[20px] bg-emerald-500 rounded-t" style={{ height: `${(s.converted / max) * 100}%`, minHeight: s.converted > 0 ? '3px' : 0 }} title={`수임: ${s.converted}`} />
              <div className="flex-1 max-w-[20px] bg-red-500 rounded-t" style={{ height: `${(s.lost / max) * 100}%`, minHeight: s.lost > 0 ? '3px' : 0 }} title={`이탈: ${s.lost}`} />
            </div>
            <p className="text-[10px] text-zinc-500">{s.week}</p>
            <p className="text-[9px] text-zinc-400 tabular-nums">
              <span className="text-blue-600">{s.newCount}</span>/<span className="text-emerald-600">{s.converted}</span>/<span className="text-red-600">{s.lost}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[10px] text-zinc-500 mt-3">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-sm" /> 신규</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded-sm" /> 수임</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded-sm" /> 이탈</span>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'emerald' | 'red' | 'amber' | 'zinc' }) {
  const c = tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-zinc-500';
  return (
    <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{value}</div>
      <div className={`text-[10px] mt-0.5 ${c}`}>{sub}</div>
    </div>
  );
}

function ActionGroup({
  title, count, leads, tone, emptyMsg, subLabel,
}: {
  title: string; count: number; leads: Lead[]; tone: 'red' | 'amber' | 'emerald'; emptyMsg: string; subLabel: string;
}) {
  const bg = tone === 'red' ? 'bg-red-50 dark:bg-red-950/20' : tone === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-emerald-50 dark:bg-emerald-950/20';
  const text = tone === 'red' ? 'text-red-700 dark:text-red-400' : tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400';
  return (
    <div className={`p-3 rounded ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${text}`}>{title}</span>
          <span className="text-[10px] text-zinc-500">({subLabel})</span>
        </div>
        <span className={`text-lg font-bold tabular-nums ${text}`}>{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-zinc-500">{emptyMsg}</p>
      ) : (
        <div className="space-y-1">
          {leads.slice(0, 6).map((l) => (
            <Link key={l.id} href={`/workflow?view=consultant&domain=${l.case_type_hint}`} className="block text-xs p-1.5 bg-white dark:bg-zinc-900 rounded hover:shadow">
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-medium truncate">{l.name}</span>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {l.contact ?? '—'}{l.last_contact_at && ` · ${format(new Date(l.last_contact_at), 'MM-dd')}`}
                </span>
              </div>
            </Link>
          ))}
          {leads.length > 6 && <div className="text-[10px] text-zinc-500 text-center pt-1">... 외 {leads.length - 6}건</div>}
        </div>
      )}
    </div>
  );
}
