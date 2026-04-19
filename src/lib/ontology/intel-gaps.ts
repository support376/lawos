// 의뢰인 인텔 → 전략 활성화
// v2: 하드코딩 대신 domain registry + evaluate-domain 사용.
// 기존 API(IntelSnapshot, analyzeIntel) 유지 → page.tsx 변경 최소화.

import type { WorkflowDocs } from './types';
import { getDomain } from './registry';
import { evaluateDomain } from './engine/evaluate-domain';
import type { PersonalRehabIntelInput } from './domains/personal_rehab/strategies';
import type { DivorceIntelInput } from './domains/divorce';

// ============ 타입 (외부 공개 유지) ============
export interface ActivationCondition {
  key: string;
  label: string;
  met: boolean;
}

export interface StrategicOption {
  key: string;
  label: string;
  category: 'offensive' | 'defensive' | 'settlement' | 'preparation';
  icon?: string;
  reasoning: string;
  risk: 'low' | 'medium' | 'high';
  upside: string;
  requirements_met: boolean;
  blocked_by?: string;
  activation_conditions: ActivationCondition[];
  /** 이 전략이 겨냥하는 Actor의 role key */
  targetActor?: string;
}

export interface IntelSnapshot {
  intel: {
    financial_completeness: number;
    documents_completeness: number;
    overall_completeness: number;
    missing_fields: string[];
  };
  strategy: {
    situation_summary: string;
    available_tactics: StrategicOption[];
    locked_tactics: StrategicOption[];
    critical_decisions?: string[];
  };
}

// ============ 인풋 (공용 + 도메인별 상속 확장) ============
export interface IntelInput {
  caseType: string;
  hasClient: boolean;
  hasCourtInfo: boolean;
  hasRetainerDate: boolean;
  // 재무
  monthlyIncome: number | null;
  totalDebt: number | null;
  dependentsCount: number | null;
  occupation: string | null;
  assetsCount: number;
  // 위험
  riskFlags: Record<string, boolean>;
  preferentialFoundCount: number;
  hasPreferentialAnalysis: boolean;
  hasRepaymentSim: boolean;
  hasEngagementLetter: boolean;
  // 상대·절차
  counterpartiesCount: number;
  workflowDocs: WorkflowDocs;
  requiredDocKeys: string[];
  currentStage: string | null;
  daysSinceRetainer: number;
  courtStrictness?: 'very_strict' | 'strict' | 'moderate' | 'flexible';
  // 이혼 특화 (선택)
  marriageYears?: number | null;
  separationMonths?: number | null;
  childrenCount?: number | null;
  youngestChildAge?: number | null;
  sharedAssetsKrw?: number | null;
  mediationAttempted?: boolean;
  protectiveOrderActive?: boolean;
}

// ============ 인풋 어댑터 ============
function toPersonalRehabInput(input: IntelInput): PersonalRehabIntelInput {
  return {
    caseType: input.caseType,
    monthlyIncome: input.monthlyIncome,
    totalDebt: input.totalDebt,
    dependentsCount: input.dependentsCount,
    occupation: input.occupation,
    assetsCount: input.assetsCount,
    riskFlags: input.riskFlags,
    preferentialFoundCount: input.preferentialFoundCount,
    hasPreferentialAnalysis: input.hasPreferentialAnalysis,
    hasRepaymentSim: input.hasRepaymentSim,
    hasEngagementLetter: input.hasEngagementLetter,
    counterpartiesCount: input.counterpartiesCount,
    currentStage: input.currentStage,
    courtStrictness: input.courtStrictness,
  };
}

