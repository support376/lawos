// 개인회생 파생 계산 체인 v0.2 (§5)
// 월변제액 · 총변제액 · 변제율 · 청산가치 · 가용소득 · 최저생계비

import type {
  Asset,
  Debt,
  Dependent,
  Income,
  RepaymentPeriodMonths,
  RepaymentStructure,
  HouseholdSizeLogic,
} from './entities';

// =========================================================================
// 최저생계비 테이블 (2026년 기준 중위소득 × 60%)
// 실제 값은 보건복지부 고시 기반 — 아래는 2025~2026 구간 참고값.
// =========================================================================

// 중위소득 100% (월, 원) — 가구원수별
const MEDIAN_INCOME_100PCT_KRW: Record<number, number> = {
  1: 2_392_013,
  2: 3_932_658,
  3: 5_025_353,
  4: 6_097_773,
  5: 7_108_192,
  6: 8_064_805,
  7: 9_021_417,
};

// 중위소득 60% = 최저생계비 근사
export function minimumLivingCost(householdSize: number): number {
  const size = Math.max(1, Math.min(7, householdSize));
  const base = MEDIAN_INCOME_100PCT_KRW[size];
  if (size < 7) return Math.round(base * 0.6);
  // 7인 초과는 1인당 추가 공제
  const extra = (householdSize - 7) * 956_612;
  return Math.round((MEDIAN_INCOME_100PCT_KRW[7] + extra) * 0.6);
}

// =========================================================================
// 가구원수 계산 (v0.2 §2.5 — 분할산정 로직)
// =========================================================================

export interface HouseholdSizeResult {
  size: number;
  logic: HouseholdSizeLogic;
  breakdown: string;                           // 계산 근거
}

export function calcHouseholdSize(
  dependents: Dependent[],
  spouseHasOwnIncome: boolean,
): HouseholdSizeResult {
  const cohabitingMinors = dependents.filter((d) => d.is_cohabiting && d.is_minor);
  const cohabitingOthers = dependents.filter(
    (d) => d.is_cohabiting && !d.is_minor && !(d.relation === 'spouse'),
  );
  const youngAdultDependents = dependents.filter(
    (d) => d.is_cohabiting && !d.is_minor && d.young_adult_dependent_claim,
  );

  // 분할 산정: 배우자가 경제활동 + 미성년 자녀 존재
  if (spouseHasOwnIncome && cohabitingMinors.length > 0) {
    // 자녀를 배우자와 의뢰인이 나눠 부양한다고 가정 → 본인 + 자녀 절반
    const myChildren = Math.ceil(cohabitingMinors.length / 2);
    const size = 1 + myChildren + cohabitingOthers.length + youngAdultDependents.length;
    return {
      size,
      logic: 'split',
      breakdown: `분할산정: 본인 1 + 자녀 ${myChildren}(${cohabitingMinors.length}명 중 절반) + 기타 ${cohabitingOthers.length} + 성년자녀주장 ${youngAdultDependents.length}`,
    };
  }

  // 표준 산정
  const hasSpouse = dependents.some((d) => d.relation === 'spouse' && d.is_cohabiting);
  const size =
    1 +
    (hasSpouse ? 1 : 0) +
    cohabitingMinors.length +
    cohabitingOthers.length +
    youngAdultDependents.length;
  return {
    size,
    logic: 'standard',
    breakdown: `표준: 본인 1 + 배우자 ${hasSpouse ? 1 : 0} + 자녀 ${cohabitingMinors.length} + 기타 ${cohabitingOthers.length} + 성년자녀주장 ${youngAdultDependents.length}`,
  };
}

// =========================================================================
// 청산가치 (§2.3 파생)
// =========================================================================

export function assetNetValue(asset: Asset): number {
  return Math.max(
    0,
    asset.liquidation_value_krw - asset.exempt_amount_krw - asset.secured_claims_on_asset_krw,
  );
}

export interface LiquidationValueResult {
  total_krw: number;
  per_asset: Array<{ label: string; net_krw: number }>;
}

export function calcLiquidationValue(assets: Asset[]): LiquidationValueResult {
  const per_asset = assets.map((a) => ({
    label: a.label,
    net_krw: assetNetValue(a),
  }));
  const total_krw = per_asset.reduce((sum, a) => sum + a.net_krw, 0);
  return { total_krw, per_asset };
}

// =========================================================================
// 월소득 합산 (세후 기준 — v0.2)
// =========================================================================

export function totalMonthlyIncome(incomes: Income[]): number {
  return incomes.reduce((sum, i) => sum + i.monthly_amount_krw, 0);
}

// =========================================================================
// 가용소득 = 월소득 - 최저생계비 (v0.2: 0 이하 허용)
// =========================================================================

export interface DisposableIncomeResult {
  disposable_income_krw: number;
  total_income_krw: number;
  minimum_living_cost_krw: number;
  household_size: number;
  household_logic: HouseholdSizeLogic;
  is_negative: boolean;
  note: string;
}

