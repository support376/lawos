// 이혼 Actor 구성 — 우리측/상대방측 대칭.
// 의뢰인이 반드시 부부 당사자라고 가정하지 않음 (상간자 피고 등 제3자 대응 가능).
// 의뢰인 "기본정보·재무·위험신호"는 clients 테이블(ClientProfile)에서 관리.
// our_side actor는 "자기진단·협상 전략 필드"만 담당 (case_counterparties.profile JSONB).

import type { ActorRoleSpec } from '../../core/types';

export const divorceActors: ActorRoleSpec[] = [
  {
    role: 'our_side',
    label: '우리측 (의뢰인)',
    weight: 'primary',
    cardinality: 'single',
    adversarial: false,
    persuasive: false,
    icon: '🤝',
    description:
      '대리하는 당사자의 전략 자기진단. 재무는 ClientProfile에서 관리. 여기엔 "상대가 공격할 약점·협상 의향·보유 증거 준비도"를 기록.',
    autoCreate: true,
    intelSchema: [
      {
        key: 'total_assets_krw',
        label: '우리측 총 자산',
        kind: 'number_krw',
        description: '부동산·예금·주식·사업지분 (재산분할 기여도 산정)',
        usedBy: ['divorce_property_maximize'],
      },
      {
        key: 'hidden_assets_risk',
        label: '자산 은닉 의심 (자기진단)',
        kind: 'enum',
        enumValues: [
          { value: 'none', label: '없음' },
          { value: 'suspected', label: '의심 소지' },
          { value: 'evident', label: '존재' },
        ],
        description: '상대가 우리를 상대로 주장할 수 있는 은닉 리스크',
      },
      {
        key: 'fault_evidence_against_me',
        label: '상대가 주장 가능한 우리측 유책',
        kind: 'enum',
        enumValues: [
          { value: 'none', label: '없음' },
          { value: 'weak', label: '정황' },
          { value: 'moderate', label: '다수 정황' },
          { value: 'strong', label: '직접 증거' },
        ],
        description: '상대가 제시할 수 있는 유책 수준 (방어 논리 준비용)',
        usedBy: ['divorce_fault_deflection'],
      },
      {
        key: 'fault_evidence_held',
        label: '우리가 보유한 상대 유책 증거',
        kind: 'enum',
        enumValues: [
          { value: 'none', label: '없음' },
          { value: 'weak', label: '정황' },
          { value: 'moderate', label: '다수 정황' },
          { value: 'strong', label: '직접 증거' },
        ],
        description: '상대 공격용 — 녹취·카톡·사진 등 확보 정도',
        usedBy: ['divorce_fault_aggregation'],
      },
      {
        key: 'my_dv_allegation_risk',
        label: '상대의 폭력 허위주장 리스크',
        kind: 'boolean',
        description: '상대가 우리를 향해 폭력을 주장할 가능성',
      },
      {
        key: 'cooperation_intent',
        label: '우리측 협상 의향',
        kind: 'enum',
        enumValues: [
          { value: 'fight', label: '끝까지 다툼' },
          { value: 'balanced', label: '조건부 협상' },
          { value: 'settle_soon', label: '빠른 합의 선호' },
        ],
        usedBy: ['divorce_mediation_first', 'divorce_consensual_conversion'],
      },
      {
        key: 'personality_notes',
        label: '우리측 감정·성격 메모',
        kind: 'text',
        description: '법정 대응력·감정기복 등 전략 참고',
      },
      {
        key: 'work_stability',
        label: '우리측 직장·소득 안정성',
        kind: 'enum',
        enumValues: [
          { value: 'stable', label: '안정' },
          { value: 'unstable', label: '불안정' },
          { value: 'unemployed', label: '무직' },
        ],
        usedBy: ['divorce_custody_sole'],
      },
      {
        key: 'fault_defense_evidence',
        label: '유책 방어자료 보유',
        kind: 'enum',
        enumValues: [
          { value: 'none', label: '없음' },
          { value: 'partial', label: '일부' },
          { value: 'ready', label: '준비 완료' },
        ],
        usedBy: ['divorce_fault_deflection'],
      },
    ],
  },
  {
    role: 'opposing_side',
    label: '상대방측',
    weight: 'primary',
    cardinality: 'single',
    adversarial: true,
    persuasive: false,
    icon: '💔',
    description:
      '재판상 직접 상대. 부부 당사자인 경우 배우자, 상간자 별소시 배우자측.',
    autoCreate: true,
    intelSchema: [
      {
        key: 'estimated_monthly_income_krw',
        label: '상대 추정 월소득',
        kind: 'number_krw',
        description: '재산분할·양육비 산정. 급여/사업소득',
        usedBy: ['divorce_property_maximize', 'divorce_custody_sole'],
      },
      {
        key: 'estimated_total_assets_krw',
        label: '상대 추정 총자산',
        kind: 'number_krw',
        description: '부동산·예금·주식·사업 지분',
        usedBy: ['divorce_property_maximize', 'divorce_asset_freeze'],
      },
      {
        key: 'hidden_assets_suspicion',
        label: '상대의 재산 은닉 정황',
        kind: 'enum',
        enumValues: [
          { value: 'none', label: '없음' },
          { value: 'suspected', label: '의심' },
          { value: 'evidence', label: '증거확보' },
        ],
        usedBy: ['divorce_asset_freeze'],
      },
      {
        key: 'lawyer_retained',
        label: '상대 변호사 선임 여부',
        kind: 'boolean',
        description: '협상 난이도 판단',
      },
      {
        key: 'cooperation_level',
        label: '상대 협상 협조도',
        kind: 'enum',
        enumValues: [
          { value: 'hostile', label: '적대적' },
          { value: 'defensive', label: '방어적' },
          { value: 'neutral', label: '중립' },
          { value: 'cooperative', label: '협조적' },
        ],
        usedBy: ['divorce_mediation_first', 'divorce_consensual_conversion'],
      },
      {
        key: 'fault_evidence_strength',
        label: '상대 유책 증거 강도',
        kind: 'enum',
        enumValues: [
          { value: 'none', label: '없음' },
          { value: 'weak', label: '정황' },
          { value: 'moderate', label: '다수 정황' },
          { value: 'strong', label: '직접 증거' },
        ],
        usedBy: ['divorce_fault_aggregation'],
      },
      {
        key: 'domestic_violence_history',
        label: '상대의 폭력 이력',
        kind: 'boolean',
        usedBy: ['divorce_protective_order', 'divorce_fault_aggregation'],
      },
      {
        key: 'personality_notes',
        label: '상대 성격 특성 메모',
        kind: 'text',
        description: '예: 권위적 / 감정기복 / 회피형 — 협상전략 입력',
      },
      {
        key: 'work_stability',
        label: '상대 직장·소득 안정성',
        kind: 'enum',
        enumValues: [
          { value: 'stable', label: '안정' },
          { value: 'unstable', label: '불안정' },
          { value: 'unemployed', label: '무직' },
          { value: 'unknown', label: '미상' },
        ],
      },
    ],
  },
  {
    role: 'family_court',
    label: '가정법원 (판정자)',
    weight: 'secondary',
    cardinality: 'single',
    adversarial: false,
    persuasive: true,
    icon: '⚖️',
    autoCreate: true,
    intelSchema: [
      { key: 'court_name', label: '관할 가정법원', kind: 'text', required: true },
      {
        key: 'mediation_tendency',
        label: '조정 우선도',
        kind: 'enum',
        enumValues: [
          { value: 'strong', label: '조정 강제' },
          { value: 'moderate', label: '조정 권고' },
          { value: 'bypass_ok', label: '본안 직행 가능' },
        ],
      },
      {
        key: 'custody_stance',
        label: '친권 판정 성향',
        kind: 'enum',
        enumValues: [
          { value: 'mother_lean', label: '모친 경향' },
          { value: 'neutral', label: '중립' },
          { value: 'stability_first', label: '안정 우선' },
        ],
      },
      { key: 'judge_identified', label: '담당 재판부 특정', kind: 'boolean' },
    ],
  },
  {
    role: 'affair_partner',
    label: '상간자',
    weight: 'secondary',
    cardinality: 'multiple',
    adversarial: true,
    persuasive: false,
    icon: '🩹',
    description: '부정행위 상대. 손해배상 별소 대상 (있을 때만).',
    autoCreate: false,
    intelSchema: [
      { key: 'identity_confirmed', label: '신원 확인', kind: 'boolean' },
      {
        key: 'evidence_strength',
        label: '증거 강도',
        kind: 'enum',
        enumValues: [
          { value: 'weak', label: '정황' },
          { value: 'moderate', label: '간접' },
          { value: 'strong', label: '직접' },
        ],
        usedBy: ['divorce_affair_suit'],
      },
      { key: 'contact_info', label: '연락처·주소', kind: 'text' },
    ],
  },
];
