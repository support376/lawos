import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { NewCaseButton } from '@/components/NewCaseButton';
import type { Client } from '@/lib/types';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    clientsCountRes,
    casesRes,
    ticketsRes,
    membersRes,
    recentEventsRes,
    invitesCountRes,
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase
      .from('cases')
      .select('id, status, retainer_date, closed_date, created_at, assigned_to, case_type'),
    supabase
      .from('tickets')
      .select('id, column_key, due_date, priority, type, title, ai_suggested, waiting_on')
      .neq('column_key', 'done'),
    supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('id, raw_content, source_type, occurred_at, created_at')
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('workspace_invites')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null),
  ]);

  const clientCount = clientsCountRes.count ?? 0;
  const { data: clientsData } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  const allClients = (clientsData ?? []) as Client[];
  const memberCount = membersRes.count ?? 0;
  const pendingInvites = invitesCountRes.count ?? 0;
  const cases = casesRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const recentEvents = recentEventsRes.data ?? [];

  const activeCases = cases.filter((c) => c.status === 'active').length;
  const closedCases = cases.filter((c) => c.status !== 'active').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withDue = tickets.filter((t) => t.due_date);
  const overdue = withDue.filter(
    (t) => differenceInCalendarDays(parseISO(t.due_date!), today) < 0,
  ).length;
  const dueToday = withDue.filter(
    (t) => differenceInCalendarDays(parseISO(t.due_date!), today) === 0,
  ).length;
  const dueTomorrow = withDue.filter(
    (t) => differenceInCalendarDays(parseISO(t.due_date!), today) === 1,
  ).length;
  const dueThisWeek = withDue.filter((t) => {
    const d = differenceInCalendarDays(parseISO(t.due_date!), today);
    return d >= 2 && d <= 7;
  }).length;
  const triageCount = tickets.filter((t) => t.column_key === 'triage').length;
  const waitingCount = tickets.filter((t) => !!t.waiting_on).length;

  // 월별 트렌드 (최근 6개월)
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = startOfMonth(subMonths(new Date(), i));
    monthKeys.push(format(d, 'yyyy-MM'));
  }
  const newByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  const closedByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  for (const c of cases) {
    const newDate = c.retainer_date ?? c.created_at;
    if (newDate) {
      const k = format(parseISO(newDate), 'yyyy-MM');
      if (newByMonth.has(k)) newByMonth.set(k, (newByMonth.get(k) ?? 0) + 1);
    }
    if (c.closed_date) {
      const k = format(parseISO(c.closed_date), 'yyyy-MM');
      if (closedByMonth.has(k)) closedByMonth.set(k, (closedByMonth.get(k) ?? 0) + 1);
    }
  }

  const profileName = user.user_metadata?.name ?? user.email?.split('@')[0] ?? '';
  const isEmpty = clientCount === 0 && cases.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="dashboard" />
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">대시보드</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              안녕하세요 {profileName}. {format(new Date(), 'yyyy년 M월 d일')}
            </p>
          </div>
          <Link
            href="/calendar"
            className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            📅 캘린더
          </Link>
        </div>

        {isEmpty && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">시작하는 방법</h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                제일 자연스러운 순서는 <strong>사건 1건 만들기</strong>입니다. 유형을 고르면 분야별 워크플로우(스테이지·서류·액션)가 자동 준비됩니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <NewCaseButton clients={allClients} variant="cta" label="+ 첫 사건 시작하기" />
              <Link
                href="/kanban"
                className="px-6 py-3 rounded-md border border-zinc-300 dark:border-zinc-700 font-medium text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                📦 여러 사건 한 번에 불러오기
              </Link>
            </div>
            <p className="text-xs text-zinc-500 pt-2">
              이미 있는 상담/통화 내용이 있으면 상단의 <strong>🎙 상담 코파일럿</strong> 또는 <strong>📋 텍스트 분석</strong> 버튼으로 바로 분석할 수 있어요.
            </p>
          </section>
        )}

        {/* KPI 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="활성 사건" value={activeCases} sub={`종결 ${closedCases}`} href="/cases" />
          <StatCard label="고객" value={clientCount} href="/clients" />
          <StatCard
            label="팀원"
            value={memberCount}
            sub={pendingInvites > 0 ? `초대 ${pendingInvites} 대기` : undefined}
            href="/settings/team"
          />
          <StatCard label="미완 할일" value={tickets.length} href="/kanban" />
        </div>

        {/* 오늘 현황 */}
        <section>
          <h2 className="text-sm font-semibold mb-2">오늘</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MiniCard label="지연" count={overdue} tone="danger" href="/kanban" />
            <MiniCard label="오늘 마감" count={dueToday} tone="warning" href="/kanban" />
            <MiniCard label="내일" count={dueTomorrow} tone="warning" href="/kanban" />
            <MiniCard label="이번 주" count={dueThisWeek} href="/kanban" />
            <MiniCard label="대기 중" count={waitingCount} tone="info" href="/kanban" />
          </div>
          {triageCount > 0 && (
            <Link
              href="/kanban"
              className="mt-3 flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-md hover:shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-purple-900 dark:text-purple-200">
                  🟣 Triage에 검토 대기 {triageCount}개
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                  AI가 제안한 할일이 승인 대기 중
                </p>
              </div>
              <span className="text-xs text-purple-700 dark:text-purple-300">→ 칸반으로</span>
            </Link>
          )}
        </section>

        {/* 월별 차트 */}
        <section>
          <h2 className="text-sm font-semibold mb-2">월별 수임 / 종결 (최근 6개월)</h2>
          <MonthlyChart
            months={monthKeys}
            newData={newByMonth}
            closedData={closedByMonth}
          />
        </section>

        {/* 최근 활동 */}
        <section>
          <h2 className="text-sm font-semibold mb-2">최근 활동</h2>
          {recentEvents.length === 0 ? (
            <p className="text-xs text-zinc-500 py-4">활동 없음</p>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentEvents.map((ev) => (
                <div key={ev.id} className="p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-0.5">
                    <span>
                      {format(parseISO(ev.occurred_at ?? ev.created_at), 'MM-dd HH:mm')}
                    </span>
                    <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded">
                      {ev.source_type}
                    </span>
                  </div>
                  <p className="text-zinc-900 dark:text-zinc-100 line-clamp-2">
                    {(ev.raw_content ?? '').slice(0, 200) || '(내용 없음)'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition"
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </Link>
  );
}

function MiniCard({
  label,
  count,
  href,
  tone = 'default',
}: {
  label: string;
  count: number;
  href: string;
  tone?: 'default' | 'danger' | 'warning' | 'info';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : tone === 'info'
          ? 'text-blue-600'
          : 'text-zinc-900 dark:text-zinc-100';
  return (
    <Link
      href={href}
      className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:shadow-sm"
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 tabular-nums ${toneClass}`}>{count}</p>
    </Link>
  );
}

function MonthlyChart({
  months,
  newData,
  closedData,
}: {
  months: string[];
  newData: Map<string, number>;
  closedData: Map<string, number>;
}) {
  const max = Math.max(
    1,
    ...months.map((k) => Math.max(newData.get(k) ?? 0, closedData.get(k) ?? 0)),
  );
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-end gap-3 h-48">
        {months.map((k) => {
          const newCount = newData.get(k) ?? 0;
          const closedCount = closedData.get(k) ?? 0;
          const label = `${parseInt(k.slice(5), 10)}월`;
          return (
            <div key={k} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="flex-1 flex items-end gap-1 w-full justify-center">
                <div
                  className="flex-1 max-w-[22px] bg-blue-500 rounded-t transition-all"
                  style={{
                    height: `${(newCount / max) * 100}%`,
                    minHeight: newCount > 0 ? '3px' : 0,
                  }}
                  title={`신규: ${newCount}`}
                />
                <div
                  className="flex-1 max-w-[22px] bg-emerald-500 rounded-t transition-all"
                  style={{
                    height: `${(closedCount / max) * 100}%`,
                    minHeight: closedCount > 0 ? '3px' : 0,
                  }}
                  title={`종결: ${closedCount}`}
                />
              </div>
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="text-xs tabular-nums">
                <span className="text-blue-600">{newCount}</span>
                <span className="text-zinc-400 mx-0.5">/</span>
                <span className="text-emerald-600">{closedCount}</span>
              </p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-blue-500 rounded-sm inline-block" /> 신규 수임
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block" /> 종결
        </span>
      </div>
    </div>
  );
}
