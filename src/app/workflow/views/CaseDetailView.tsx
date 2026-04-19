import Link from 'next/link';
import { fetchRehabCaseFullView } from '@/app/actions/rehab';
import { listCaseContracts, listCaseSchedules } from '@/app/actions/payments';
import { getActiveHold } from '@/app/actions/finance-holds';
import { getMyRoleContext, hasAnyRole } from '@/lib/auth/my-roles';
import { getPossibleNextStages } from '@/lib/ontology/domains/personal_rehab/stages';
import { DebtorProfileSection } from '../components/DebtorProfileSection';
import { FinancialSummary } from '../components/FinancialSummary';
import { StageAdvanceControl } from '../components/StageAdvanceControl';
import { PaymentContractSection } from '../components/PaymentContractSection';
import { CaseFinanceInputs } from '../components/CaseFinanceInputs';
import { StageMap } from '../components/StageMap';
import { StrategyStatusPanel } from '../components/StrategyStatusPanel';
import { CaseActionBoard } from '../components/CaseActionBoard';

// 종합 뷰 접근 가능 역할
const FULL_VIEW_ROLES = ['managing_partner', 'attorney', 'admin'] as const;

export async function CaseDetailView({ caseId }: { caseId: string }) {
  const ctx = await getMyRoleContext();
  if (!ctx) return null;

  const canFullView =
    hasAnyRole(ctx, 'managing_partner') ||
    hasAnyRole(ctx, 'attorney') ||
    hasAnyRole(ctx, 'admin');

  // 축소 뷰 권한 판단
  const canWrite =
    hasAnyRole(ctx, 'document_staff') ||
    hasAnyRole(ctx, 'analysis_staff') ||
    hasAnyRole(ctx, 'correction_staff');
  const canBilling = hasAnyRole(ctx, 'billing_staff');
  const canAccess = canFullView || canWrite || canBilling;

  if (!canAccess) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-8 text-center space-y-2">
          <div className="text-4xl">🚫</div>
          <p className="text-sm font-medium">사건 상세 접근 권한 없음</p>
          <p className="text-xs text-zinc-500">
            담당 역할: {ctx.entries.map((e) => e.role).join(', ') || '없음'}
          </p>
          <Link href="/workflow" className="inline-block text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 mt-2">
            ← 워크플로우로
          </Link>
        </div>
      </div>
    );
  }

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
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* 헤더 */}
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
              {!canFullView && ' · 축소 뷰 (역할 제한)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StageAdvanceControl
              caseId={view.case.id}
              currentStage={view.case.current_stage_key}
              nextStages={getPossibleNextStages(view.case.current_stage_key)}
            />
            <Link
              href={`/cases/${view.case.id}`}
              className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              메타 →
            </Link>
          </div>
        </div>
      </div>

      {/* [A] 사건 지도 — 모든 역할 노출 (맥락 파악용) */}
      <StageMap
        currentStage={view.case.current_stage_key}
        history={view.stage_history}
      />

      {/* [B] 진행 중 Action (팀별) — 종합 뷰 역할만 */}
      {canFullView && (
        <CaseActionBoard caseId={view.case.id} workspaceId={ctx.workspaceId} />
      )}

      {/* [C] 전략·리스크 상태 — 종합 뷰 역할만 */}
      {canFullView && (
        <StrategyStatusPanel
          debtor={view.debtor}
          debts={view.debts}
          assets={view.assets}
          incomes={view.incomes}
          dependents={view.dependents}
          schedules={schedules}
        />
      )}

      {/* 채무자 프로필 — 작성팀도 볼 수 있음 (담당 업무) */}
      {(canFullView || canWrite) && (
        <DebtorProfileSection caseId={view.case.id} debtor={view.debtor} />
      )}

      {/* 결제 계약 — 재무팀·종합 뷰 */}
      {(canFullView || canBilling) && (
        <PaymentContractSection
          caseId={view.case.id}
          contracts={contracts}
          schedules={schedules}
          hold={hold}
        />
      )}

      {/* 재정 입력 — 작성팀·종합 뷰 */}
      {(canFullView || canWrite) && (
        <CaseFinanceInputs
          caseId={view.case.id}
          debts={view.debts}
          assets={view.assets}
          incomes={view.incomes}
          dependents={view.dependents}
        />
      )}

      {/* 재정 시뮬 — 종합 뷰만 (전략 판단) */}
      {canFullView && (
        <FinancialSummary
          debts={view.debts}
          assets={view.assets}
          incomes={view.incomes}
          dependents={view.dependents}
          debtor={view.debtor}
        />
      )}

      {/* 보정·법원 상호작용 이력 — 종합 뷰·작성팀 */}
      {(canFullView || canWrite) && (
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-2">
            ⚖️ 법원 상호작용 ({view.interactions.length})
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
      )}
    </div>
  );
}
