// 개인회생 절차 상태머신 (v0.2 §4)
// 10개 주 단계 + 3개 우회(기각·즉시항고·기각취소) + 분기(면책/폐지/변경)

import type { StageKey, StageTransition, ActorType } from './entities';

// =========================================================================
// Stage 메타데이터
// =========================================================================

export interface StageMeta {
  key: StageKey;
  label: string;
  description: string;
  phase: 'pre_filing' | 'filing_review' | 'post_opening' | 'repayment' | 'closing';
  typical_duration_days: number | null;
  primary_actor: ActorType;
  has_precedent_lookup: boolean;
  has_communication: boolean;
  is_bypass: boolean;                          // 기각 우회 경로 소속
}

export const STAGES: Record<StageKey, StageMeta> = {
  consultation: {
    key: 'consultation',
    label: '상담',
    description: '유사 사례 조회, 의뢰인 초기 진단',
    phase: 'pre_filing',
    typical_duration_days: 3,
    primary_actor: 'attorney',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: false,
  },
  engagement: {
    key: 'engagement',
    label: '수임',
    description: '위임계약 · 수임료 · 추심 제한 효과 고지',
    phase: 'pre_filing',
    typical_duration_days: 7,
    primary_actor: 'attorney',
    has_precedent_lookup: false,
    has_communication: true,
    is_bypass: false,
  },
  document_prep: {
    key: 'document_prep',
    label: '서류준비',
    description: '채무자↔대리인 반복 소통. 증빙 수집 완성도가 보정 빈도 좌우.',
    phase: 'pre_filing',
    typical_duration_days: 30,
    primary_actor: 'attorney',
    has_precedent_lookup: false,
    has_communication: true,
    is_bypass: false,
  },
  filing: {
    key: 'filing',
    label: '신청접수',
    description: '인지대·송달료 납부. 중지·금지명령 병행 가능.',
    phase: 'filing_review',
    typical_duration_days: 3,
    primary_actor: 'attorney',
    has_precedent_lookup: false,
    has_communication: false,
    is_bypass: false,
  },
  correction_loop: {
    key: 'correction_loop',
    label: '보정 루프',
    description: '법원↔대리인. 1차는 서류 보완, 2·3차로 갈수록 실체적 쟁점(가용소득·재산 평가).',
    phase: 'filing_review',
    typical_duration_days: 21,
    primary_actor: 'attorney',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: false,
  },
  dismissal: {
    key: 'dismissal',
    label: '기각',
    description: '법원 실수 또는 보정 과정에서의 마찰로 간혹 발생 (v0.2 신규)',
    phase: 'filing_review',
    typical_duration_days: null,
    primary_actor: 'court',
    has_precedent_lookup: true,
    has_communication: false,
    is_bypass: true,
  },
  immediate_appeal: {
    key: 'immediate_appeal',
    label: '즉시항고',
    description: '기각 결정에 대한 항고. 판례 근거 중요. (v0.2 신규)',
    phase: 'filing_review',
    typical_duration_days: 14,
    primary_actor: 'attorney',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: true,
  },
  dismissal_revoked: {
    key: 'dismissal_revoked',
    label: '기각취소',
    description: '상급심의 취소 결정 후 개시결정으로 복귀 (v0.2 신규)',
    phase: 'filing_review',
    typical_duration_days: null,
    primary_actor: 'court',
    has_precedent_lookup: false,
    has_communication: true,
    is_bypass: true,
  },
  opening_decision: {
    key: 'opening_decision',
    label: '개시결정',
    description: '결정 송달 수령. 채권자에 대한 추심 본격 금지.',
    phase: 'post_opening',
    typical_duration_days: 14,
    primary_actor: 'court',
    has_precedent_lookup: false,
    has_communication: true,
    is_bypass: false,
  },
  claim_filing: {
    key: 'claim_filing',
    label: '채권신고·조사',
    description: '채권자↔법원 신고. 대리인이 이의 대응.',
    phase: 'post_opening',
    typical_duration_days: 30,
    primary_actor: 'creditor',
    has_precedent_lookup: false,
    has_communication: true,
    is_bypass: false,
  },
  creditor_meeting: {
    key: 'creditor_meeting',
    label: '채권자집회',
    description: '이의 대응 논리에 판례 필요.',
    phase: 'post_opening',
    typical_duration_days: 1,
    primary_actor: 'trustee',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: false,
  },
  plan_approval: {
    key: 'plan_approval',
    label: '변제계획 인가',
    description: '인가 요건 해석에 판례 활용.',
    phase: 'post_opening',
    typical_duration_days: 30,
    primary_actor: 'court',
    has_precedent_lookup: true,
    has_communication: false,
    is_bypass: false,
  },
  repayment: {
    key: 'repayment',
    label: '변제수행',
    description: '회생위원↔채무자 월 단위 소통. 변경 시 판례 근거 필요.',
    phase: 'repayment',
    typical_duration_days: null,                // 24·36·60개월 이어지므로
    primary_actor: 'trustee',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: false,
  },
  modification: {
    key: 'modification',
    label: '계획 변경',
    description: '소득변동 등으로 변제계획 변경 필요',
    phase: 'repayment',
    typical_duration_days: 30,
    primary_actor: 'attorney',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: false,
  },
  discharge: {
    key: 'discharge',
    label: '면책',
    description: '면책 결정 통지. 종결.',
    phase: 'closing',
    typical_duration_days: 14,
    primary_actor: 'court',
    has_precedent_lookup: false,
    has_communication: true,
    is_bypass: false,
  },
  termination: {
    key: 'termination',
    label: '폐지',
    description: '변제 실패 시. 폐지 방어 논리에 판례 필수.',
    phase: 'closing',
    typical_duration_days: null,
    primary_actor: 'court',
    has_precedent_lookup: true,
    has_communication: true,
    is_bypass: false,
  },
};

