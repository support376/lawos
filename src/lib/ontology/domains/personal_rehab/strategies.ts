// 개인회생 전략 9개 — intel-gaps.ts 하드코딩에서 이관.
// 기존 동작과 동일한 결과를 내야 함.

import type { ActivationCondition } from '../../intel-gaps';
import type { StrategySpec } from '../../core/types';

export interface PersonalRehabIntelInput {
  caseType: string;
  monthlyIncome: number | null;
  totalDebt: number | null;
  dependentsCount: number | null;
  occupation: string | null;
  assetsCount: number;
  riskFlags: Record<string, boolean>;
  preferentialFoundCount: number;
  hasPreferentialAnalysis: boolean;
  hasRepaymentSim: boolean;
  hasEngagementLetter: boolean;
  counterpartiesCount: number;
  currentStage: string | null;
  courtStrictness?: 'very_strict' | 'strict' | 'moderate' | 'flexible';
}

function cond(key: string, label: string, met: boolean): ActivationCondition {
  return { key, label, met };
}

export const personalRehabStrategies: StrategySpec[] = [
  {
    key: 'preemptive_defense',
    label: '편파변제 선제 소명',
    category: 'defensive',
    targetActor: 'court',
    icon: '🛡',
    requiredEvidence: ['통장내역 6개월', '의심거래 영수증', '지급 사유 소명서'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('strict_court', '엄격 법원',
          i.courtStrictness === 'very_strict' || i.courtStrictness === 'strict'),
        cond('analysis_done', '편파변제 분석 완료', i.hasPreferentialAnalysis),
        cond('suspicion_found', '의심거래 존재', i.preferentialFoundCount > 0),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? `${i.preferentialFoundCount}건 의심 + 엄격 법원. 신청 전 소명자료 완비 → 보정명령·기각 회피.`
            : '엄격 법원에서 의심거래 발견시 선제 대응이 핵심',
        upside: '인가 속도 ↑ · 보정명령 회피',
        risk: 'low',
      };
    },
  },
  {
    key: 'creditor_notice_preempt',
    label: '채권자 내용증명 선제 발송',
    category: 'offensive',
    targetActor: 'creditor',
    icon: '📮',
    requiredEvidence: ['채권자 주소지', '채권액 확정'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('creditors_listed', '채권자 명부 등록', i.counterpartiesCount > 0),
        cond('stage_pre_filing', '신청 전 단계',
          i.currentStage === 'document_prep' ||
          i.currentStage === 'creditor_response' ||
          i.currentStage === null),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? `채권자 ${i.counterpartiesCount}명. 신청 전 추심정지 통보 → 추심·가압류 차단`
            : '채권자 등록 후 실행 가능',
        upside: '추심 피해 방지',
        risk: 'low',
      };
    },
  },
  {
    key: 'repayment_negotiate',
    label: '변제율 조정 여력 확보',
    category: 'settlement',
    targetActor: 'court',
    icon: '🤝',
    requiredEvidence: ['변제계획 시뮬 결과', '소득증명'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('sim_done', '변제계획 시뮬 완료', i.hasRepaymentSim),
        cond('income_known', '월 소득 입력', i.monthlyIncome != null),
        cond('debt_known', '총 부채 입력', i.totalDebt != null),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '시뮬 + 재무 완비. 채권자집회 반대 시 즉시 2~5% 증액 여지'
            : '재무/시뮬 데이터 부족',
        upside: '반대 시 신속 인가 (3~6개월 단축)',
        risk: 'medium',
      };
    },
  },
  {
    key: 'asset_audit',
    label: '재산 은닉 반증 자료 구축',
    category: 'preparation',
    targetActor: 'court',
    icon: '🔍',
    requiredEvidence: ['전 계좌 내역', '부동산 등기부', '자산 목록'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('pref_analysis', '편파변제 분석 완료', i.hasPreferentialAnalysis),
        cond('clean_record', '의심거래 0건', i.preferentialFoundCount === 0),
        cond('strict_court', '엄격 법원',
          i.courtStrictness === 'very_strict' || i.courtStrictness === 'strict'),
        cond('assets_declared', '자산 목록 입력', i.assetsCount > 0),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '편파 0건 + 자산목록 + 엄격 법원. "숨긴 게 없다" 입증 자료 선제 준비'
            : '자산 공개 + 분석 완료시 활성화',
        upside: '개시 결정 속도 ↑',
        risk: 'low',
      };
    },
  },
  {
    key: 'high_value_defense',
    label: '고부채 사건 특수 대응 (소득활용 논리)',
    category: 'defensive',
    targetActor: 'court',
    icon: '⚔️',
    requiredEvidence: ['소득증명 전수', '사업소득 내역'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const highDebt = (i.totalDebt ?? 0) >= 500_000_000;
      const highIncome = (i.monthlyIncome ?? 0) >= 5_000_000;
      const conds = [
        cond('high_debt', '부채 5억 이상', highDebt),
        cond('known_income', '소득 입력', i.monthlyIncome != null),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          highIncome
            ? '부채 5억↑ + 월소득 500만↑. 소득 활용 논리로 변제율 방어 가능'
            : '부채 5억↑. 소득 대비 변제율 산정 특수 로직 필요',
        upside: '변제율 30~40% → 15~20% 방어 가능성',
        risk: 'medium',
      };
    },
  },
  {
    key: 'discharge_defense',
    label: '면책불허 리스크 방어',
    category: 'defensive',
    targetActor: 'court',
    icon: '🚨',
    requiredEvidence: ['치료 기록', '단도박/상담 기록', '반성문'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('gambling_flag', '도박/낭비 이력 존재', !!i.riskFlags['gambling_history']),
        cond('retainer_done', '수임 완료', i.hasEngagementLetter),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '도박·낭비 이력 있음. 채무자회생법 §564 면책불허 사유 대응 논리 필요 — 사행성/필요성 구분, 치료의지 입증'
            : '도박 플래그 체크시 활성화',
        upside: '면책 확보 (회생 무의미화 방지)',
        risk: 'high',
      };
    },
  },
  {
    key: 'reapplication_strategy',
    label: '재신청 특수 대응',
    category: 'preparation',
    targetActor: 'court',
    icon: '🔁',
    requiredEvidence: ['이전 면책확정 결정문', '사정변경 증빙'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('prior_flag', '이전 파산/회생 이력 플래그', !!i.riskFlags['prior_bankruptcy']),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          '이전 파산/회생 이력. 면책확정일 7년 경과 여부 + 사정변경 요건 소명 필요 (채무자회생법 §624)',
        upside: '기각 리스크 선제 차단',
        risk: 'medium',
      };
    },
  },
  {
    key: 'voluntary_disclosure',
    label: '은닉 의심 자산 선제 자진 공개',
    category: 'defensive',
    targetActor: 'court',
    icon: '📤',
    requiredEvidence: ['자산 전수 목록', '취득경위 소명서'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('concealment_flag', '은닉 정황 플래그', !!i.riskFlags['asset_concealment']),
        cond('assets_declared', '자산 목록 입력', i.assetsCount > 0),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          '재산 은닉 정황 플래그. 법원 조사 전 자진 공개 → 악의적 은닉 부정 + 감면 가능성 (§643)',
        upside: '면책불허 회피 + 심사위원 신뢰도 확보',
        risk: 'medium',
      };
    },
  },
  {
    key: 'parallel_suit_mgmt',
    label: '병행소송 영향 평가',
    category: 'preparation',
    targetActor: 'court',
    icon: '⚖️',
    requiredEvidence: ['병행소송 현황표', '예상 결과 시뮬'],
    evaluate: (input) => {
      const i = input as PersonalRehabIntelInput;
      const conds = [
        cond('parallel_flag', '병행소송 플래그', !!i.riskFlags['other_active_suits']),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          '다른 소송 병행 플래그. 승·패 시 변제능력 변동 시뮬레이션 + 법원 사전고지 검토',
        upside: '변수 통제 + 법원에 성실성 어필',
        risk: 'low',
      };
    },
  },
];
