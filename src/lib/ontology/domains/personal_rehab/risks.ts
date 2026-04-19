// 개인회생 리스크 스크리닝 + 단축계획 자격 + 적합절차 분기 (v0.2 §7)

import type {
  Debtor,
  DebtorRiskFlags,
  DebtorShorteningEligibility,
  JobType,
} from './entities';

// =========================================================================
// 7.2 리스크 스크리닝 (7개 플래그)
// =========================================================================

export type RiskLevel = 'red' | 'yellow';

export interface RiskFlag {
  key: keyof DebtorRiskFlags | 'has_prior_discharge_within_5y';
  label: string;
  level: RiskLevel;
  description: string;
  response: string;
  isActive: (debtor: Debtor) => boolean;
}

export const RISK_FLAGS: RiskFlag[] = [
  {
    key: 'recent_loan_within_3m',
    label: '최근 3개월 내 대출 발생',
    level: 'red',
    description: '사기죄 고소 위험',
    response: '대출 목적·채무 규모·변제 의사 시점 면밀 검토',
    isActive: (d) => d.risks.recent_loan_within_3m,
  },
  {
    key: 'preferential_transfer_risk',
    label: '편파변제 있음',
    level: 'yellow',
    description: '부인권 대상 가능',
    response: '부인권 대상 검토 및 전략 조정',
    isActive: (d) => d.risks.preferential_transfer_risk,
  },
  {
    key: 'fraudulent_transfer_risk',
    label: '최근 재산 처분',
    level: 'yellow',
    description: '사해행위 성립 여부',
    response: '사해행위 성립 여부 검토',
    isActive: (d) => d.risks.fraudulent_transfer_risk,
  },
  {
    key: 'has_guarantor',
    label: '보증인 존재',
    level: 'yellow',
    description: '연대채무 유지 · 보증인 영향',
    response: '연대채무 유지 고지 · 보증인 대응 전략 수립',
    isActive: (d) => d.risks.has_guarantor,
  },
  {
    key: 'has_prior_discharge_within_5y',
    label: '면책 후 5년 이내 재신청',
    level: 'red',
    description: '재신청 제한 (v0.2: 7년 → 5년)',
    response: '파산면책 검토 등 대안',
    isActive: (d) => d.eligibility.has_prior_discharge_within_5y,
  },
  {
    key: 'has_tax_arrears',
    label: '국세 체납',
    level: 'yellow',
    description: '우선변제 채권',
    response: '별도 변제 계획 필요',
    isActive: (d) => d.risks.has_tax_arrears,
  },
  {
    key: 'has_insurance_arrears',
    label: '4대보험 체납',
    level: 'yellow',
    description: '우선변제 채권',
    response: '별도 변제 계획 필요',
    isActive: (d) => d.risks.has_insurance_arrears,
  },
  {
    key: 'has_criminal_case',
    label: '형사사건 진행 중',
    level: 'red',
    description: '우선변제 채권 (실질 리스크)',
    response: '형사 채권자는 실질 리스크. 절차 영향 큼.',
    isActive: (d) => d.risks.has_criminal_case,
  },
];

export interface RiskScreeningResult {
  flags: RiskFlag[];
  reds: RiskFlag[];
  yellows: RiskFlag[];
  has_red: boolean;
  summary: string;
}

export function screenRisks(debtor: Debtor): RiskScreeningResult {
  const active = RISK_FLAGS.filter((f) => f.isActive(debtor));
  const reds = active.filter((f) => f.level === 'red');
  const yellows = active.filter((f) => f.level === 'yellow');
  return {
    flags: active,
    reds,
    yellows,
    has_red: reds.length > 0,
    summary:
      active.length === 0
        ? '리스크 없음'
        : `🔴 ${reds.length} · 🟡 ${yellows.length}`,
  };
}

// =========================================================================
// 2.7 단축계획(24개월) 자격 판정 (6가지 중 하나라도 충족)
// =========================================================================

export interface ShorteningEligibilityResult {
  is_eligible: boolean;
  reasons: Array<{
    key: keyof DebtorShorteningEligibility;
    label: string;
  }>;
}

