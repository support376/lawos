// 이혼 도메인 — 초기 카탈로그 v0.2
// 민법 제4편 제3장(이혼) + 가사소송법 기반.
// 전략 평가식은 DivorceIntelInput 타입을 사용.

import type { ActivationCondition } from '../../intel-gaps';
import type { DomainOntology, StrategySpec } from '../../core/types';
import { divorceActors } from './actors';

// ============ 이혼 인텔 인풋 ============
export interface DivorceIntelInput {
  // 공통 client 필드 (clients 테이블)
  monthlyIncome: number | null;
  totalDebt: number | null;
  assetsKrw: number;              // 개인 자산 총액
  // 이혼 특수
  marriageYears: number | null;
  separationMonths: number | null;
  childrenCount: number | null;
  youngestChildAge: number | null;
  sharedAssetsKrw: number | null;
  riskFlags: Record<string, boolean>;
  // 진행상황
  mediationAttempted: boolean;
  protectiveOrderActive: boolean;
  affairPartnersCount: number;            // 실제 상간자 actor 수 (autoCreate 제외)
  opposingFaultEvidenceStrength?: 'none' | 'weak' | 'moderate' | 'strong' | null;
  ourFaultDefenseEvidence?: 'none' | 'partial' | 'ready' | null;
}

function cond(key: string, label: string, met: boolean): ActivationCondition {
  return { key, label, met };
}

function allMet(conds: ActivationCondition[]) {
  return conds.every((c) => c.met);
}

