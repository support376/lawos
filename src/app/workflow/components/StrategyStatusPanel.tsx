import type {
  Debtor,
  Debt,
  Asset,
  Income,
  Dependent,
} from '@/lib/ontology/domains/personal_rehab/entities';
import {
  screenRisks,
  checkShorteningEligibility,
  checkEligibility,
  recommendProcedure,
} from '@/lib/ontology/domains/personal_rehab/risks';
import {
  simulateRepaymentPlan,
  totalUnsecuredDebt,
} from '@/lib/ontology/domains/personal_rehab/calculations';
import type { PaymentSchedule } from '@/lib/ontology/core/objects';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function StrategyStatusPanel({
  debtor,
  debts,
  assets,
  incomes,
  dependents,
  schedules,
}: {
  debtor: Debtor | null;
  debts: Debt[];
  assets: Asset[];
  incomes: Income[];
  dependents: Dependent[];
  schedules: PaymentSchedule[];
}) {
  if (!debtor) {
    return (
      <section className="bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-5 text-center">
        <p className="text-sm text-zinc-500">
          ⚠ 채무자 프로필 없음 — 전략 평가 불가
        </p>
      </section>
    );
  }

  const risks = screenRisks(debtor);
  const shortening = checkShorteningEligibility(debtor);
  const eligibility = checkEligibility(debtor);
  const totalDebt = totalUnsecuredDebt(debts);
  const procedure = recommendProcedure(debtor, totalDebt);
  const spouseHasIncome = dependents.some((d) => d.relation === 'spouse' && d.has_own_income);
  const sim36 = simulateRepaymentPlan({
    incomes,
    assets,
    debts,
    dependents,
    spouseHasOwnIncome: spouseHasIncome,
    period_months: 36,
  });
  const paidTotal = schedules.reduce((sum, s) => sum + s.paid_amount_krw, 0);
  const contractTotal = schedules.reduce((sum, s) => sum + s.amount_krw, 0);
  const paymentRate = contractTotal > 0 ? Math.round((paidTotal / contractTotal) * 100) : 0;
  const overdueCount = schedules.filter((s) => s.status === 'overdue').length;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold">🎯 전략·리스크 상태</h2>

      {/* 1열: 절차 적합성 + 적격성 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusCard
          title="추천 절차"
          primary={procedureLabel(procedure.primary)}
          detail={procedure.reasoning}
          tone={procedure.primary === 'personal_rehab' ? 'ok' : 'warn'}
        />
        <StatusCard
          title="적격성"
          primary={eligibility.is_eligible ? '✓ 신청 가능' : '🔴 신청 불가'}
          detail={
            eligibility.is_eligible
              ? eligibility.warnings[0] ?? '모든 요건 충족'
              : eligibility.blockers[0]
          }
          tone={eligibility.is_eligible ? 'ok' : 'danger'}
        />
        <StatusCard
          title="24개월 단축"
          primary={shortening.is_eligible ? '✓ 자격 충족' : '해당 없음'}
          detail={
            shortening.is_eligible
              ? shortening.reasons.map((r) => r.label).join(', ')
              : '6가지 자격 중 해당 없음 — 36개월 원칙'
          }
          tone={shortening.is_eligible ? 'ok' : 'info'}
        />
      </div>

      {/* 2열: 시뮬 36개월 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatusCard
          title="청산가치"
          primary={`${krw(sim36.liquidation_value_krw)}원`}
          detail={`자산 ${assets.length}건 · 순가치 합`}
          tone="info"
        />
        <StatusCard
          title="가용소득"
          primary={`${krw(sim36.disposable.disposable_income_krw)}원/월`}
          detail={`${sim36.disposable.household_size}인가구 · ${sim36.disposable.household_logic === 'split' ? '분할산정' : '표준'}`}
          tone={sim36.disposable.is_negative ? 'warn' : 'ok'}
        />
        <StatusCard
          title="월변제액 (36개월)"
          primary={`${krw(sim36.monthly_payment_krw)}원`}
          detail={`기반: ${sim36.disposable.disposable_income_krw > sim36.liquidation_value_krw / 36 ? '가용소득' : '청산가치'}`}
          tone="info"
        />
        <StatusCard
          title="변제율"
          primary={`${(sim36.repayment_ratio * 100).toFixed(1)}%`}
          detail={`무담보 ${krw(sim36.unsecured_debt_krw)}원 대비`}
          tone={sim36.liquidation_value_guaranteed ? 'ok' : 'danger'}
        />
      </div>

      {/* 3열: 청산가치보장 검증 */}
      <div
        className={`p-2 rounded text-xs ${
          sim36.liquidation_value_guaranteed
            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
        }`}
      >
        {sim36.liquidation_value_guaranteed
          ? `✓ 청산가치보장 충족 (총변제 ${krw(sim36.total_payment_krw)}원 ≥ 청산 ${krw(sim36.liquidation_value_krw)}원)`
          : `⚠ 청산가치보장 미충족 — 변제율 ${(sim36.repayment_ratio * 100).toFixed(1)}% 조정 필요`}
      </div>

      {/* 리스크 플래그 */}
      <div>
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
          리스크 스크리닝 · {risks.summary}
        </div>
        {risks.flags.length === 0 ? (
          <p className="text-xs text-zinc-500">리스크 플래그 없음</p>
        ) : (
          <div className="space-y-1 text-xs">
            {risks.flags.map((f) => (
              <div key={f.key} className="flex items-start gap-2">
                <span>{f.level === 'red' ? '🔴' : '🟡'}</span>
                <div className="flex-1">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-zinc-500 ml-2">— {f.response}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 재무 스냅샷 */}
      <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
          재무 스냅샷
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-zinc-500">계약 수금률</div>
            <div className="font-semibold tabular-nums">{paymentRate}%</div>
            <div className="text-[10px] text-zinc-400">
              {krw(paidTotal)}/{krw(contractTotal)}원
            </div>
          </div>
          <div>
            <div className="text-zinc-500">연체 회차</div>
            <div className={`font-semibold tabular-nums ${overdueCount > 0 ? 'text-red-600' : ''}`}>
              {overdueCount}건
            </div>
          </div>
          <div>
            <div className="text-zinc-500">Gate 상태</div>
            <div className="text-[10px]">
              {overdueCount > 0 ? '⚠ Stage 차단 가능' : '✓ 정상'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function procedureLabel(p: string): string {
  const m: Record<string, string> = {
    personal_rehab: '개인회생',
    bankruptcy_discharge: '파산면책',
    general_rehab: '일반회생',
    small_business_rehab: '소액영업소득자',
    private_workout: '신복위·사적조정',
  };
  return m[p] ?? p;
}

function StatusCard({
  title,
  primary,
  detail,
  tone,
}: {
  title: string;
  primary: string;
  detail: string;
  tone: 'ok' | 'warn' | 'danger' | 'info';
}) {
  const bg = {
    ok: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50',
    warn: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50',
    danger: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50',
    info: 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700',
  }[tone];
  const textColor = {
    ok: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    danger: 'text-red-700 dark:text-red-300',
    info: 'text-zinc-700 dark:text-zinc-300',
  }[tone];
  return (
    <div className={`p-2.5 rounded border ${bg}`}>
      <div className="text-[10px] text-zinc-500 mb-0.5">{title}</div>
      <div className={`text-sm font-semibold ${textColor}`}>{primary}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{detail}</div>
    </div>
  );
}