const SHORTENING_LABELS: Record<keyof DebtorShorteningEligibility, string> = {
  is_under_30: '만 30세 미만',
  is_over_65: '만 65세 이상',
  is_single_parent: '한부모 가정',
  has_2plus_minor_children: '미성년 자녀 2명 이상 양육',
  is_jeonse_fraud_victim: '전세사기 피해자',
  is_severely_disabled: '중증 장애인',
};

export function checkShorteningEligibility(
  debtor: Debtor,
): ShorteningEligibilityResult {
  const reasons: Array<{ key: keyof DebtorShorteningEligibility; label: string }> = [];
  for (const [k, v] of Object.entries(debtor.shortening)) {
    if (v) {
      reasons.push({
        key: k as keyof DebtorShorteningEligibility,
        label: SHORTENING_LABELS[k as keyof DebtorShorteningEligibility],
      });
    }
  }
  return {
    is_eligible: reasons.length > 0,
    reasons,
  };
}

// =========================================================================
// 2.1 적격성 판정 (개인회생 신청 가능 여부)
// =========================================================================

export interface EligibilityResult {
  is_eligible: boolean;
  blockers: string[];
  warnings: string[];
}

export function checkEligibility(debtor: Debtor): EligibilityResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (debtor.eligibility.has_prior_discharge_within_5y) {
    blockers.push('면책 후 5년 이내 재신청 (채무자회생법상 제한)');
  }
  if (!debtor.eligibility.unsecured_debt_cap_ok) {
    blockers.push('무담보 채무 10억 초과 → 일반회생 검토');
  }
  if (!debtor.eligibility.secured_debt_cap_ok) {
    blockers.push('담보 채무 15억 초과 → 일반회생 검토');
  }
  if (!debtor.eligibility.has_regular_income) {
    warnings.push('정기적·확실한 수입 부재 — 알바·취업예정·생활비 절감 주장 필요');
  }

  return {
    is_eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}

// =========================================================================
// 7.1 적합 절차 분기 (상담 단계)
// =========================================================================

export type SuitableProcedure =
  | 'personal_rehab'
  | 'bankruptcy_discharge'
  | 'general_rehab'
  | 'small_business_rehab'
  | 'private_workout';                         // 신복위·사적조정

export interface ProcedureRecommendation {
  primary: SuitableProcedure;
  alternatives: SuitableProcedure[];
  reasoning: string;
}

const JOB_TYPE_LABELS: Record<JobType, string> = {
  earned: '근로소득자',
  business: '사업소득자',
  freelance: '프리랜서',
  unemployed: '무직',
};

export function recommendProcedure(
  debtor: Debtor,
  totalUnsecuredDebtKrw: number,
): ProcedureRecommendation {
  // 소득 없음 → 파산면책
  const hasAnyIncome = debtor.job_types.some((j) => j !== 'unemployed');
  if (!hasAnyIncome) {
    return {
      primary: 'bankruptcy_discharge',
      alternatives: [],
      reasoning: '소득 부재로 개인회생 요건 미충족 — 파산면책 검토',
    };
  }

  // 한도 초과 → 일반회생
  if (!debtor.eligibility.unsecured_debt_cap_ok || !debtor.eligibility.secured_debt_cap_ok) {
    return {
      primary: 'general_rehab',
      alternatives: ['bankruptcy_discharge'],
      reasoning: '채무 한도 초과 (무담보 10억/담보 15억)',
    };
  }

  // 소액·상환여력 양호 → 신복위·사적조정
  if (totalUnsecuredDebtKrw < 50_000_000 && debtor.eligibility.has_regular_income) {
    return {
      primary: 'private_workout',
      alternatives: ['personal_rehab'],
      reasoning: '소액채무·상환여력 양호 — 신복위 등 사적조정 우선',
    };
  }

  // 사업소득자 → 개인회생 (소액영업소득자 옵션 병행)
  const jobLabels = debtor.job_types.map((j) => JOB_TYPE_LABELS[j]).join('·');
  if (debtor.job_types.includes('business')) {
    return {
      primary: 'personal_rehab',
      alternatives: ['small_business_rehab'],
      reasoning: `소득 유형: ${jobLabels} — 개인회생 기본, 소액영업소득자 옵션 검토`,
    };
  }

  return {
    primary: 'personal_rehab',
    alternatives: [],
    reasoning: `소득 유형: ${jobLabels} — 개인회생 기본 경로`,
  };
}