// ============ 전략 카탈로그 (12개) ============
const strategies: StrategySpec[] = [
  // --- 공격 ---
  {
    key: 'divorce_fault_aggregation',
    label: '유책사유 축적 (민법 §840)',
    category: 'offensive',
    targetActor: 'opposing_side',
    icon: '⚔️',
    requiredEvidence: ['대화 녹취', '카톡·문자 증거', '제3자 증언', '진단서'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const faultFlags = [
        'infidelity_evidence',
        'domestic_violence',
        'in_law_abuse',
        'economic_abandonment',
        'sex_refusal',
        'religious_imposition',
      ].filter((k) => i.riskFlags[k]);
      const conds: ActivationCondition[] = [
        cond('fault_count_2+', '유책사유 2개 이상 플래그', faultFlags.length >= 2),
        cond('separation_6m', '별거 6개월 이상 또는 다수 정황', (i.separationMonths ?? 0) >= 6 || faultFlags.length >= 3),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? `유책사유 ${faultFlags.length}개 확보. 재판이혼 청구 + 위자료 증액 논리 축적`
            : '유책사유 단일 건은 파탄주의만으론 승산 불안정',
        upside: '재판이혼 승소 + 위자료·재산분할 가중',
        risk: 'low',
      };
    },
  },
  {
    key: 'divorce_property_maximize',
    label: '재산분할 과반 확보',
    category: 'offensive',
    targetActor: 'opposing_side',
    icon: '💰',
    requiredEvidence: ['부동산등기부', '예금잔고증명', '차량등록증', '보험가입증명', '퇴직금추정'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('assets_known', '공동재산 추정값 입력', (i.sharedAssetsKrw ?? 0) > 0),
        cond('marriage_3y+', '혼인 3년 이상 (기여도 인정)', (i.marriageYears ?? 0) >= 3),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? `혼인 ${i.marriageYears}년 × 공동재산 기반. 기여도 50%+ 주장 근거 확보`
            : '혼인기간/재산 정보 부족',
        upside: '재산분할 +10~20% 여지',
        risk: 'medium',
      };
    },
  },
  {
    key: 'divorce_custody_sole',
    label: '친권·양육권 단독 확보',
    category: 'offensive',
    targetActor: 'family_court',
    icon: '👶',
    requiredEvidence: ['양육환경 사진/영상', '학교 생활기록부', '의료기록', '주양육자 진술'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('has_minor_children', '미성년 자녀 존재', (i.childrenCount ?? 0) > 0),
        cond('opposing_fault_present', '상대방 유책 또는 부적격 사유',
          !!(i.riskFlags['domestic_violence'] || i.riskFlags['child_abuse_suspected'] ||
             i.riskFlags['drug_abuse'] || i.riskFlags['gambling_addiction'])),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '상대방 부적격 사유 존재 + 미성년 자녀 보호 필요'
            : '친권은 원칙 공동 — 단독 주장엔 특별사유 필요',
        upside: '단독친권 + 면접교섭 통제',
        risk: 'medium',
      };
    },
  },
  {
    key: 'divorce_affair_suit',
    label: '상간자 손해배상 별소 제기',
    category: 'offensive',
    targetActor: 'affair_partner',
    icon: '⚖️',
    requiredEvidence: ['부정행위 증거 (사진·카톡·숙박기록)', '혼인관계증명서', '상간자 신원정보'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('affair_evidence', '부정행위 증거 플래그', !!i.riskFlags['infidelity_evidence']),
        cond('affair_partner_known', '상간자 등록 (actor 추가)', i.affairPartnersCount >= 1),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '상간자 특정 + 증거 완비. 위자료 1000~3000만원 별소 가능'
            : '상간자 신원·증거 보강 필요',
        upside: '별소 위자료 + 이혼 본소 유책 증폭',
        risk: 'medium',
      };
    },
  },

  // --- 방어 ---
  {
    key: 'divorce_fault_deflection',
    label: '유책 분담·희석 (반대유책 반증)',
    category: 'defensive',
    targetActor: 'family_court',
    icon: '🛡',
    requiredEvidence: ['상대방 유책행위 기록', '혼인유지 노력 증빙', '상대방의 상습유책'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const hasOpposingFault =
        i.opposingFaultEvidenceStrength != null &&
        i.opposingFaultEvidenceStrength !== 'none' &&
        i.opposingFaultEvidenceStrength !== 'weak';
      const hasDefenseReady =
        i.ourFaultDefenseEvidence != null && i.ourFaultDefenseEvidence !== 'none';
      const conds = [
        cond(
          'mutual_fault_signal',
          '상대 유책 증거 확보 또는 방어자료 준비',
          hasOpposingFault || hasDefenseReady,
        ),
      ];
      return {
        conditions: conds,
        reasoning: () => '원고 유책 주장에 대해 상대방 유책·기여 부분 입증 → 위자료 상쇄',
        upside: '위자료 감액 30~70% 가능',
        risk: 'medium',
      };
    },
  },
  {
    key: 'divorce_marriage_intent',
    label: '혼인유지 의사 반증 (파탄 부인)',
    category: 'defensive',
    targetActor: 'family_court',
    icon: '💍',
    requiredEvidence: ['부부치료 이력', '가족여행·기념일 기록', '동거 지속 증거'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('separation_short', '별거 6개월 미만', (i.separationMonths ?? 999) < 6),
        cond('no_major_faults', '중대 유책 없음',
          !i.riskFlags['infidelity_evidence'] && !i.riskFlags['domestic_violence']),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '파탄까지 이르지 않았다는 주장 가능. 이혼청구 기각 시도'
            : '별거 길거나 중대유책 있으면 파탄주의 우세',
        upside: '이혼 기각 또는 조정 유도',
        risk: 'high',
      };
    },
  },

  // --- 합의 ---
  {
    key: 'divorce_mediation_first',
    label: '조정 우선 전략 (가소 §50)',
    category: 'settlement',
    targetActor: 'family_court',
    icon: '🤝',
    requiredEvidence: [],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('no_urgent_danger', '긴급 위해 없음', !i.riskFlags['domestic_violence']),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '조정전치 활용 → 합의 도출시 비용·시간·감정 절약'
            : '폭력 위험시 조정보다 긴급 보전처분 선행',
        upside: '평균 3~6개월 단축 + 감정소모 최소',
        risk: 'low',
      };
    },
  },
  {
    key: 'divorce_consensual_conversion',
    label: '협의이혼 전환 (합의 도달시)',
    category: 'settlement',
    targetActor: 'opposing_side',
    icon: '✍️',
    requiredEvidence: ['재산분할 합의서', '양육비·친권 합의서'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('mediation_done', '조정 시도 완료', i.mediationAttempted),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          '양측 합의점 도달시 법원 협의이혼 전환 → 숙려기간 단축 가능',
        upside: '재판 회피 + 기록 미공개',
        risk: 'low',
      };
    },
  },

  // --- 절차/긴급 ---
  {
    key: 'divorce_protective_order',
    label: '접근금지 가처분 (가정폭력)',
    category: 'preparation',
    targetActor: 'family_court',
    icon: '🚨',
    requiredEvidence: ['폭행 진단서', '112 신고기록', '사진·녹음', '목격자 진술'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('dv_flag', '가정폭력 플래그', !!i.riskFlags['domestic_violence']),
        cond('not_yet_active', '접근금지 미발령', !i.protectiveOrderActive),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '가폭방지법 §55-2 접근금지 긴급결정 신청. 인용률 70%+'
            : '이미 발령됐거나 증거 부족',
        upside: '물리적 분리 + 유책 증거 강화',
        risk: 'low',
      };
    },
  },
  {
    key: 'divorce_asset_freeze',
    label: '재산 가압류·처분금지 보전',
    category: 'preparation',
    targetActor: 'family_court',
    icon: '🔒',
    requiredEvidence: ['부동산등기부', '예금잔고 추정', '재산은닉 정황'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('concealment_risk', '재산은닉 정황 플래그', !!i.riskFlags['hidden_assets_suspected']),
        cond('significant_assets', '공동재산 3억 이상', (i.sharedAssetsKrw ?? 0) >= 300_000_000),
      ];
      return {
        conditions: conds,
        reasoning: (met) =>
          met
            ? '은닉·처분 리스크 + 중대재산. 가압류/처분금지가처분 선제'
            : '자산규모·은닉정황 불충분',
        upside: '분할대상 고정 + 상대 협상력 약화',
        risk: 'medium',
      };
    },
  },
  {
    key: 'divorce_child_interim',
    label: '임시양육자 지정 사전처분',
    category: 'preparation',
    targetActor: 'family_court',
    icon: '🧒',
    requiredEvidence: ['현 양육 실태', '아동학대·방임 증거 (해당시)'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('has_minor_children', '미성년 자녀 존재', (i.childrenCount ?? 0) > 0),
        cond('custody_risk', '아동 위해 또는 탈취 리스크',
          !!i.riskFlags['child_abuse_suspected'] || !!i.riskFlags['domestic_violence']),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          '본안 판결 전 임시양육자 지정으로 아동 안정 + 양육실적 확보',
        upside: '본안 양육권 유리 + 탈취 방지',
        risk: 'low',
      };
    },
  },

  // --- 특수 ---
  {
    key: 'divorce_marriage_invalidation',
    label: '혼인취소·무효 (사기·강박·중혼)',
    category: 'offensive',
    targetActor: 'family_court',
    icon: '❌',
    requiredEvidence: ['사기/강박 증거', '중혼 확인', '의사무능력 기록'],
    evaluate: (input) => {
      const i = input as DivorceIntelInput;
      const conds = [
        cond('invalidation_flag', '혼인무효·취소 사유 플래그', !!i.riskFlags['marriage_fraud']),
      ];
      return {
        conditions: conds,
        reasoning: () =>
          '이혼이 아닌 혼인 자체 무효/취소 → 재산분할·위자료 산정 완전 달라짐 (§816~§825)',
        upside: '혼인 미존재 법적 효과 + 위자료 별도',
        risk: 'high',
      };
    },
  },
];

