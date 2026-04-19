import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { DomainKey, MyRoleContext } from '@/lib/auth/my-roles';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';

// 작성팀 주 Stage (초기·종결 제외한 실무 진행 단계)
const WRITER_COLUMNS: StageKey[] = [
  'document_prep',
  'filing',
  'correction_loop',
  'opening_decision',
  'claim_filing',
  'creditor_meeting',
  'plan_approval',
  'repayment',
];

interface CaseRow {
  id: string;
  title: string;
  case_type: string | null;
  status: string;
  assigned_to: string | null;
  client: { name: string } | null;
  rehab_case_details: Array<{ current_stage_key: string | null }> | null;
}

export async function WriterPipeline({
  domain,
  ctx,
}: {
  domain: DomainKey;
  ctx: MyRoleContext;
}) {
  if (domain !== 'personal_rehab' && domain !== '*') {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-zinc-500">
          작성팀 파이프라인은 현재 개인회생만 지원합니다.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: cases } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, status, assigned_to,
      client:clients(name),
      rehab_case_details(current_stage_key)
    `)
    .eq('status', 'active')
    .eq('case_type', 'personal_rehab');

  const rows = ((cases ?? []) as unknown as CaseRow[]);

  // 활성 Finance Hold
  const { data: holds } = await supabase
    .from('case_financial_holds')
    .select('case_id, reason')
    .eq('workspace_id', ctx.workspaceId)
    .eq('active', true);
  const holdMap = new Map<string, string>(
    ((holds ?? []) as Array<{ case_id: string; reason: string }>).map((h) => [h.case_id, h.reason]),
  );

  // 연체 미납으로 gate 차단된 사건
  const { data: overdueRows } = await supabase
    .from('payment_schedules')
    .select('case_id, installment_no, status, gate_blocks_stages')
    .eq('workspace_id', ctx.workspaceId)
    .eq('status', 'overdue');
  const overdueMap = new Map<string, string>();
  for (const o of (overdueRows ?? []) as Array<{
    case_id: string;
    installment_no: number;
    gate_blocks_stages: string[] | null;
  }>) {
    if ((o.gate_blocks_stages ?? []).length === 0) continue;
    overdueMap.set(o.case_id, `${o.installment_no}회차 연체 gate`);
  }

  // Stage별 그룹핑
  const grouped = new Map<StageKey, CaseRow[]>();
  WRITER_COLUMNS.forEach((s) => grouped.set(s, []));
  const outOfScope: CaseRow[] = [];
  for (const c of rows) {
    const stageKey = (c.rehab_case_details?.[0]?.current_stage_key as StageKey | null) ?? null;
    if (stageKey && WRITER_COLUMNS.includes(stageKey)) {
      grouped.get(stageKey)?.push(c);
    } else {
      outOfScope.push(c);
    }
  }

  const totalCount = rows.length;
  const holdCount = holdMap.size;
  const bottleneck = WRITER_COLUMNS.filter((s) => {
    const meta = STAGES[s];
    const list = grouped.get(s) ?? [];
    return meta.typical_duration_days && list.length >= 3;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs flex-wrap">
        <div>
          <span className="text-zinc-500">활성 사건</span>{' '}
          <span className="font-semibold tabular-nums">{totalCount}</span>
        </div>
        {holdCount > 0 && (
          <div className="text-red-600 dark:text-red-400">
            🛑 Hold {holdCount}건
          </div>
        )}
        {bottleneck.length > 0 && (
          <div className="text-amber-700 dark:text-amber-400">
            ⚠ 병목 의심: {bottleneck.map((s) => STAGES[s].label).join(', ')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 overflow-x-auto">
        {WRITER_COLUMNS.map((stage) => {
          const list = grouped.get(stage) ?? [];
          const meta = STAGES[stage];
          return (
            <div key={stage} className="flex flex-col min-w-[150px]">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                  {meta.label}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{list.length}</span>
              </div>
              <div className="flex-1 space-y-2 bg-zinc-100 dark:bg-zinc-900 rounded p-2 min-h-[200px]">
                {list.length === 0 ? (
                  <p className="text-[10px] text-zinc-400 italic text-center py-4">—</p>
                ) : (
                  list.map((c) => {
                    const holdReason = holdMap.get(c.id);
                    const gateReason = overdueMap.get(c.id);
                    const blocked = !!holdReason || !!gateReason;
                    return (
                      <Link
                        key={c.id}
                        href={`/workflow?case=${c.id}`}
                        className={`block bg-white dark:bg-zinc-800 rounded p-2 shadow-sm hover:shadow-md ${blocked ? 'opacity-60' : ''}`}
                      >
                        <div className="text-xs font-medium truncate flex items-center gap-1">
                          {blocked && <span>🔒</span>}
                          {c.client?.name ?? '—'}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">{c.title}</div>
                        {blocked && (
                          <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 truncate">
                            {holdReason ?? gateReason}
                          </div>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {outOfScope.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            상담·수임 단계 또는 종결 ({outOfScope.length})
          </h3>
          <div className="flex flex-wrap gap-1">
            {outOfScope.map((c) => (
              <Link
                key={c.id}
                href={`/workflow?case=${c.id}`}
                className="text-xs px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                {c.client?.name ?? '—'}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
