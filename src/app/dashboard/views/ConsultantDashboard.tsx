import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { differenceInCalendarDays, format, startOfWeek, startOfMonth, subWeeks } from 'date-fns';
import type { Lead, LeadStatus } from '@/lib/ontology/core/objects';
import { LEAD_STATUS_LABEL } from '@/lib/ontology/core/objects';
import type { MyRoleContext, DomainKey } from '@/lib/auth/my-roles';

export async function ConsultantDashboard({
  ctx,
  domain,
  asUserId,
}: {
  ctx: MyRoleContext;
  domain: DomainKey;
  asUserId?: string;                 // 시뮬 시 특정 사용자 기준
}) {
  const supabase = await createClient();
  const targetUserId = asUserId ?? ctx.userId;

  let q = supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .eq('assigned_consultant_id', targetUserId)
    .order('last_contact_at', { ascending: false, nullsFirst: false })
    .limit(200);
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
  const convRate =
    leads.length > 0
      ? Math.round((leads.filter((l) => l.status === 'converted').length / leads.length) * 100)
      : 0;

  // 오늘 전화 대상: 미접촉 Lead + 30일 이내 접촉 리드 중 next follow 안 된 것
  const noContact = leads.filter((l) => l.status === 'new' && !l.last_contact_at);
  const coldLeads = leads.filter((l) => {
    if (l.status === 'converted' || l.status === 'lost') return false;
    if (!l.last_contact_at) return false;
    const days = differenceInCalendarDays(now, new Date(l.last_contact_at));
    return days > 14;
  });
  const qualifiedWaiting = leads.filter((l) => l.status === 'qualified');

  // Status 분포
  const byStatus: Record<LeadStatus, number> = {
    new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0, cold: 0,
  };
  leads.forEach((l) => byStatus[l.status]++);

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="진행중 리드" value={`${totalActive}건`} sub={`전체 ${leads.length}건`} />
        <KPI label="이번주 신규" value={`${thisWeekNew}건`} sub={`전주 ${lastWeekNew}건`} tone={thisWeekNew >= lastWeekNew ? 'emerald' : 'red'} />
        <KPI label="이번달 전환" value={`${thisMonthConverted}건`} sub="수임 확정" tone="emerald" />
        <KPI label="전환율" value={`${convRate}%`} sub={`총 ${leads.length}건 기준`} />
      </div>

      {/* 오늘 할일 */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">🎯 오늘 할 일</h2>
        <div className="space-y-3">
          <ActionGroup
            title="미접촉 신규 리드"
            count={noContact.length}
            leads={noContact}
            tone="red"
            emptyMsg="없음"
            subLabel="첫 통화 대기"
          />
          <ActionGroup
            title="콜드 (14일 이상 무접촉)"
            count={coldLeads.length}
            leads={coldLeads}
            tone="amber"
            emptyMsg="정상"
            subLabel="재연락 필요"
          />
          <ActionGroup
            title="적격 확인된 리드 (수임 대기)"
            count={qualifiedWaiting.length}
            leads={qualifiedWaiting}
            tone="emerald"
            emptyMsg="없음"
            subLabel="수임 확정 또는 드롭"
          />
        </div>
      </section>

      {/* 상태 분포 */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
        <h2 className="text-sm font-semibold mb-3">📊 내 리드 상태</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {(Object.keys(byStatus) as LeadStatus[]).map((s) => (
            <div
              key={s}
              className={`text-center p-2 rounded ${s === 'converted' ? 'bg-emerald-100 dark:bg-emerald-950/30' : s === 'lost' ? 'bg-red-50 dark:bg-red-950/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}
            >
              <div className="text-[10px] text-zinc-500">{LEAD_STATUS_LABEL[s]}</div>
              <div className="text-lg font-semibold tabular-nums">{byStatus[s]}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[10px] text-zinc-500 text-right italic">
        갱신: {format(new Date(), 'yyyy-MM-dd HH:mm')}
      </p>
    </div>
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

function ActionGroup({
  title,
  count,
  leads,
  tone,
  emptyMsg,
  subLabel,
}: {
  title: string;
  count: number;
  leads: Lead[];
  tone: 'red' | 'amber' | 'emerald';
  emptyMsg: string;
  subLabel: string;
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
          {leads.slice(0, 8).map((l) => (
            <Link
              key={l.id}
              href={`/workflow?view=consultant&domain=${l.case_type_hint}`}
              className="block text-xs p-1.5 bg-white dark:bg-zinc-900 rounded hover:shadow"
            >
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-medium truncate">{l.name}</span>
                <span className="text-[10px] text-zinc-500 shrink-0">
                  {l.contact ?? '—'}
                  {l.last_contact_at && ` · ${format(new Date(l.last_contact_at), 'MM-dd')}`}
                </span>
              </div>
              {l.notes && <p className="text-[10px] text-zinc-500 truncate mt-0.5">{l.notes}</p>}
            </Link>
          ))}
          {leads.length > 8 && (
            <div className="text-[10px] text-zinc-500 text-center pt-1">
              ... 외 {leads.length - 8}건
            </div>
          )}
        </div>
      )}
    </div>
  );
}
