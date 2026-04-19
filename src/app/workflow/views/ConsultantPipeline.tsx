import { createClient } from '@/lib/supabase/server';
import type { Lead, LeadStatus } from '@/lib/ontology/core/objects';
import { LEAD_STATUS_LABEL, LEAD_SOURCE_LABEL } from '@/lib/ontology/core/objects';
import type { DomainKey, MyRoleContext } from '@/lib/auth/my-roles';
import { NewLeadButton } from '../components/NewLeadButton';
import { LeadCard } from '../components/LeadCard';

const STATUS_COLUMNS: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost', 'cold'];

export async function ConsultantPipeline({
  domain,
  ctx,
}: {
  domain: DomainKey;
  ctx: MyRoleContext;
}) {
  const supabase = await createClient();

  let q = supabase
    .from('leads')
    .select('*')
    .eq('workspace_id', ctx.workspaceId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (domain !== '*') {
    q = q.in('case_type_hint', [domain, 'undetermined']);
  }

  const { data } = await q;
  const leads = (data ?? []) as Lead[];

  // 기본 뷰: 본인 담당 Lead (대표는 전체)
  const visibleLeads = ctx.isManagingPartner
    ? leads
    : leads.filter((l) => l.assigned_consultant_id === ctx.userId);

  const grouped = new Map<LeadStatus, Lead[]>();
  STATUS_COLUMNS.forEach((s) => grouped.set(s, []));
  for (const l of visibleLeads) {
    grouped.get(l.status)?.push(l);
  }

  const kpi = {
    total: visibleLeads.length,
    conversionRate:
      visibleLeads.length > 0
        ? Math.round(
            (visibleLeads.filter((l) => l.status === 'converted').length /
              visibleLeads.length) * 100,
          )
        : 0,
    oldContacts: visibleLeads.filter((l) => {
      if (l.status === 'converted' || l.status === 'lost') return false;
      if (!l.last_contact_at) return true;
      const days =
        (Date.now() - new Date(l.last_contact_at).getTime()) / 86_400_000;
      return days > 30;
    }).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          <div>
            <span className="text-zinc-500">내 리드</span>{' '}
            <span className="font-semibold tabular-nums">{kpi.total}</span>
          </div>
          <div>
            <span className="text-zinc-500">전환율</span>{' '}
            <span className="font-semibold tabular-nums">{kpi.conversionRate}%</span>
          </div>
          {kpi.oldContacts > 0 && (
            <div className="text-amber-700 dark:text-amber-400">
              ⚠ 30일 무접촉 {kpi.oldContacts}
            </div>
          )}
        </div>
        <NewLeadButton domain={domain} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_COLUMNS.map((status) => {
          const list = grouped.get(status) ?? [];
          return (
            <div key={status} className="flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {LEAD_STATUS_LABEL[status]}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{list.length}</span>
              </div>
              <div className="flex-1 space-y-2 bg-zinc-100 dark:bg-zinc-900 rounded p-2 min-h-[200px]">
                {list.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 italic text-center py-4">—</p>
                ) : (
                  list.map((l) => <LeadCard key={l.id} lead={l} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-zinc-500 italic">
        유입채널 표기: {Object.values(LEAD_SOURCE_LABEL).slice(0, 4).join(' · ')} 등
      </div>
    </div>
  );
}