// =========================================================================
// 상태 전이 그래프
// =========================================================================

export const TRANSITIONS: StageTransition[] = [
  // 정상 경로
  { from: 'consultation', to: 'engagement', condition: '수임 결정' },
  { from: 'engagement', to: 'document_prep', condition: '수임계약 체결' },
  { from: 'document_prep', to: 'filing', condition: '필수 서류 수집 완료' },
  { from: 'filing', to: 'correction_loop', condition: '법원 보정 권고' },
  { from: 'filing', to: 'opening_decision', condition: '보정 없이 개시' },
  { from: 'correction_loop', to: 'correction_loop', condition: '다음 회차 보정' },
  { from: 'correction_loop', to: 'opening_decision', condition: '보정 완료 후 개시' },

  // 기각 우회 경로 (v0.2)
  { from: 'correction_loop', to: 'dismissal', condition: '보정 실패·법원 기각', is_bypass: true },
  { from: 'filing', to: 'dismissal', condition: '즉시 기각', is_bypass: true },
  { from: 'dismissal', to: 'immediate_appeal', condition: '항고 결정', is_bypass: true },
  { from: 'immediate_appeal', to: 'dismissal_revoked', condition: '상급심 취소', is_bypass: true },
  { from: 'dismissal_revoked', to: 'opening_decision', condition: '개시결정으로 복귀', is_bypass: true },

  // 개시 이후
  { from: 'opening_decision', to: 'claim_filing', condition: '개시결정 송달 완료' },
  { from: 'claim_filing', to: 'creditor_meeting', condition: '신고기간 종료' },
  { from: 'creditor_meeting', to: 'plan_approval', condition: '집회 후 인가 심리' },
  { from: 'plan_approval', to: 'repayment', condition: '인가결정 확정' },

  // 변제수행 중
  { from: 'repayment', to: 'modification', condition: '소득변동·변경사유' },
  { from: 'modification', to: 'repayment', condition: '변경 인가' },
  { from: 'repayment', to: 'termination', condition: '변제 실패 3개월 이상' },
  { from: 'repayment', to: 'discharge', condition: '변제 완료 (24/36/60개월)' },
];

// =========================================================================
// 유틸
// =========================================================================

export function getPossibleNextStages(current: StageKey): StageKey[] {
  return TRANSITIONS.filter((t) => t.from === current).map((t) => t.to);
}

export function getStageMeta(key: StageKey): StageMeta {
  return STAGES[key];
}

export function isTerminalStage(key: StageKey): boolean {
  return key === 'discharge' || key === 'termination';
}

export function getStagesByPhase(phase: StageMeta['phase']): StageMeta[] {
  return Object.values(STAGES).filter((s) => s.phase === phase);
}
