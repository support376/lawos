import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, format } from 'date-fns';
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

  const [casesRes, historyRes, actionsRes, holdsRes] = await Promise.all([
    supabase
      .from('cases')
      .select(`
        id, title, case_type, status, assigned_to, retainer_date, created_at,
        client:clients(id, name),
        rehab_case_details(current_stage_key)
      `)
      .eq('status', 'active')
      .eq('assigned_to', targetUserId),
    supabase
      .from('rehab_stage_history')
      .select('case_id, stage_key, entry_date')
      .eq('workspace_id', ctx.workspaceId)
      .is('exit_date', null),
    supabase
      .from('actions')
      .select('id, title, status, assigned_to, due_date, subject_id, action_type, team_role')
      .eq('workspace_id', ctx.workspaceId)
      .eq('assigned_to', targetUserId)
      .in('status', ['pending', 'doing', 'blocked']),
    supabase
      .from('case_financial_holds')
      .select('case_id, reason')
      .eq('workspace_id', ctx.workspaceId)
      .eq('active', true),
  ]);

  const cases = ((casesRes.data ?? []) as unknown as Array<{
    id: string; title: string; case_type: string | null; status: string; assigned_to: string | null;
    retainer_date: string | null; created_at: string;
    client: { id: string; name: string } | null;
    rehab_case_details: Array<{ current_stage_key: string | null }> | null;
  }>);

  const history = (historyRes.data ?? []) as Array<{ case_id: string; stage_key: string; entry_date: string }>;
  const actions = (actionsRes.data ?? []) as Array<{
    id: string; title: string; status: string; due_date: string | null; subject_id: string; action_type: string; team_role: string | null;
  }>;
  const holds = (holdsRes.data ?? []) as Array<{ case_id: string; reason: string }>;
  const holdMap = new Map(holds.map((h) => [h.case_id, h.reason]));
  const historyMap = new Map(history.map((h) => [h.case_id, h]));

  const now = new Date();
  const longStay = cases.filter((c) => {
    const h = historyMap.get(c.id);
    if (!h) return false;
    const meta = STAGES[h.stage_key as StageKey];
    if (!meta?.typical_duration_days) return false;
    return differenceInCalendarDays(now, new Date(h.entry_date)) > meta.typical_duration_days;
  });
  const correctionLoop = cases.filter(
    (c) => (c.rehab_case_details?.[0]?.current_stage_key as StageKey) === 'correction_loop',
  );
  const heldByFinance = cases.filter((c) => holdMap.has(c.id));

  const overdueActions = actions.filter(
    (a) => a.due_date && differenceInCalendarDays(new Date(a.due_date), now) < 0,
  );
  const todayActions = actions.filter(
    (a) => a.due_date && differenceInCalendarDays(new Date(a.due_date), now) === 0,
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="담당 활성 사건" value={`${cases.length}건`} sub={`Hold ${heldByFinance.length}건`} tone={heldByFinance.length > 0 ? 'red' : 'zinc'} />
        <KPI label="내 Action" value={`${actions.length}개`} sub={`지연 ${overdueActions.length} · 오늘 ${todayActions.length}`} tone={overdueActions.length > 0 ? 'red' : 'zinc'} />
        <KPI label="보정 진행" value={`${correctionLoop.length}건`} sub="법원 피드백 대응 중" />
        <KPI label="장기 체류" value={`${longStay.length}건`} sub="평균 초과" tone={longStay.length > 0 ? 'amber' : 'zinc'} />
      </div>

      {/* 오늘/지연 Action */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">🎯 내 Action</h2>
        {actions.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">진행 중 Action 없음</p>
        ) : (
          <div className="space-y-1">
            {[...overdueActions, ...todayActions, ...actions.filter((a) => !overdueActions.includes(a) && !todayActions.includes(a))]
              .slice(0, 10)
              .map((a) => {
                const d = a.due_date ? differenceInCalendarDays(new Date(a.due_date), now) : null;
                const tone = d !== null && d < 0 ? 'text-red-600' : d === 0 ? 'text-amber-600' : '';
                return (
                  <Link
                    key={a.id}
                    href={`/workflow?case=${a.subject_id}`}
                    className="flex justify-between items-center text-xs p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
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
          <Group
            title="🛑 Finance Hold"
            cases={heldByFinance.map((c) => ({ id: c.id, name: c.client?.name ?? '—', note: holdMap.get(c.id) ?? '' }))}
            tone="red"
          />
          <Group
            title="⚠ 장기체류"
            cases={longStay.map((c) => {
              const h = historyMap.get(c.id);
              const days = h ? differenceInCalendarDays(now, new Date(h.entry_date)) : 0;
              const stageLabel = h ? STAGES[h.stage_key as StageKey]?.label ?? h.stage_key : '—';
              return { id: c.id, name: c.client?.name ?? '—', note: `${stageLabel} · ${days}일차` };
            })}
            tone="amber"
          />
          <Group
            title="보정 루프"
            cases={correctionLoop.map((c) => ({ id: c.id, name: c.client?.name ?? '—', note: '법원 보정 대응 필요' }))}
            tone="zinc"
          />
        </div>
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">
        갱신: {format(now, 'yyyy-MM-dd HH:mm')}
      </p>
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

function Group({
  title,
  cases,
  tone,
}: {
  title: string;
  cases: Array<{ id: string; name: string; note: string }>;
  tone: 'red' | 'amber' | 'zinc';
}) {
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
