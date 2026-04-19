import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { fetchRehabCaseFullView } from '@/app/actions/rehab';
import { STAGES, getPossibleNextStages } from '@/lib/ontology/domains/personal_rehab/stages';
import { StageTimeline } from './components/StageTimeline';
import { DebtorProfileSection } from './components/DebtorProfileSection';
import { FinancialSummary } from './components/FinancialSummary';
import { SidebarCaseList } from './components/SidebarCaseList';
import { StageAdvanceControl } from './components/StageAdvanceControl';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';

export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const { case: caseId } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 사이드바용: 도메인별 활성 사건
  const { data: sidebarCases } = await supabase
    .from('cases')
    .select(`
      id, title, case_type, status,
      client:clients(id, name),
      rehab_case_details(current_stage_key)
    `)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  type SidebarCaseRow = {
    id: string;
    title: string;
    case_type: string | null;
    status: string;
    client: { id: string; name: string } | null;
    rehab_case_details: Array<{ current_stage_key: string | null }> | null;
  };
  const sidebarData = (sidebarCases ?? []) as unknown as SidebarCaseRow[];
  const rehabCases = sidebarData
    .filter((c) => c.case_type === 'personal_rehab')
    .map((c) => ({
      id: c.id,
      title: c.title,
      client_name: c.client?.name ?? '고객 미지정',
      current_stage_key: (c.rehab_case_details?.[0]?.current_stage_key as StageKey) ?? null,
    }));
  const divorceCases = sidebarData
    .filter((c) => c.case_type === 'divorce')
    .map((c) => ({ id: c.id, title: c.title, client_name: c.client?.name ?? '고객 미지정' }));

  // 본문
  const view = caseId ? await fetchRehabCaseFullView(caseId) : null;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="workflow" />
      <main className="flex-1 flex min-h-0">
        <SidebarCaseList
          rehabCases={rehabCases}
          divorceCases={divorceCases}
          selectedCaseId={caseId ?? null}
        />
        <section className="flex-1 overflow-y-auto p-6 space-y-5">
          {!view && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-2 max-w-md">
                <div className="text-5xl">📂</div>
                <p className="text-sm font-medium">사건을 선택하세요</p>
                <p className="text-xs text-zinc-500">
                  좌측에서 도메인과 고객을 고르면 해당 사건의 워크플로우가 표시됩니다.
                </p>
              </div>
            </div>
          )}

          {view && (
            <>
              <div>
                <Link
                  href="/workflow"
                  className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  ← 워크플로우
                </Link>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div>
                    <h1 className="text-xl font-semibold">{view.client_name}</h1>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {view.case.court ?? '법원 미지정'} · {view.case.case_number ?? '사건번호 미발급'}
                    </p>
                  </div>
                  <Link
                    href={`/cases/${view.case.id}`}
                    className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    사건 메타로 →
                  </Link>
                </div>
              </div>

              <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Stage</h2>
                  <StageAdvanceControl
                    caseId={view.case.id}
                    currentStage={view.case.current_stage_key}
                    nextStages={getPossibleNextStages(view.case.current_stage_key)}
                  />
                </div>
                <StageTimeline
                  currentStage={view.case.current_stage_key}
                  stageHistory={view.stage_history}
                />
              </section>

              <DebtorProfileSection caseId={view.case.id} debtor={view.debtor} />

              <FinancialSummary
                debts={view.debts}
                assets={view.assets}
                incomes={view.incomes}
                dependents={view.dependents}
                debtor={view.debtor}
              />

              <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                <h2 className="text-sm font-semibold mb-2">
                  보정·상호작용 이력 ({view.interactions.length})
                </h2>
                {view.interactions.length === 0 ? (
                  <p className="text-xs text-zinc-500">이력 없음</p>
                ) : (
                  <div className="space-y-1 text-xs">
                    {view.interactions.slice(0, 10).map((i) => (
                      <div key={i.id} className="flex gap-2">
                        <span className="text-zinc-500 tabular-nums">#{i.iteration_number}</span>
                        <span>{i.type}</span>
                        <span className="text-zinc-500">{i.initiator} → {i.recipient}</span>
                        <span className="text-zinc-400">{i.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
