// 도메인 온톨로지 공통 인터페이스
// 각 사건유형(personal_rehab, divorce, criminal, civil...)이 이 인터페이스를 구현.
// ClientProfile·StrategyConsole은 메타정보 기반으로 자동 렌더링하게 될 예정.

import type { ActivationCondition, StrategicOption } from '../intel-gaps';

// ============ 1. Client 인텔 필드 명세 ============
export interface FieldSpec {
  key: string;
  label: string;
  kind: 'number_krw' | 'integer' | 'text' | 'enum' | 'date' | 'boolean';
  required?: boolean;
  placeholder?: string;
  description?: string;
  enumValues?: Array<{ value: string; label: string }>;
  /** 이 필드가 어떤 전략의 활성화 조건에 사용되는지 */
  usedBy?: string[];
}

// ============ 2. 위험신호 명세 ============
export interface RiskFlagSpec {
  key: string;
  label: string;
  tone: 'warn' | 'danger';
  description?: string;
  legalBasis?: string;
  /** 이 플래그가 활성화할 전략 key들 */
  activates?: string[];
}

// ============ 3. 전략 명세 ============
export interface StrategySpec {
  key: string;
  label: string;
  category: StrategicOption['category'];
  icon?: string;
  /** 이 전략이 겨냥하는 Actor (설득/공격 대상) */
  targetActor?: string;
  /** 필요한 증거 (evidence-gap 분석에 사용) */
  requiredEvidence?: string[];
  /** 활성화 조건 평가기 */
  evaluate: (input: unknown) => {
    conditions: ActivationCondition[];
    reasoning: (met: boolean) => string;
    upside: string;
    risk: 'low' | 'medium' | 'high';
  };
}

// ============ 4. Actor 역할 (도메인별 관계도) ============
// 사건에 참여하는 주체 타입. 도메인마다 Actor 구성이 완전히 다름:
//  - 개인회생: client (의뢰인) · court (법원) · creditor (채권자)
//  - 이혼: client · spouse · family_court · affair_partner
//  - 형사: client · prosecutor · judge · victim
export interface ActorRoleSpec {
  role: string;
  label: string;
  weight: 'primary' | 'secondary' | 'background';
  cardinality: 'single' | 'multiple';
  adversarial: boolean;         // 공격·방어 대상
  persuasive: boolean;          // 설득 대상
  intelSchema: FieldSpec[];     // 이 역할의 인텔 필드
  icon?: string;
  description?: string;
  autoCreate?: boolean;         // 사건 생성시 자동 생성 여부 (single+primary/secondary 기본)
}

// Legacy — personal_rehab creditor 섹션에서 아직 사용.
export interface CounterpartyRoleSpec {
  key: string;
  label: string;
  typicalWeaknesses?: string[];
}

// ============ 5. 문서 명세 ============
export interface DocumentSpec {
  key: string;
  label: string;
  required: boolean;
  source?: 'client' | 'court' | 'opposing' | 'public_record';
}

// ============ 도메인 번들 ============
export interface DomainOntology {
  caseType: string;
  label: string;
  /** Actor 구성 — 이 도메인의 관계도 */
  actors: ActorRoleSpec[];
  /** 사람 속성 (clients 테이블). client actor의 intelSchema를 거울로 보관 (편집 UI 하위호환) */
  clientFields: FieldSpec[];
  /** 사건 속성 (cases.case_intel JSONB). 혼인기간 등 관계 수준 */
  caseFields: FieldSpec[];
  riskFlags: RiskFlagSpec[];
  strategies: StrategySpec[];
  counterpartyRoles: CounterpartyRoleSpec[]; // legacy
  documents: DocumentSpec[];
  version: string;
}
