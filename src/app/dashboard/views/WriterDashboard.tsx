import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, format, startOfMonth, subMonths, parseISO } from 'date-fns';
import type { MyRoleContext, DomainKey } from '@/lib/auth/my-roles';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';

export async function WriterDashboard({
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
  const now = new Date();
  const monthStart = startOfMonth(now);

  const [casesRes, historyRes, actionsRes, holdsRes] = await Promise.all([
    supabase
      .from('cases')
      .select(`
        id, title, case_type, status, assigned_to, retainer_date, closed_date, created_at,
        client:clients(id, name),
        rehab_case_details(current_stage_key)
      `)
      .eq('assigned_to', targetUserId),
    supabase
      .from('rehab_stage_history')
      .select('case_id, stage_key, entry_date, exit_date')
      .eq('workspace_id', ctx.workspaceId)
      .order('entry_date', { ascending: true }),
    supabase
      .from('actions')
      .select('id, title, status, assigned_to, due_date, subject_id, action_type, team_role, completed_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('assigned_to', targetUserId),
    supabase
      .from('case_financial_holds')
      .select('case_id, reason')
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true),
  ]);

  const cases = ((casesRes.data ?? []) as unknown as Array<{
    id: string; title: string; case_type: string | null; status: string; assigned_to: string | null;
    retainer_date: string | null; closed_date: string | null; created_at: string;
    client: { id: string; name: string } | null;
    rehab_case_details: Array<{ current_stage_key: string | null }> | null;
  }>);
  const activeCases = cases.filter((c) => c.status === 'active');

  const history = (historyRes.data ?? []) as Array<{ case_id: string; stage_key: string; entry_date: string; exit_date: string | null }>;
  const actions = (actionsRes.data ?? []) as Array<{
    id: string; title: string; status: string; due_date: string | null; subject_id: string; action_type: string; team_role: string | null; completed_at: string | null;
  }>;
  const holds = (holdsRes.data ?? []) as Array<{ case_id: string; reason: string }>;
  const holdMap = new Map(holds.map((h) => [h.case_id, h.reason]));

  // 내 사건의 현재 stage_history (exit_date IS NULL)
  const myCaseIds = new Set(activeCases.map((c) => c.id));
  const currentHistory = history.filter((h) => !h.exit_date && myCaseIds.has(h.case_id));
  const currentHistMap = new Map(currentHistory.map((h) => [h.case_id, h]));

  // ============ KPI ============
  const longStay = activeCases.filter((c) => {
    const h = currentHistMap.get(c.id);
    if (!h) return false;
    const meta = STAGES[h.stage_key as StageKey];
    if (!meta?.typical_duration_days) return false;
    return differenceInCalendarDays(now, new Date(h.entry_date)) > meta.typical_duration_days;
  });
  const correctionLoop = activeCases.filter(
    (c) => (c.rehab_case_details?.[0]?.current_stage_key as StageKey) === 'correction_loop',
  );
  const heldByFinance = activeCases.filter((c) => holdMap.has(c.id));

  const activeActions = actions.filter((a) => ['pending', 'doing', 'blocked'].includes(a.status));
  const overdueActions = activeActions.filter((a) => a.due_date && differenceInCalendarDays(new Date(a.due_date), now) < 0);
  const todayActions = activeActions.filter((a) => a.due_date && differenceInCalendarDays(new Date(a.due_date), now) === 0);

  // ============ 이번달 처리량 ============
  // 내 사건에서 이번달에 발생한 Stage 전이 수 (exit_date 기준)
  const myCaseIdsAll = new Set(cases.map((c) => c.id));
  const thisMonthTransitions = history.filter(
    (h) => h.exit_date && myCaseIdsAll.has(h.case_id) && new Date(h.exit_date) >= monthStart,
  ).length;
  const thisMonthCompleted = cases.filter(
    (c) => c.closed_date && new Date(c.closed_date) >= monthStart,
  ).length;
  const thisMonthCompletedActions = actions.filter(
    (a) => a.status === 'done' && a.completed_at && new Date(a.completed_at) >= monthStart,
  ).length;

  // ============ Stage별 평균 체류일 (내 현재 사건) ============
  const stageStayMap = new Map<string, { count: number; totalDays: number }>();
  for (const c of activeCases) {
    const h = currentHistMap.get(c.id);
    if (!h) continue;
    const days = differenceInCalendarDays(now, new Date(h.entry_date));
    const cur = stageStayMap.get(h.stage_key) ?? { count: 0, totalDays: 0 };
    cur.count++;
    cur.totalDays += days;
    stageStayMap.set(h.stage_key, cur);
  }

  // ============ 월별 처리량 (6개월) ============
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) monthKeys.push(format(startOfMonth(subMonths(now, i)), 'yyyy-MM'));
  const monthlyStats = monthKeys.map((k) => {
    const transitions = history.filter(
      (h) => h.exit_date && myCaseIdsAll.has(h.case_id) && format(parseISO(h.exit_date), 'yyyy-MM') === k,
    ).length;
    const completed = cases.filter(
      (c) => c.closed_date && format(parseISO(c.closed_date), 'yyyy-MM') === k,
    ).length;
    const newCases = cases.filter((c) => {
      const d = c.retainer_date ?? c.created_at;
      return d && format(parseISO(d), 'yyyy-MM') === k;
    }).length;
    const doneActions = actions.filter(
      (a) => a.completed_at && format(parseISO(a.completed_at), 'yyyy-MM') === k,
    ).length;
    return { month: k, transitions, completed, newCases, doneActions };
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="담당 활성 사건" value={`${activeCases.length}건`} sub={`Hold ${heldByFinance.length}`} tone={heldByFinance.length > 0 ? 'red' : 'zinc'} />
        <KPI label="내 Action" value={`${activeActions.length}개`} sub={`지연 ${overdueActions.length} · 오늘 ${todayActions.length}`} tone={overdueActions.length > 0 ? 'red' : 'zinc'} />
        <KPI label="이번달 Stage 전이" value={`${thisMonthTransitions}회`} sub="내 사건 진전" tone="emerald" />
        <KPI label="이번달 완료 사건" value={`${thisMonthCompleted}건`} sub="면책·종결" tone="emerald" />
        <KPI label="장기 체류" value={`${longStay.length}건`} sub="평균 초과" tone={longStay.length > 0 ? 'amber' : 'zinc'} />
      </div>

      {/* 월별 처리량 + Stage 체류 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">📅 월별 처리량 (6개월)</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">월</th>
                <th className="py-1.5 pr-3 text-right">신규</th>
                <th className="py-1.5 pr-3 text-right">Stage 전이</th>
                <th className="py-1.5 pr-3 text-right">Action 완료</th>
                <th className="py-1.5 pr-3 text-right">사건 종결</th>
              </tr>
            </thead>
            <tbody>
              {monthlyStats.map((m) => (
                <tr key={m.month} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-3">{m.month}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{m.newCases}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{m.transitions}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{m.doneActions}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-emerald-600">{m.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3">⏱ Stage별 내 사건 체류</h2>
          {stageStayMap.size === 0 ? (
            <p className="text-xs text-zinc-500">담당 활성 사건 없음</p>
          ) : (
            <div className="space-y-2">
              {Array.from(stageStayMap.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .map(([stage, d]) => {
                  const meta = STAGES[stage as StageKey];
                  const avg = Math.round(d.totalDays / d.count);
                  const typical = meta?.typical_duration_days ?? 0;
                  const overLimit = typical > 0 && avg > typical;
                  return (
                    <div key={stage} className="flex items-center gap-2">
                      <span className="text-xs w-24 shrink-0 truncate">{meta?.label ?? stage}</span>
                      <div className="flex-1 h-5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden relative">
                        <div
                          className={`h-full ${overLimit ? 'bg-red-400' : 'bg-blue-400'}`}
                          style={{ width: `${typical > 0 ? Math.min(100, (avg / typical) * 100) : 30}%` }}
                        />
                        {typical > 0 && (
                          <div className="absolute top-0 bottom-0 w-px bg-zinc-500" style={{ left: '100%' }} />
                        )}
                      </div>
                      <span className={`text-xs tabular-nums ${overLimit ? 'text-red-600' : ''}`}>
                        {d.count}건 · 평균 {avg}일{typical > 0 && ` / 기준 ${typical}`}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      </div>

      {/* 내 Action */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">🎯 내 Action</h2>
        {activeActions.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">진행 중 Action 없음</p>
        ) : (
          <div className="space-y-1">
            {[...overdueActions, ...todayActions, ...activeActions.filter((a) => !overdueActions.includes(a) && !todayActions.includes(a))]
              .slice(0, 10)
              .map((a) => {
                const d = a.due_date ? differenceInCalendarDays(new Date(a.due_date), now) : null;
                const tone = d !== null && d < 0 ? 'text-red-600' : d === 0 ? 'text-amber-600' : '';
                return (
                  <Link key={a.id} href={`/workflow?case=${a.subject_id}`} className="flex justify-between items-center text-xs p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <span className="truncate flex-1">{a.title}</span>
                    <span className={`text-[10px] shrink-0 ml-2 ${tone}`}>
                      {a.due_date ? `${a.due_date} (D${d !== null && d < 0 ? d : d !== null && d > 0 ? '+' + d : '0'})` : '마감 없음'}
                    </span>
                  </Link>
                );
              })}
          </div>
        )}
      </section>

      {/* 주의 사건 */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">⚠ 주의 사건</h2>
        <div className="space-y-3">
          <Group title="🛑 Finance Hold" cases={heldByFinance.map((c) => ({ id: c.id, name: c.client?.name ?? '—', note: holdMap.get(c.id) ?? '' }))} tone="red" />
          <Group title="⚠ 장기체류" cases={longStay.map((c) => {
            const h = currentHistMap.get(c.id);
            const days = h ? differenceInCalendarDays(now, new Date(h.entry_date)) : 0;
            const stageLabel = h ? STAGES[h.stage_key as StageKey]?.label ?? h.stage_key : '—';
            return { id: c.id, name: c.client?.name ?? '—', note: `${stageLabel} · ${days}일차` };
          })} tone="amber" />
          <Group title="보정 루프" cases={correctionLoop.map((c) => ({ id: c.id, name: c.client?.name ?? '—', note: '법원 보정 대응 필요' }))} tone="zinc" />
        </div>
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">갱신: {format(now, 'yyyy-MM-dd HH:mm')} · 이번달 Action 완료 {thisMonthCompletedActions}건</p>
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

function Group({ title, cases, tone }: { title: string; cases: Array<{ id: string; name: string; note: string }>; tone: 'red' | 'amber' | 'zinc' }) {
  if (cases.length === 0) return null;
  const bg = tone === 'red' ? 'bg-red-50 dark:bg-red-950/20' : tone === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-zinc-50 dark:bg-zinc-800/30';
  return (
    <div className={`p-3 rounded ${bg}`}>
      <div className="text-xs font-semibold mb-1.5">{title} ({cases.length})</div>
      <div className="space-y-1">
        {cases.slice(0, 5).map((c) => (
          <Link key={c.id} href={`/workflow?case=${c.id}`} className="block text-xs p-1.5 bg-white dark:bg-zinc-900 rounded hover:shadow">
            <div className="flex justify-between gap-2">
              <span className="font-medium truncate">{c.name}</span>
              <span className="text-[10px] text-zinc-500 shrink-0 truncate">{c.note}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
