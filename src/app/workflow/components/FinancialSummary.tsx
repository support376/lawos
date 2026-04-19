import type {
  Debt,
  Asset,
  Income,
  Dependent,
  Debtor,
  RepaymentPeriodMonths,
} from '@/lib/ontology/domains/personal_rehab/entities';
import {
  calcDisposableIncome,
  calcLiquidationValue,
  totalMonthlyIncome,
  totalUnsecuredDebt,
  simulateRepaymentPlan,
} from '@/lib/ontology/domains/personal_rehab/calculations';
import { checkShorteningEligibility } from '@/lib/ontology/domains/personal_rehab/risks';

function krw(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

export function FinancialSummary({
  debts,
  assets,
  incomes,
  dependents,
  debtor,
}: {
  debts: Debt[];
  assets: Asset[];
  incomes: Income[];
  dependents: Dependent[];
  debtor: Debtor | null;
}) {
  const hasData = debts.length + assets.length + incomes.length + dependents.length > 0;

  if (!hasData) {
    return (
      <section className="bg-zinc-50 dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-5 text-center">
        <p className="text-sm text-zinc-500">
          💰 재정 데이터 없음 — 채무·재산·소득·부양가족을 입력하면 변제계획 시뮬이 자동 계산됩니다.
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          (CRUD UI는 다음 커밋에서 구현)
        </p>
      </section>
    );
  }

  const spouseHasIncome = dependents.some((d) => d.relation === 'spouse' && d.has_own_income);
  const disposable = calcDisposableIncome(incomes, dependents, spouseHasIncome);
  const liquidation = calcLiquidationValue(assets);
  const unsecured = totalUnsecuredDebt(debts);

  // 24 vs 36 vs 60 시나리오
  const shortEligible = debtor ? checkShorteningEligibility(debtor).is_eligible : false;
  const periods: RepaymentPeriodMonths[] = shortEligible ? [24, 36, 60] : [36, 60];
  const scenarios = periods.map((p) =>
    simulateRepaymentPlan({
      incomes,
      assets,
      debts,
      dependents,
      spouseHasOwnIncome: spouseHasIncome,
      period_months: p,
    }),
  );

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-4">
      <h2 className="text-sm font-semibold">💰 재정 요약·시뮬</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <Metric
          label="월소득 합계"
          value={`${krw(totalMonthlyIncome(incomes))}원`}
          sub={`${incomes.length}개 소득원`}
        />
        <Metric
          label="무담보 채무"
          value={`${krw(unsecured)}원`}
          sub={`총 ${debts.length}건`}
        />
        <Metric
          label="청산가치"
          value={`${krw(liquidation.total_krw)}원`}
          sub={`자산 ${assets.length}건`}
        />
        <Metric
          label="가용소득"
          value={`${krw(disposable.disposable_income_krw)}원`}
          sub={`${disposable.household_size}인가구 · ${disposable.household_logic === 'split' ? '분할산정' : '표준'}`}
          warn={disposable.is_negative}
        />
      </div>

      {disposable.is_negative && (
        <div className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 p-2 rounded">
          ⚠ 가용소득 0 이하 — 알바·취업예정·생활비 절감 주장으로 진행 가능 (v0.2 완화 조항)
        </div>
      )}

      <div>
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
          변제계획 시나리오 비교 {shortEligible && <span className="normal-case text-emerald-600">· 24개월 단축 자격 충족</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <th className="py-1.5 pr-3">기간</th>
                <th className="py-1.5 pr-3 text-right">월변제액</th>
                <th className="py-1.5 pr-3 text-right">총변제액</th>
                <th className="py-1.5 pr-3 text-right">변제율</th>
                <th className="py-1.5 pr-3">청산가치 보장</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.period_months} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <td className="py-1.5 pr-3 font-medium">{s.period_months}개월</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{krw(s.monthly_payment_krw)}원</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{krw(s.total_payment_krw)}원</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{(s.repayment_ratio * 100).toFixed(1)}%</td>
                  <td className="py-1.5 pr-3">
                    {s.liquidation_value_guaranteed ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-red-600">⚠ 미충족</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="text-xs">
        <summary className="text-zinc-500 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100">
          계산 상세
        </summary>
        <div className="mt-2 space-y-1 pl-3 border-l border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
          <div>세후 월소득: {krw(disposable.total_income_krw)}원</div>
          <div>최저생계비({disposable.household_size}인): {krw(disposable.minimum_living_cost_krw)}원</div>
          <div>가구원수 근거: {disposable.note}</div>
          <div>청산가치 내역: {liquidation.per_asset.map((a) => `${a.label} ${krw(a.net_krw)}원`).join(', ')}</div>
        </div>
      </details>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded border ${
        warn
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="font-semibold tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}
