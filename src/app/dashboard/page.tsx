import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
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
    membersRes,
    recentEventsRes,
    invitesCountRes,
  ] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase
      .from('cases')
      .select('id, status, retainer_date, closed_date, created_at, assigned_to, case_type'),
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
  const recentEvents = recentEventsRes.data ?? [];

  const activeCases = cases.filter((c) => c.status === 'active').length;
  const closedCases = cases.filter((c) => c.status !== 'active').length;

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
        <div>
          <h1 className="text-2xl font-semibold">대시보드</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            안녕하세요 {profileName}. {format(new Date(), 'yyyy년 M월 d일')}
          </p>
        </div>

        {isEmpty && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">시작하는 방법</h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                사건 1건을 먼저 만드세요. 유형을 고르면 해당 도메인의 워크플로우가 준비됩니다.
              </p>
            </div>
            <NewCaseButton clients={allClients} variant="cta" label="+ 첫 사건 시작하기" />
          </section>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="활성 사건" value={activeCases} sub={`종결 ${closedCases}`} href="/cases" />
          <StatCard label="고객" value={clientCount} href="/clients" />
          <StatCard
            label="팀원"
            value={memberCount}
            sub={pendingInvites > 0 ? `초대 ${pendingInvites} 대기` : undefined}
            href="/settings/team"
          />
        </div>

        <section>
          <h2 className="text-sm font-semibold mb-2">월별 수임 / 종결 (최근 6개월)</h2>
          <MonthlyChart
            months={monthKeys}
            newData={newByMonth}
            closedData={closedByMonth}
          />
        </section>

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
