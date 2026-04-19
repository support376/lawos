// 법정 전술 카탈로그
// 원칙:
//   1) 명시적으로 합법인 전술만 포함. 회색지대/불법은 never_in_system — 아예 정의 안 함.
//   2) 각 전술은 법적 근거 조문 필수.
//   3) 의뢰인 동의 필요 여부 명시.
//   4) 리스크·역효과 투명 공개.
// 이 카탈로그가 변호사의 무기고. 신중하게 확장할 것.

export type TacticCategory = 'offensive' | 'defensive' | 'settlement' | 'procedural';
export type TacticRisk = 'low' | 'medium' | 'high';

export interface Tactic {
  key: string;
  name: string;
  summary: string;        // 한 줄
  description: string;    // 상세 전술
  category: TacticCategory;
  applicable_case_types: string[];  // personal_rehab / divorce / criminal / other
  required_conditions: string[];    // 성립 요건
  counterparty_triggers: string[];  // 이 약점이 있으면 특히 효과적
  legal_basis: string[];            // 법조문
  expected_effect: string;
  risk_level: TacticRisk;
  risk_description: string;
  estimated_success: number | null; // 0~1. null = 데이터 부족
  requires_client_consent: boolean;
  professional_notes?: string;       // 변호사용 팁
}

export const TACTICS: Record<string, Tactic> = {
  // ============ 이혼 ============
  divorce_personal_summons: {
    key: 'divorce_personal_summons',
    name: '본인신문 신청',
    summary: '상대방이 공개석상 기피 성향일 때 법정 출두 압박 → 합의 유도',
    description:
      '민사소송법 §367에 따라 상대방에 대한 당사자신문 신청. 법원 채택 시 상대 본인 출두 의무. 불출석 시 변론 전체 취지를 고려한 사실 인정(의제자백 유사 효과), 출두 시 예상 진술 대비한 반대신문 준비.',
    category: 'offensive',
    applicable_case_types: ['divorce', 'other'],
    required_conditions: [
      '상대방 공개석상/법정 출두 기피 성향 확인 (공개 정보 기반)',
      '사실관계 규명에 본인 진술 필요',
      '신청 근거 정리 (소가·쟁점·입증책임)',
    ],
    counterparty_triggers: ['공개 자리 기피', '평판 민감', '사회공포 경향'],
    legal_basis: ['민사소송법 §367 (당사자신문)', '민사소송법 §150 (의제자백)'],
    expected_effect:
      '출두 거부 → 불리한 사실 인정. 출두 → 진술 흐트러짐 + 합의 제안 가능성',
    risk_level: 'medium',
    risk_description:
      '법원 기각 시 변호사 준비 미비로 비칠 수 있음. 근거 부족 시 역효과.',
    estimated_success: 0.55,
    requires_client_consent: true,
  },

  divorce_asset_disclosure: {
    key: 'divorce_asset_disclosure',
    name: '재산명시·재산조회 신청',
    summary: '상대방 재산목록 축소 제출 시 추가 개시 강제',
    description:
      '가사소송법 §48-2, §48-3에 따른 재산명시·조회 신청. 법원이 채택하면 상대방 금융·부동산·법인 지분까지 공식 조회. 은닉 정황 확인 절차.',
    category: 'offensive',
    applicable_case_types: ['divorce'],
    required_conditions: [
      '상대방 재산목록 제출 완료 (또는 기한 도과)',
      '은닉 의심 근거 (공시·등기 조회 결과 불일치)',
      '재산분할 청구 소송 계속 중',
    ],
    counterparty_triggers: ['법인 실소유', '재산 구조 복잡', '제3자 명의 자산'],
    legal_basis: [
      '가사소송법 §48-2 (재산명시)',
      '가사소송법 §48-3 (재산조회)',
      '민사소송법 §292 (문서제출명령) — 보조',
    ],
    expected_effect: '추가 재산 3~10% 공개 가능. 은닉 시도 좌절.',
    risk_level: 'low',
    risk_description: '명령 불이행 시 과태료 부과 가능. 효과 없으면 기간만 연장.',
    estimated_success: 0.7,
    requires_client_consent: true,
  },

  divorce_property_provisional: {
    key: 'divorce_property_provisional',
    name: '재산분할 가압류',
    summary: '판결 전 상대방 재산 처분 차단',
    description:
      '재산분할 청구권을 피보전권리로 가압류 신청 (민사집행법). 부동산·예금·법인 지분. 상대가 판결 직전 재산 이전 시도하는 것을 선제 차단.',
    category: 'offensive',
    applicable_case_types: ['divorce', 'other'],
    required_conditions: [
      '재산분할 청구권 확정 (소장 제출)',
      '보전 필요성 (상대방 처분 시도 정황)',
      '담보 공탁 준비 (보통 청구액 10~20%)',
    ],
    counterparty_triggers: ['자산 이전 시도 정황', '해외 계좌 이용'],
    legal_basis: [
      '민사집행법 §276 (가압류)',
      '민법 §839-2 (재산분할)',
    ],
    expected_effect: '집행 시점 보장. 상대 협상력 감소.',
    risk_level: 'medium',
    risk_description: '남용 시 손해배상 청구 가능. 보전 필요성 소명 부족하면 기각.',
    estimated_success: 0.65,
    requires_client_consent: true,
  },

  divorce_fault_evidence: {
    key: 'divorce_fault_evidence',
    name: '유책사유 입증',
    summary: '민법 §840 이혼사유 구체화 → 위자료 증액',
    description:
      '민법 §840(1~6호) 이혼사유 입증 자료 체계화. 부정행위(§840-1)는 증거 엄격. 위자료 산정에 유책도 반영. 합의 협상 지렛대.',
    category: 'offensive',
    applicable_case_types: ['divorce'],
    required_conditions: [
      '유책 행위에 대한 1차 자료 확보 (정당한 경로)',
      '입증 적법성 검증 (통신비밀보호법 등)',
    ],
    counterparty_triggers: ['부정 의혹', '경제적 부양 해태'],
    legal_basis: [
      '민법 §840 (재판상 이혼사유)',
      '민법 §843 (위자료)',
      '민법 §751 (정신적 손해배상)',
    ],
    expected_effect: '위자료 증액. 협상 우위.',
    risk_level: 'high',
    risk_description:
      '불법 증거 수집 시 증거 배제 + 의뢰인 형사처벌 리스크 (통비법·개인정보법).',
    estimated_success: 0.5,
    requires_client_consent: true,
    professional_notes:
      '증거 수집 경로가 적법한지 반드시 사전 검토. 배우자 동의 없는 녹음·몰래카메라는 형사처벌.',
  },

  divorce_mediation_first: {
    key: 'divorce_mediation_first',
    name: '조정 선행 전략',
    summary: '판결 전 조정으로 신속 종결 + 비용 절감',
    description:
      '가사소송법 §50 조정전치주의. 조정 시 합의 시도 → 조정 불성립 시 판결. 감정 소모 줄이고 협상 공간 확보.',
    category: 'settlement',
    applicable_case_types: ['divorce'],
    required_conditions: [
      '의뢰인의 합의 의향',
      '상대방도 협상 여지 존재 (감정 극단 아님)',
    ],
    counterparty_triggers: ['빠른 종결 선호', '언론 노출 기피'],
    legal_basis: ['가사소송법 §50 (조정전치주의)', '민사조정법'],
    expected_effect: '3~6개월 내 종결. 비용 30~50% 절감.',
    risk_level: 'low',
    risk_description: '조정 불성립 시 기간만 소요. 판결 유리한 경우에는 시간 낭비.',
    estimated_success: 0.45,
    requires_client_consent: true,
  },

  // ============ 개인회생 ============
  rehab_preemptive_creditor_notice: {
    key: 'rehab_preemptive_creditor_notice',
    name: '채권자 내용증명 선제 발송',
    summary: '신청 전 추심 정지 요청 + 가압류 대비',
    description:
      '신청 준비 중 임을 채권자에게 통보 → 추심 활동 정지 요청. 회수법·공정한추심에관한법률 근거. 가압류 시도 시 법적 조치 경고.',
    category: 'defensive',
    applicable_case_types: ['personal_rehab'],
    required_conditions: [
      '수임 확정 + 신청 준비 중',
      '채권자 명단 확정',
    ],
    counterparty_triggers: ['무분별 추심', '가압류 시도'],
    legal_basis: [
      '채권의 공정한 추심에 관한 법률',
      '채무자 회생 및 파산에 관한 법률 §600',
    ],
    expected_effect: '추심 빈도 급감. 시간적 여유 확보.',
    risk_level: 'low',
    risk_description: '효과 개별 채권자마다 편차. 무시하는 일부 채권자 존재.',
    estimated_success: 0.7,
    requires_client_consent: true,
  },

  rehab_preferential_defense: {
    key: 'rehab_preferential_defense',
    name: '편파변제 소명 준비',
    summary: '6개월 내 의심 거래에 대한 사전 해명 자료 구축',
    description:
      '신청 전 통장내역 자체 감사 → 편파변제 의심 거래 식별 → 각 거래의 사유·긴급성·객관적 근거 문서화. 법원 문의 대비.',
    category: 'defensive',
    applicable_case_types: ['personal_rehab'],
    required_conditions: [
      '6개월 통장내역 수집',
      'AI 편파변제 분석 완료',
    ],
    counterparty_triggers: [],
    legal_basis: [
      '채무자회생법 §391 (편파행위)',
      '채무자회생법 §392 (부인권)',
    ],
    expected_effect: '법원 문의·보정명령 대응 속도 ↑. 인가 가능성 유지.',
    risk_level: 'low',
    risk_description: '해명 부실 시 인가 기각 가능.',
    estimated_success: 0.8,
    requires_client_consent: true,
  },

  rehab_repayment_increase_counter: {
    key: 'rehab_repayment_increase_counter',
    name: '변제율 인상 역제안 (조기 합의)',
    summary: '채권자 반대 시 소액 증액으로 신속 인가',
    description:
      '변제계획안 채권자집회에서 반대표 발생 시, 변제율 2~5% 조정 제시 → 동의 획득. 인가 실패 리스크 < 소액 증액.',
    category: 'settlement',
    applicable_case_types: ['personal_rehab'],
    required_conditions: [
      '채권자집회 소집',
      '가처분소득 여유 (시뮬 통과)',
    ],
    counterparty_triggers: ['채권자 다수 반대 가능성'],
    legal_basis: ['채무자회생법 §614 (변제계획 변경)'],
    expected_effect: '인가 확률 30% ↑. 종결 시점 3~6개월 단축.',
    risk_level: 'low',
    risk_description: '증액 여력 없을 시 불가능. 의뢰인 부담 고려.',
    estimated_success: 0.6,
    requires_client_consent: true,
  },

  // ============ 형사 ============
  criminal_evidence_discovery: {
    key: 'criminal_evidence_discovery',
    name: '증거개시 신청 (검찰)',
    summary: '검찰 보유 증거 확인 → 방어 전략 수립',
    description:
      '형사소송법 §266-3에 따라 검찰 보유 증거 열람·등사 신청. 공소사실 외 증거도 확인 가능.',
    category: 'procedural',
    applicable_case_types: ['criminal'],
    required_conditions: ['공소제기 후'],
    counterparty_triggers: [],
    legal_basis: ['형사소송법 §266-3, §266-4 (증거개시)'],
    expected_effect: '검찰 카드 확인 → 방어 포인트 설계.',
    risk_level: 'low',
    risk_description: '검찰 거부 시 법원에 결정 신청 필요.',
    estimated_success: 0.9,
    requires_client_consent: true,
  },

  criminal_sentencing_material: {
    key: 'criminal_sentencing_material',
    name: '양형자료 체계화',
    summary: '감경 요소 수집 → 선고유예/집행유예 목표',
    description:
      '반성문, 기부, 봉사활동, 피해회복, 가정환경, 직업 기여 등 체계적 수집. 양형기준표 대비 감경인자 최대화.',
    category: 'defensive',
    applicable_case_types: ['criminal'],
    required_conditions: ['유죄 가능성 인정 OR 대비'],
    counterparty_triggers: [],
    legal_basis: [
      '형법 §51 (양형의 조건)',
      '양형위원회 양형기준',
    ],
    expected_effect: '1~2단계 감경. 실형 → 집유 전환 가능.',
    risk_level: 'low',
    risk_description: '과장된 자료는 역효과. 진정성 중요.',
    estimated_success: 0.65,
    requires_client_consent: true,
  },

  criminal_settlement_induction: {
    key: 'criminal_settlement_induction',
    name: '피해자 합의 유도',
    summary: '피해 복구 → 감경 인자 확보',
    description:
      '피해자 처벌불원 or 합의 시 상당한 감경 인자. 피해자 경제상황·피해회복 의지 분석 후 현실적 금액 협상.',
    category: 'settlement',
    applicable_case_types: ['criminal'],
    required_conditions: [
      '의뢰인 배상 의사',
      '피해자 연락 가능',
    ],
    counterparty_triggers: ['경제적 어려움', '피해회복 우선'],
    legal_basis: ['형법 §51 (양형)', '소송촉진 등에 관한 특례법 §25'],
    expected_effect: '선고 1~2단계 감경. 처벌불원 시 공소기각 가능성 (반의사불벌죄).',
    risk_level: 'medium',
    risk_description: '강압 합의 시 역효과 + 변호사 징계. 피해자 접근 방식 주의.',
    estimated_success: 0.5,
    requires_client_consent: true,
    professional_notes:
      '피해자에 직접 접촉 시 변호사가 대리하는 형식 유지. 의뢰인 직접 접촉은 2차 가해 위험.',
  },

  // ============ 일반 민사 ============
  civil_provisional_attachment: {
    key: 'civil_provisional_attachment',
    name: '가압류 선제 신청',
    summary: '본안 소 제기 전 상대 재산 확보',
    description:
      '민사집행법 §276. 피보전권리 + 보전 필요성 소명. 부동산·예금·채권 대상. 상대 압박 수단.',
    category: 'offensive',
    applicable_case_types: ['other'],
    required_conditions: [
      '피보전권리 확정 가능',
      '재산 은닉 정황',
      '담보 공탁 준비',
    ],
    counterparty_triggers: ['자산 이전 의심', '영업 필수 자산'],
    legal_basis: ['민사집행법 §276, §277 (가압류)'],
    expected_effect: '집행 보장. 협상 시 유리한 지렛대.',
    risk_level: 'medium',
    risk_description: '남용 시 상대 손해배상 청구 가능 (민법 §750).',
    estimated_success: 0.7,
    requires_client_consent: true,
  },

  civil_document_production: {
    key: 'civil_document_production',
    name: '문서제출명령 신청',
    summary: '상대 보유 핵심 문서 강제 확보',
    description:
      '민사소송법 §344. 상대방 보유 문서 중 입증에 필수적인 것 제출 강제. 불응 시 주장 사실 인정 효과(§349).',
    category: 'procedural',
    applicable_case_types: ['other', 'divorce'],
    required_conditions: [
      '문서 특정 가능',
      '신청자 보유 불가',
    ],
    counterparty_triggers: ['은폐 시도'],
    legal_basis: [
      '민사소송법 §344 (문서제출의무)',
      '민사소송법 §349 (불응 시 효과)',
    ],
    expected_effect: '핵심 증거 확보 or 주장 사실 인정.',
    risk_level: 'low',
    risk_description: '특정성 부족 시 기각.',
    estimated_success: 0.6,
    requires_client_consent: true,
  },

  civil_settlement_recommendation: {
    key: 'civil_settlement_recommendation',
    name: '화해권고결정 유도',
    summary: '법관 권고 결정으로 신속 종결',
    description:
      '민사소송법 §225. 법관이 쌍방 사정 고려해 결정. 2주 내 이의 없으면 확정판결 효력. 조기 종결 + 항소 차단.',
    category: 'settlement',
    applicable_case_types: ['other'],
    required_conditions: [
      '당사자 쌍방 화해 의향 미세라도 존재',
      '쟁점 명확',
    ],
    counterparty_triggers: ['소송 부담', '장기 소송 회피'],
    legal_basis: ['민사소송법 §225~232 (화해권고결정)'],
    expected_effect: '2~6개월 종결. 확정판결과 동일 효력.',
    risk_level: 'low',
    risk_description: '불리한 결정 시 이의 필수. 시기 잘못되면 역효과.',
    estimated_success: 0.55,
    requires_client_consent: true,
  },
};

export function getTacticsFor(caseType: string | null): Tactic[] {
  if (!caseType) return [];
  return Object.values(TACTICS).filter((t) =>
    t.applicable_case_types.includes(caseType),
  );
}

export function getTactic(key: string): Tactic | null {
  return TACTICS[key] ?? null;
}