export const divorceDomain: DomainOntology = {
  caseType: 'divorce',
  label: '이혼',
  version: '0.4.0',
  actors: divorceActors,
  // 사람 속성 (clients 테이블 공유) — 양육비·재산분할 산정 기초
  // 자녀 수는 case_intel.children_count 쪽에서 관리 (이 사건의 혼인 자녀)
  clientFields: [
    { key: 'monthly_income_krw', label: '월 소득', kind: 'number_krw', required: true,
      description: '양육비 산정 · 재산분할 기여도',
      usedBy: ['divorce_custody_sole', 'divorce_property_maximize'] },
    { key: 'total_debt_krw', label: '총 부채', kind: 'number_krw',
      description: '공동채무 여부 판정',
      usedBy: ['divorce_property_maximize'] },
    { key: 'occupation', label: '직업', kind: 'text',
      description: '기여도 비교' },
  ],
  // 사건 특수 (cases.case_intel JSONB)
  caseFields: [
    { key: 'client_position', label: '의뢰인 소송상 지위', kind: 'enum',
      required: true,
      enumValues: [
        { value: 'plaintiff', label: '원고 (제기자)' },
        { value: 'defendant', label: '피고 (응소자)' },
        { value: 'pre_suit', label: '제소 전 (상담·협의 단계)' },
        { value: 'affair_defendant', label: '상간자 손배 피고' },
      ],
      description: '전략의 공수 프레임 결정',
    },
    { key: 'client_relation', label: '의뢰인의 혼인관계 위치', kind: 'enum',
      enumValues: [
        { value: 'spouse', label: '부부 당사자' },
        { value: 'affair_partner', label: '상간자 (제3자)' },
        { value: 'family_member', label: '가족·친족 대리' },
      ],
      description: '의뢰인이 부부 중 한 명인지, 제3자인지',
    },
    { key: 'marriage_years', label: '혼인기간(년)', kind: 'integer', required: true,
      usedBy: ['divorce_property_maximize', 'divorce_marriage_intent'] },
    { key: 'separation_months', label: '별거 개월수', kind: 'integer',
      usedBy: ['divorce_fault_aggregation', 'divorce_marriage_intent'] },
    { key: 'marriage_date', label: '혼인일', kind: 'date' },
    { key: 'children_count', label: '미성년 자녀 수', kind: 'integer',
      usedBy: ['divorce_custody_sole', 'divorce_child_interim'] },
    { key: 'youngest_child_age', label: '막내 자녀 나이', kind: 'integer' },
    { key: 'shared_assets_krw', label: '공동재산 추정', kind: 'number_krw',
      usedBy: ['divorce_property_maximize', 'divorce_asset_freeze'] },
    { key: 'mediation_attempted', label: '조정 시도 여부', kind: 'boolean',
      usedBy: ['divorce_consensual_conversion'] },
    { key: 'protective_order_active', label: '접근금지 발령 상태', kind: 'boolean',
      usedBy: ['divorce_protective_order'] },
  ],
  riskFlags: [
    // 이혼 사유 (민법 §840)
    {
      key: 'sex_refusal',
      label: '성관계 거부',
      tone: 'warn',
      legalBasis: '민법 §840 6호',
      activates: ['divorce_fault_aggregation'],
    },
    {
      key: 'infidelity_evidence',
      label: '부정행위 증거',
      tone: 'danger',
      legalBasis: '민법 §840 1호',
      activates: ['divorce_fault_aggregation', 'divorce_affair_suit'],
    },
    {
      key: 'domestic_violence',
      label: '가정폭력',
      tone: 'danger',
      legalBasis: '민법 §840 3호 · 가폭방지법',
      activates: ['divorce_fault_aggregation', 'divorce_protective_order', 'divorce_custody_sole'],
    },
    {
      key: 'in_law_abuse',
      label: '인척 학대',
      tone: 'warn',
      legalBasis: '민법 §840 3·4호',
      activates: ['divorce_fault_aggregation'],
    },
    {
      key: 'economic_abandonment',
      label: '경제적 유기',
      tone: 'warn',
      legalBasis: '민법 §840 2호',
      activates: ['divorce_fault_aggregation'],
    },
    {
      key: 'religious_imposition',
      label: '종교강요',
      tone: 'warn',
      legalBasis: '민법 §840 6호',
      activates: ['divorce_fault_aggregation'],
    },
    // 자녀 관련
    {
      key: 'child_abuse_suspected',
      label: '아동학대·방임 의심',
      tone: 'danger',
      legalBasis: '아동복지법 §17',
      activates: ['divorce_custody_sole', 'divorce_child_interim'],
    },
    // 중독·정신건강
    {
      key: 'drug_abuse',
      label: '약물 남용',
      tone: 'danger',
      activates: ['divorce_custody_sole'],
    },
    {
      key: 'gambling_addiction',
      label: '도박 중독',
      tone: 'warn',
      activates: ['divorce_custody_sole', 'divorce_fault_aggregation'],
    },
    // 재산
    {
      key: 'hidden_assets_suspected',
      label: '재산 은닉 의심',
      tone: 'danger',
      activates: ['divorce_asset_freeze'],
    },
    // 혼인무효·취소
    {
      key: 'marriage_fraud',
      label: '혼인 사기·강박·중혼 정황',
      tone: 'danger',
      legalBasis: '민법 §815~§825',
      activates: ['divorce_marriage_invalidation'],
    },
    // 외국인
    {
      key: 'foreign_spouse',
      label: '외국인 배우자',
      tone: 'warn',
      legalBasis: '국제사법 §39',
    },
  ],
  strategies,
  counterpartyRoles: [
    { key: 'opposing_side', label: '상대방측',
      typicalWeaknesses: ['유책행위 증거', '경제력 의존', '외도 기록'] },
    { key: 'in_law', label: '시댁/처가',
      typicalWeaknesses: ['학대 증언', '재산 개입 기록'] },
    { key: 'affair_partner', label: '상간자',
      typicalWeaknesses: ['부정행위 증거', '고의·과실 입증'] },
    { key: 'child', label: '자녀 (이해관계인)' },
  ],
  documents: [
    { key: 'marriage_certificate', label: '혼인관계증명서', required: true, source: 'public_record' },
    { key: 'family_certificate', label: '가족관계증명서', required: true, source: 'public_record' },
    { key: 'basic_certificate', label: '기본증명서', required: true, source: 'public_record' },
    { key: 'income_proof', label: '소득금액증명', required: true, source: 'client' },
    { key: 'property_register', label: '부동산등기부등본', required: false, source: 'public_record' },
    { key: 'bank_statement_12m', label: '통장내역 12개월', required: false, source: 'client' },
    { key: 'school_records', label: '자녀 학교 기록', required: false, source: 'client' },
    { key: 'medical_report', label: '진단서·치료기록', required: false, source: 'client' },
    { key: 'violence_photos', label: '폭행·증거 사진', required: false, source: 'client' },
    { key: 'messaging_evidence', label: '카톡·문자 증거', required: false, source: 'client' },
    { key: 'call_records', label: '통화기록', required: false, source: 'client' },
    { key: 'insurance_policy', label: '보험가입증명', required: false, source: 'client' },
  ],
};
