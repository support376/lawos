import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchRehabCaseFullView } from '@/app/actions/rehab';
import { listCaseContracts, listCaseSchedules } from '@/app/actions/payments';
import { getActiveHold } from '@/app/actions/finance-holds';
import { getPossibleNextStages } from '@/lib/ontology/domains/personal_rehab/stages';
import { StageTimeline } from '../components/StageTimeline';
import { DebtorProfileSection } from '../components/DebtorProfileSection';
import { FinancialSummary } from '../components/FinancialSummary';
import { StageAdvanceControl } from '../components/StageAdvanceControl';
import { PaymentContractSection } from '../components/PaymentContractSection';
import { CaseFinanceInputs } from '../components/CaseFinanceInputs';

export async function CaseDetailView({ caseId }: { caseId: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [view, contracts, schedules, hold] = await Promise.all([
    fetchRehabCaseFullView(caseId),
    listCaseContracts(caseId),
    listCaseSchedules(caseId),
    getActiveHold(caseId),
  ]);
  if (!view) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-sm text-zinc-500">사건을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
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

      <PaymentContractSection
        caseId={view.case.id}
        contracts={contracts}
        schedules={schedules}
        hold={hold}
      />

      <CaseFinanceInputs
        caseId={view.case.id}
        debts={view.debts}
        assets={view.assets}
        incomes={view.incomes}
        dependents={view.dependents}
      />

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
    </div>
  );
}
