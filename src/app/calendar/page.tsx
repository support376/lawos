import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subMonths,
} from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { TICKET_TYPE_ICON, type TicketType } from '@/lib/types';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 표시할 월 결정 (URL의 m 파라미터 또는 현재 월)
  const base = m ? parseISO(m + '-01') : new Date();
  const monthStart = startOfMonth(base);
  const monthEnd = endOfMonth(base);

  // 월 범위 안의 이벤트 병렬 로드
  const startISO = monthStart.toISOString().slice(0, 10);
  const endISO = monthEnd.toISOString().slice(0, 10);

  const [ticketsRes, casesRes, eventsRes] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, title, due_date, type, client:clients(id, name)')
      .gte('due_date', startISO)
      .lte('due_date', endISO)
      .neq('column_key', 'done'),
    supabase
      .from('cases')
      .select('id, title, retainer_date, closed_date, case_type, client:clients(id, name)')
      .or(
        `and(retainer_date.gte.${startISO},retainer_date.lte.${endISO}),and(closed_date.gte.${startISO},closed_date.lte.${endISO})`,
      ),
    supabase
      .from('events')
      .select('id, raw_content, source_type, occurred_at, case_id, client_id, client:clients(id, name)')
      .eq('source_type', 'milestone')
      .gte('occurred_at', `${startISO}T00:00:00Z`)
      .lte('occurred_at', `${endISO}T23:59:59Z`),
  ]);

  type CalEvent = {
    id: string;
    date: string;
    kind: 'ticket' | 'retainer' | 'closed' | 'milestone';
    title: string;
    subtitle: string | null;
    href: string;
    icon?: string;
  };

  const calEvents: CalEvent[] = [];

  const tickets = (ticketsRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    due_date: string;
    type: TicketType;
    client: { id: string; name: string } | null;
  }>;
  for (const t of tickets) {
    calEvents.push({
      id: `t-${t.id}`,
      date: t.due_date,
      kind: 'ticket',
      title: t.title,
      subtitle: t.client?.name ?? null,
      href: `/kanban?client=${t.client?.id ?? ''}`,
      icon: TICKET_TYPE_ICON[t.type],
    });
  }

  const cases = (casesRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    retainer_date: string | null;
    closed_date: string | null;
    case_type: string | null;
    client: { id: string; name: string } | null;
  }>;
  for (const c of cases) {
    if (c.retainer_date && c.retainer_date >= startISO && c.retainer_date <= endISO) {
      calEvents.push({
        id: `r-${c.id}`,
        date: c.retainer_date,
        kind: 'retainer',
        title: c.title,
        subtitle: `${c.client?.name ?? ''} 수임`,
        href: `/cases/${c.id}`,
        icon: '📥',
      });
    }
    if (c.closed_date && c.closed_date >= startISO && c.closed_date <= endISO) {
      calEvents.push({
        id: `c-${c.id}`,
        date: c.closed_date,
        kind: 'closed',
        title: c.title,
        subtitle: `${c.client?.name ?? ''} 종결`,
        href: `/cases/${c.id}`,
        icon: '📤',
      });
    }
  }

  const milestones = (eventsRes.data ?? []) as unknown as Array<{
    id: string;
    raw_content: string | null;
    occurred_at: string;
    case_id: string | null;
    client_id: string | null;
    client: { id: string; name: string } | null;
  }>;
  for (const ev of milestones) {
    calEvents.push({
      id: `ev-${ev.id}`,
      date: ev.occurred_at.slice(0, 10),
      kind: 'milestone',
      title: (ev.raw_content ?? '').slice(0, 60),
      subtitle: ev.client?.name ?? null,
      href: ev.case_id ? `/cases/${ev.case_id}` : ev.client_id ? `/clients/${ev.client_id}` : '/dashboard',
      icon: '📌',
    });
  }

  // 월 그리드 (완전한 주 단위)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  let d = gridStart;
  while (d <= gridEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const eventsByDate = new Map<string, CalEvent[]>();
  for (const e of calEvents) {
    const arr = eventsByDate.get(e.date) ?? [];
    arr.push(e);
    eventsByDate.set(e.date, arr);
  }

  const prevMonth = format(subMonths(monthStart, 1), 'yyyy-MM');
  const nextMonth = format(addMonths(monthStart, 1), 'yyyy-MM');
  const currentMonth = format(monthStart, 'yyyy-MM');
  const isCurrentMonth = currentMonth === format(new Date(), 'yyyy-MM');

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="dashboard" />
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">캘린더</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {format(monthStart, 'yyyy년 M월')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/calendar?m=${prevMonth}`}
              className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              ‹
            </Link>
            {!isCurrentMonth && (
              <Link
                href="/calendar"
                className="px-3 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                오늘
              </Link>
            )}
            <Link
              href={`/calendar?m=${nextMonth}`}
              className="px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              ›
            </Link>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-xs font-medium border-b border-zinc-200 dark:border-zinc-800">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div
                key={d}
                className={`px-2 py-2 text-center ${
                  i === 0
                    ? 'text-red-600'
                    : i === 6
                      ? 'text-blue-600'
                      : 'text-zinc-500'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 auto-rows-[minmax(104px,auto)]">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const evs = eventsByDate.get(key) ?? [];
              const isOther = !isSameMonth(day, monthStart);
              const isToday = isSameDay(day, new Date());
              const dow = day.getDay();
              return (
                <div
                  key={key}
                  className={`p-1.5 border-r border-b border-zinc-200 dark:border-zinc-800 last:border-r-0 ${
                    isOther
                      ? 'bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-400'
                      : ''
                  }`}
                >
                  <div
                    className={`text-xs mb-1 ${
                      isToday
                        ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-600 text-white font-medium'
                        : dow === 0
                          ? 'text-red-600'
                          : dow === 6
                            ? 'text-blue-600'
                            : ''
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {evs.slice(0, 4).map((e) => (
                      <Link
                        key={e.id}
                        href={e.href}
                        className={`block px-1.5 py-0.5 rounded text-[11px] truncate hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600 ${eventClass(
                          e.kind,
                        )}`}
                        title={`${e.title}${e.subtitle ? ' · ' + e.subtitle : ''}`}
                      >
                        {e.icon} {e.title}
                      </Link>
                    ))}
                    {evs.length > 4 && (
                      <div className="text-[11px] text-zinc-500 pl-1.5">
                        +{evs.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-4 text-xs text-zinc-500 flex-wrap">
          <Legend color="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300" label="마감일 (티켓)" />
          <Legend color="bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-300" label="수임" />
          <Legend color="bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300" label="종결" />
          <Legend color="bg-purple-100 text-purple-900 dark:bg-purple-950/50 dark:text-purple-300" label="이력" />
        </div>
      </main>
    </div>
  );
}

function eventClass(kind: 'ticket' | 'retainer' | 'closed' | 'milestone'): string {
  switch (kind) {
    case 'ticket':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300';
    case 'retainer':
      return 'bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-300';
    case 'closed':
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'milestone':
      return 'bg-purple-100 text-purple-900 dark:bg-purple-950/50 dark:text-purple-300';
  }
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded ${color}`} />
      {label}
    </span>
  );
}
