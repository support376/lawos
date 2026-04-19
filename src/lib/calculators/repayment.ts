// 개인회생 변제계획 시뮬레이션 (법정 기준)
// 2024년 기준, 실제 적용 전 법정 한도 수치 재확인 필수.

// 기준중위소득 (2024년 기준, 월 기준, 원 단위)
const MEDIAN_INCOME_2024 = [
  0,
  2_228_445, // 1인
  3_682_609, // 2인
  4_714_657, // 3인
  5_729_913, // 4인
  6_695_735, // 5인
  7_618_369, // 6인
  8_514_994, // 7인
];

// 개인회생: 월 변제액 = 소득 - 생계비
// 생계비 = 기준중위소득 × 60% (부양가족 포함)
// 총 변제액 = 월 변제액 × 36 (3년) 또는 60 (5년, 예외)

export interface RepaymentInput {
  monthlyIncome: number;      // 월 소득 (세후)
  familySize: number;         // 본인 포함 가구원 수 (1~7)
  totalDebt: number;          // 무담보 채무 총액
  assetValue?: number;        // 청산가치 (재산 매각 시 가치)
  planYears?: 3 | 5;          // 변제 기간 (기본 3년)
}

export interface RepaymentResult {
  plan_years: number;
  living_cost_monthly: number;   // 생계비 (법정)
  disposable_monthly: number;    // 가처분 소득 = 월 변제액
  total_repayment: number;       // 총 변제액
  repayment_ratio: number;       // 총변제액 / 총채무 (%)
  liquidation_value: number;     // 청산가치 (참고)
  passes_liquidation_test: boolean; // 청산가치 보장원칙 통과 여부
  notes: string[];
}

export function simulateRepayment(input: RepaymentInput): RepaymentResult {
  const familyIdx = Math.max(1, Math.min(7, input.familySize));
  const median = MEDIAN_INCOME_2024[familyIdx];
  const livingCost = Math.round(median * 0.6); // 60%
  const disposable = Math.max(0, input.monthlyIncome - livingCost);
  const planYears = input.planYears ?? 3;
  const months = planYears * 12;
  const totalRepayment = disposable * months;
  const ratio = input.totalDebt > 0 ? (totalRepayment / input.totalDebt) * 100 : 0;
  const liquidationValue = input.assetValue ?? 0;
  const passes = totalRepayment >= liquidationValue;

  const notes: string[] = [];
  if (disposable <= 0) {
    notes.push(
      '⚠ 가처분소득이 0 이하입니다. 현재 소득으론 개인회생 신청 요건 미달. 파산 검토 권장.',
    );
  }
  if (!passes) {
    notes.push(
      `⚠ 청산가치(${liquidationValue.toLocaleString()}원) > 예상 변제액(${totalRepayment.toLocaleString()}원). 청산가치 보장원칙 위배.`,
    );
  }
  if (planYears === 5) {
    notes.push('5년 변제는 예외적 사유가 있을 때만 가능 (소득 부족 등).');
  }
  if (ratio < 5) {
    notes.push('변제율이 매우 낮음 (5% 미만). 법원이 인가 안 할 가능성 있음.');
  }

  return {
    plan_years: planYears,
    living_cost_monthly: livingCost,
    disposable_monthly: disposable,
    total_repayment: totalRepayment,
    repayment_ratio: Math.round(ratio * 10) / 10,
    liquidation_value: liquidationValue,
    passes_liquidation_test: passes,
    notes,
  };
}
