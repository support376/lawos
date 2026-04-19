import Link from 'next/link';
import { redirect } from 'next/navigation';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { getMyRoleContext, type PipelineView, type DomainKey } from '@/lib/auth/my-roles';
import { ACTION_STATUS_LABEL, PAYMENT_KIND_LABEL } from '@/lib/ontology/core/objects';
import { getActionSpec } from '@/lib/ontology/core/action-registry';
import type { ActionRecord, Lead, PaymentSchedule } from '@/lib/ontology/core/objects';
import { WorkbenchActionItem } from './WorkbenchActionItem';

function krw(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export default async function WorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; as_domain?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ctx = await getMyRoleContext();
  if (!ctx) redirect('/login');

  // 시뮬 적용
  const simView = (params.as as PipelineView | undefined) ?? null;
  const simDomain = (params.as_domain as DomainKey | undefined) ?? null;
  const view = ctx.isManagingPartner && simView ? simView : ctx.entries[0]?.role === 'consultant' ? 'consultant' : ctx.entries[0]?.role === 'billing_staff' ? 'billing' : ctx.isManagingPartner ? 'partner' : 'writer';
  const domain = ctx.isManagingPartner && simDomain ? simDomain : ctx.entries[0]?.domain ?? '*';
  const asSelfOnly = !ctx.isManagingPartner;

  const now = new Date();

  // 공통: 내 할당 Action
  let actionsQ = supabase
    .from('actions')
    .select(`
      *,
      case:cases!actions_subject_id_fkey(id, title, client:clients(name))
    `)
    .eq('workspace_id', ctx.workspaceId)
    .in('status', ['pending', 'doing', 'blocked']);
  if (asSelfOnly) actionsQ = actionsQ.eq('assigned_to', ctx.userId);

  const { data: actionsData } = await actionsQ;
  const actions = ((actionsData ?? []) as unknown as Array<ActionRecord & { case?: { id: string; title: string; client: { name: string } | null } | null }>);

  // 정렬: 지연 > 오늘 마감 > 미래
  const sorted = actions.slice().sort((a, b) => {
    const aD = a.due_date ? differenceInCalendarDays(parseISO(a.due_date), now) : 999;
    const bD = b.due_date ? differenceInCalendarDays(parseISO(b.due_date), now) : 999;
    return aD - bD;
  });

  const overdue = sorted.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), now) < 0);
  const today = sorted.filter((a) => a.due_date && differenceInCalendarDays(parseISO(a.due_date), now) === 0);
  const thisWeek = sorted.filter((a) => {
    if (!a.due_date) return false;
    const d = differenceInCalendarDays(parseISO(a.due_date), now);
    return d > 0 && d <= 7;
  });
  const noDue = sorted.filter((a) => !a.due_date);

  // 역할별 추가 큐
  const roleSpecific = await loadRoleSpecific(view, domain, ctx, supabase, asSelfOnly);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader
        active="workbench"
        simulatedView={view}
        simulatedDomain={domain as DomainKey}
      />
      <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">📋 내 업무 큐</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {roleLabel(view, domain as DomainKey)} · {format(now, 'yyyy년 M월 d일')}
            {ctx.isManagingPartner && simView && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 text-xs">🧪 시뮬</span>
            )}
          </p>
        </div>

        {/* 역할별 특화 큐 */}
        {roleSpecific && <RoleSpecificSection view={view} data={roleSpecific} />}

        {/* 공통: Action 큐 */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">🎯 Action 큐</h2>
          {sorted.length === 0 ? (
            <p className="text-xs text-zinc-500 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-center">
              진행 중 Action 없음
            </p>
          ) : (
            <>
              {overdue.length > 0 && (
                <ActionGroup title="⚠ 지연" actions={overdue} tone="red" />
              )}
              {today.length > 0 && (
                <ActionGroup title="📌 오늘 마감" actions={today} tone="amber" />
              )}
              {thisWeek.length > 0 && (
                <ActionGroup title="📅 이번주" actions={thisWeek} tone="zinc" />
              )}
              {noDue.length > 0 && (
                <ActionGroup title="· 마감 없음" actions={noDue} tone="zinc" />
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function ActionGroup({
  title,
  actions,
  tone,
}: {
  title: string;
  actions: Array<ActionRecord & { case?: { id: string; title: string; client: { name: string } | null } | null }>;
  tone: 'red' | 'amber' | 'zinc';
}) {
  const bg = tone === 'red' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' :
             tone === 'amber' ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50' :
             'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800';
  return (
    <section className={`rounded-lg border p-3 ${bg}`}>
      <div className="text-xs font-semibold mb-2">{title} ({actions.length})</div>
      <div className="space-y-1">
        {actions.map((a) => (
          <WorkbenchActionItem
            key={a.id}
            action={a}
            caseClientName={a.case?.client?.name ?? null}
            caseTitle={a.case?.title ?? null}
          />
        ))}
      </div>
    </section>
  );
}

async function loadRoleSpecific(
  view: PipelineView,
  domain: DomainKey,
  ctx: { workspaceId: string; userId: string; isManagingPartner: boolean },
  supabase: Awaited<ReturnType<typeof createClient>>,
  asSelfOnly: boolean,
) {
  if (view === 'consultant') {
    let q = supabase
      .from('leads')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .in('status', ['new', 'contacted'])
      .order('created_at', { ascending: true });
    if (asSelfOnly) q = q.eq('assigned_consultant_id', ctx.userId);
    if (domain !== '*') q = q.in('case_type_hint', [domain, 'undetermined']);
    const { data } = await q;
    return { type: 'consultant' as const, leads: (data ?? []) as Lead[] };
  }
  if (view === 'billing') {
    const { data } = await supabase
      .from('payment_schedules')
      .select(`
        *,
        case:cases(id, client:clients(name))
      `)
      .eq('workspace_id', ctx.workspaceId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true });
    return { type: 'billing' as const, overdue: (data ?? []) as Array<PaymentSchedule & { case: { id: string; client: { name: string } | null } | null }> };
  }
  return null;
}

function RoleSpecificSection({
  view,
  data,
}: {
  view: PipelineView;
  data: NonNullable<Awaited<ReturnType<typeof loadRoleSpecific>>>;
}) {
  if (data.type === 'consultant') {
    return (
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📞 상담 대기 Lead ({data.leads.length})</h2>
        {data.leads.length === 0 ? (
          <p className="text-xs text-zinc-500">없음</p>
        ) : (
          <div className="space-y-1">
            {data.leads.slice(0, 15).map((l) => (
              <Link
                key={l.id}
                href={`/workflow?view=consultant&domain=${l.case_type_hint}`}
                className="flex items-center justify-between p-2 rounded text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${l.status === 'new' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <span className="font-medium truncate">{l.name}</span>
                  <span className="text-zinc-500 truncate">{l.contact ?? ''}</span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                  {l.status === 'new' ? '신규' : '상담중'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }
  if (data.type === 'billing') {
    return (
      <section className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3 text-red-700 dark:text-red-400">💰 연체 회차 ({data.overdue.length})</h2>
        {data.overdue.length === 0 ? (
          <p className="text-xs text-zinc-500">없음</p>
        ) : (
          <div className="space-y-1">
            {data.overdue.slice(0, 15).map((s) => {
              const days = differenceInCalendarDays(new Date(), new Date(s.due_date));
              return (
                <Link
                  key={s.id}
                  href={`/workflow?case=${s.case_id}`}
                  className="flex items-center justify-between p-2 rounded text-xs bg-white dark:bg-zinc-900 hover:shadow"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{s.case?.client?.name ?? '—'}</span>
                    <span className="text-zinc-500">
                      {s.installment_no}회차 · {PAYMENT_KIND_LABEL[s.kind]}
                    </span>
                  </div>
                  <span className="text-red-600 tabular-nums shrink-0 ml-2">
                    D+{days} · {krw(s.amount_krw - s.paid_amount_krw)}원
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    );
  }
  return null;
}

function roleLabel(view: PipelineView, domain: DomainKey): string {
  const dl: Record<DomainKey, string> = {
    '*': '전사',
    personal_rehab: '개인회생',
    divorce: '이혼',
    criminal: '형사',
    other: '기타',
  };
  if (view === 'partner') return '대표·관리자';
  if (view === 'consultant') return `상담 · ${dl[domain]}`;
  if (view === 'writer') return `작성 · ${dl[domain]}`;
  if (view === 'billing') return '재무';
  return '업무';
}

void ACTION_STATUS_LABEL;
void getActionSpec;