function toDivorceInput(input: IntelInput): DivorceIntelInput {
  return {
    monthlyIncome: input.monthlyIncome,
    totalDebt: input.totalDebt,
    assetsKrw: input.assetsCount, // 카운트는 임시. 향후 실 금액 합으로 교체 예정.
    marriageYears: input.marriageYears ?? null,
    separationMonths: input.separationMonths ?? null,
    childrenCount: input.childrenCount ?? null,
    youngestChildAge: input.youngestChildAge ?? null,
    sharedAssetsKrw: input.sharedAssetsKrw ?? null,
    riskFlags: input.riskFlags,
    mediationAttempted: input.mediationAttempted ?? false,
    protectiveOrderActive: input.protectiveOrderActive ?? false,
    counterpartiesCount: input.counterpartiesCount,
  };
}

function adaptInput(input: IntelInput): unknown {
  switch (input.caseType) {
    case 'personal_rehab':
      return toPersonalRehabInput(input);
    case 'divorce':
      return toDivorceInput(input);
    default:
      return input;
  }
}

// ============ 메인 함수 ============
export function analyzeIntel(input: IntelInput): IntelSnapshot {
  // 인텔 완성도
  const financialFields: Array<[string, unknown]> = [
    ['월 소득', input.monthlyIncome],
    ['총 부채', input.totalDebt],
    ['부양가족', input.dependentsCount],
    ['직업', input.occupation],
  ];
  const financialFilled = financialFields.filter(([, v]) => v != null && v !== '').length;
  const financialPct = Math.round((financialFilled / financialFields.length) * 100);

  const required = input.requiredDocKeys;
  const received = required.filter(
    (k) => input.workflowDocs[k]?.status === 'received',
  ).length;
  const docsPct = required.length > 0 ? Math.round((received / required.length) * 100) : 0;

  const missing: string[] = [];
  for (const [name, v] of financialFields) {
    if (v == null || v === '') missing.push(name);
  }
  if (required.length > 0 && received < required.length) {
    missing.push(`필수 서류 ${required.length - received}건`);
  }
  if (input.counterpartiesCount === 0 && input.caseType === 'personal_rehab') {
    missing.push('채권자 명부');
  }

  const overallPct =
    required.length > 0
      ? Math.round((financialPct + docsPct) / 2)
      : financialPct;

  // 도메인 기반 전략 평가
  const domain = getDomain(input.caseType);
  const domainInput = domain ? adaptInput(input) : null;
  const evalResult =
    domain && domainInput
      ? evaluateDomain(domain, domainInput)
      : { available: [], locked: [] };

  // 도메인별 critical_decisions
  const critical: string[] = [];
  if (input.caseType === 'personal_rehab') {
    if (
      input.hasPreferentialAnalysis &&
      input.preferentialFoundCount > 0 &&
      (input.courtStrictness === 'very_strict' || input.courtStrictness === 'strict')
    ) {
      critical.push('각 의심 거래의 해명자료 수준 결정 (영수증/문자/증빙)');
    }
  }

  // 상황 요약
  const parts: string[] = [];
  if (input.courtStrictness) {
    const l =
      input.courtStrictness === 'very_strict'
        ? '매우 엄격'
        : input.courtStrictness === 'strict'
          ? '엄격'
          : input.courtStrictness === 'moderate'
            ? '일반'
            : '유연';
    parts.push(`${l} 법원`);
  }
  parts.push(`인텔 ${overallPct}%`);
  if (input.preferentialFoundCount > 0)
    parts.push(`🔴 의심거래 ${input.preferentialFoundCount}건`);
  if (input.counterpartiesCount > 0)
    parts.push(`상대 ${input.counterpartiesCount}명`);
  if (input.daysSinceRetainer > 0) parts.push(`수임 ${input.daysSinceRetainer}일`);

  return {
    intel: {
      financial_completeness: financialPct,
      documents_completeness: docsPct,
      overall_completeness: overallPct,
      missing_fields: missing,
    },
    strategy: {
      situation_summary: parts.join(' · '),
      available_tactics: evalResult.available,
      locked_tactics: evalResult.locked,
      critical_decisions: critical.length > 0 ? critical : undefined,
    },
  };
}