export function calcDisposableIncome(
  incomes: Income[],
  dependents: Dependent[],
  spouseHasOwnIncome: boolean,
): DisposableIncomeResult {
  const household = calcHouseholdSize(dependents, spouseHasOwnIncome);
  const total_income = totalMonthlyIncome(incomes);
  const mlc = minimumLivingCost(household.size);
  const disposable = total_income - mlc;
  return {
    disposable_income_krw: disposable,
    total_income_krw: total_income,
    minimum_living_cost_krw: mlc,
    household_size: household.size,
    household_logic: household.logic,
    is_negative: disposable <= 0,
    note:
      disposable <= 0
        ? '가용소득 0 이하 — 알바·취업예정·생활비 절감 주장으로 진행 가능 (v0.2)'
        : '정상 범위',
  };
}

// =========================================================================
// 월변제액 = max(가용소득, 청산가치 ÷ 변제기간)
// =========================================================================

export interface MonthlyPaymentResult {
  monthly_payment_krw: number;
  based_on: 'disposable_income' | 'liquidation_value';
  disposable_income_krw: number;
  liquidation_over_period_krw: number;
  period_months: RepaymentPeriodMonths;
}

export function calcMonthlyPayment(input: {
  disposable_income_krw: number;
  liquidation_value_krw: number;
  period_months: RepaymentPeriodMonths;
}): MonthlyPaymentResult {
  const liqOverPeriod = Math.ceil(input.liquidation_value_krw / input.period_months);
  const disposable = Math.max(0, input.disposable_income_krw);
  const payment = Math.max(disposable, liqOverPeriod);
  return {
    monthly_payment_krw: payment,
    based_on: payment === disposable ? 'disposable_income' : 'liquidation_value',
    disposable_income_krw: disposable,
    liquidation_over_period_krw: liqOverPeriod,
    period_months: input.period_months,
  };
}

// =========================================================================
// 총 무담보채무 (변제율 산정용)
// =========================================================================

export function totalUnsecuredDebt(debts: Debt[]): number {
  return debts
    .filter((d) => d.type === 'general_unsecured' || d.type === 'private_loan')
    .reduce((sum, d) => sum + d.principal_krw + d.interest_krw, 0);
}

// =========================================================================
// 변제율 · 총변제액 · 계획 검증
// =========================================================================

export interface RepaymentPlanCalculation {
  monthly_payment_krw: number;
  total_payment_krw: number;
  repayment_ratio: number;                     // 0~1
  period_months: RepaymentPeriodMonths;
  liquidation_value_krw: number;
  liquidation_value_guaranteed: boolean;       // 청산가치보장
  unsecured_debt_krw: number;
  structure: RepaymentStructure;
}

export function simulateRepaymentPlan(input: {
  incomes: Income[];
  assets: Asset[];
  debts: Debt[];
  dependents: Dependent[];
  spouseHasOwnIncome: boolean;
  period_months: RepaymentPeriodMonths;
  structure?: RepaymentStructure;
}): RepaymentPlanCalculation & {
  disposable: DisposableIncomeResult;
  liquidation: LiquidationValueResult;
} {
  const disposable = calcDisposableIncome(input.incomes, input.dependents, input.spouseHasOwnIncome);
  const liquidation = calcLiquidationValue(input.assets);
  const monthly = calcMonthlyPayment({
    disposable_income_krw: disposable.disposable_income_krw,
    liquidation_value_krw: liquidation.total_krw,
    period_months: input.period_months,
  });

  const total_payment = monthly.monthly_payment_krw * input.period_months;
  const unsecured = totalUnsecuredDebt(input.debts);
  const repayment_ratio = unsecured > 0 ? Math.min(1, total_payment / unsecured) : 0;
  const liquidation_guaranteed = total_payment >= liquidation.total_krw;

  return {
    monthly_payment_krw: monthly.monthly_payment_krw,
    total_payment_krw: total_payment,
    repayment_ratio,
    period_months: input.period_months,
    liquidation_value_krw: liquidation.total_krw,
    liquidation_value_guaranteed: liquidation_guaranteed,
    unsecured_debt_krw: unsecured,
    structure: input.structure ?? 'equal',
    disposable,
    liquidation,
  };
}

// =========================================================================
// 3가지 시나리오 비교 (24 / 36 / 60개월)
// =========================================================================

export function compareRepaymentScenarios(
  input: Omit<Parameters<typeof simulateRepaymentPlan>[0], 'period_months'>,
): RepaymentPlanCalculation[] {
  const periods: RepaymentPeriodMonths[] = [24, 36, 60];
  return periods.map((p) => {
    const { disposable: _d, liquidation: _l, ...rest } = simulateRepaymentPlan({
      ...input,
      period_months: p,
    });
    void _d;
    void _l;
    return rest;
  });
}
