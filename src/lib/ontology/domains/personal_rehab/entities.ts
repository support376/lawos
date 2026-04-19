// 개인회생 온톨로지 v0.2 — 13 엔티티
// 출처: personal_rehab_ontology_v0.2.html (Circle21·웰컴법률사무소 양홍수 변호사 피드백 반영)
// 기준법: 채무자회생법 (DRBA)

// =========================================================================
// 공용 enum / 유니온
// =========================================================================

export type JobType = 'earned' | 'business' | 'freelance' | 'unemployed';
export type ResidenceType = 'owned' | 'jeonse' | 'monthly_rent' | 'other';
export type IncomeType = 'earned' | 'business' | 'freelance' | 'public_benefit';
export type DependentRelation = 'spouse' | 'child' | 'parent' | 'other';

export type DebtType =
  | 'general_unsecured'
  | 'secured'
  | 'priority'
  | 'tax'
  | 'non_dischargeable'
  | 'private_loan';

export type AssetType =
  | 'real_estate'
  | 'deposit'
  | 'security_deposit'
  | 'insurance_surrender'
  | 'vehicle'
  | 'retirement'
  | 'business_asset'
  | 'receivable';

export type CaseType =
  | 'personal_rehab'
  | 'general_rehab'
  | 'bankruptcy_discharge'
  | 'small_business_rehab';

export type RepaymentStructure = 'equal' | 'graduated';
export type RepaymentPeriodMonths = 24 | 36 | 60;

export type ActorType = 'debtor' | 'attorney' | 'court' | 'trustee' | 'creditor';

export type ContactChannel = 'ecourt' | 'kakao' | 'paper' | 'in_person' | 'phone' | 'email';

// =========================================================================
// 2.1 Debtor — 사건의 주체
// =========================================================================

export interface DebtorShorteningEligibility {
  is_under_30: boolean;
  is_over_65: boolean;
  is_single_parent: boolean;
  has_2plus_minor_children: boolean;
  is_jeonse_fraud_victim: boolean;
  is_severely_disabled: boolean;
}

export interface DebtorEligibilityFlags {
  has_prior_discharge_within_5y: boolean;      // 면책 후 5년 이내 재신청 불가
  has_regular_income: boolean;
  is_business_income_earner: boolean;
  unsecured_debt_cap_ok: boolean;              // ≤ 10억
  secured_debt_cap_ok: boolean;                // ≤ 15억
}

export interface DebtorRiskFlags {
  has_tax_arrears: boolean;                    // 국세체납
  has_insurance_arrears: boolean;              // 4대보험 체납
  has_criminal_case: boolean;                  // 형사사건
  preferential_transfer_risk: boolean;
  fraudulent_transfer_risk: boolean;
  has_guarantor: boolean;
  recent_loan_within_3m: boolean;              // v0.2 신규: 사기죄 피소 위험
}

export interface Debtor {
  id: string;
  case_id: string;                             // Case와 1:1
  // 식별
  name: string;
  rrn_encrypted: string | null;                // 주민번호 (암호화)
  age: number | null;
  gender: 'M' | 'F' | 'other' | null;
  contact: string | null;
  // 주거
  residence_type: ResidenceType | null;
  deposit_amount_krw: number | null;           // 전세·월세 보증금
  // 직업 (복합 허용)
  job_types: JobType[];
  // 적격성·리스크·단축자격
  eligibility: DebtorEligibilityFlags;
  risks: DebtorRiskFlags;
  shortening: DebtorShorteningEligibility;
}

// =========================================================================
// 2.2 Debt — 채무/채권
// =========================================================================

export interface Debt {
  id: string;
  case_id: string;
  type: DebtType;
  creditor_name: string;
  creditor_type: 'bank' | 'card' | 'private' | 'tax_authority' | 'criminal' | 'other';
  principal_krw: number;
  interest_krw: number;
  overdue_interest_krw: number;
  origin_date: string | null;                  // 채무 발생일
  last_payment_date: string | null;
  cause: string | null;                        // 원인 (예: 신용대출, 담보대출)
  // 담보
  has_collateral: boolean;
  collateral_asset_id: string | null;
  // 상태
  is_in_collection: boolean;
  is_litigated: boolean;
  judgment_finalized: boolean;
  has_guarantor: boolean;
  statute_of_limitations_expired: boolean;
}

// =========================================================================
// 2.3 Asset — 재산
// =========================================================================

export interface Asset {
  id: string;
  case_id: string;
  type: AssetType;
  label: string;
  market_value_krw: number;
  liquidation_value_krw: number;
  exempt_amount_krw: number;                   // 압류금지·면제
  secured_claims_on_asset_krw: number;
  // 파생: net_value = liquidation - exempt - secured_claims
  // 수임 후 확정 플래그 (보험해약금·사업용자산)
  pending_confirmation: boolean;
}

// =========================================================================
// 2.4 Income — 소득 (복합 허용)
// =========================================================================

export interface Income {
  id: string;
  case_id: string;
  type: IncomeType;
  monthly_amount_krw: number;                  // 세후 기준 (v0.2 고정)
  is_regular: boolean;
  is_documented: boolean;                      // 원천·4대보험
  // 사업소득 전략 (v0.2 신규)
  declared_for_intake_krw: number | null;      // 인테이크 시 의뢰인 유리 금액
  bank_evidence_amount_krw: number | null;     // 계좌내역 실증액
}

// =========================================================================
// 2.5 Dependent — 부양가족
// =========================================================================

export interface Dependent {
  id: string;
  case_id: string;
  relation: DependentRelation;
  age: number;
  is_cohabiting: boolean;
  has_own_income: boolean;
  is_minor: boolean;
  // v0.2 신규
  young_adult_dependent_claim: boolean;        // 성년 자녀 부양 주장 (서울·수원)
}

// 가구원수 분할 산정 결과 (파생)
export type HouseholdSizeLogic = 'standard' | 'split';

// =========================================================================
// 2.6 Case — 사건
// =========================================================================

export interface RehabCase {
  id: string;                                  // cases.id 재사용
  case_type: CaseType;
  court: string | null;
  case_number: string | null;
  trustee_name: string | null;
  filing_date: string | null;
  opening_date: string | null;
  approval_date: string | null;
  discharge_date: string | null;
  current_stage_key: StageKey;
}

// =========================================================================
// 2.7 RepaymentPlan — 변제계획
// =========================================================================

export interface RepaymentPlan {
  id: string;
  case_id: string;
  plan_period_months: RepaymentPeriodMonths;   // {24, 36, 60}
  monthly_payment_krw: number;
  total_payment_krw: number;                   // = monthly × period
  repayment_ratio: number;                     // 0.0 ~ 1.0
  structure: RepaymentStructure;
  liquidation_value_guaranteed: boolean;       // 청산가치보장원칙 충족
  // 단축계획 자격 근거 (24개월일 때)
  shortening_reason: keyof DebtorShorteningEligibility | null;
  version: number;                             // 계획 변경 이력
  created_at: string;
}

// =========================================================================
// 2.8 Document — 서류
// =========================================================================

export type DocumentType =
  // 신청서류
  | 'petition'
  | 'creditor_list'
  | 'property_list'
  | 'income_expense_list'
  | 'statement'
  // 증빙서류
  | 'income_proof_payroll'
  | 'income_proof_business'
  | 'bank_statement'
  | 'property_register'
  | 'vehicle_register'
  | 'insurance_policy'
  | 'debt_cert'
  | 'lawsuit_record'
  | 'dunning_notice'
  | 'family_cert'
  | 'resident_reg';

export interface RehabDocument {
  id: string;
  case_id: string;
  doc_type: DocumentType;
  label: string;
  required: boolean;
  uploaded: boolean;
  verified: boolean;
  attachment_id: string | null;                // attachments 테이블 FK
}

// =========================================================================
// 2.9 Stage — 절차 상태머신 (10 + 3 우회)
// =========================================================================

export type StageKey =
  | 'consultation'         // 상담
  | 'engagement'           // 수임
  | 'document_prep'        // 서류준비
  | 'filing'               // 신청접수
  | 'correction_loop'      // 보정 루프 (1~3차)
  | 'dismissal'            // 기각 (v0.2 신규)
  | 'immediate_appeal'     // 즉시항고 (v0.2 신규)
  | 'dismissal_revoked'    // 기각취소 (v0.2 신규)
  | 'opening_decision'     // 개시결정
  | 'claim_filing'         // 채권신고·조사
  | 'creditor_meeting'     // 채권자집회
  | 'plan_approval'        // 변제계획 인가
  | 'repayment'            // 변제수행
  | 'discharge'            // 면책
  | 'termination'          // 폐지
  | 'modification';        // 계획 변경

export interface StageTransition {
  from: StageKey;
  to: StageKey;
  condition: string;                           // 전이 조건 (자연어 설명)
  is_bypass?: boolean;                         // 기각 우회 경로 여부
}

export interface StageHistoryEntry {
  id: string;
  case_id: string;
  stage_key: StageKey;
  entry_date: string;
  exit_date: string | null;
  required_actions: string[];                  // 이 stage에서 해야 할 것
  blocking_issues: string[];
  responsible_actor: ActorType | null;
}

// =========================================================================
// 2.10 Interaction — 상호작용 (보정 루프·즉시항고 포함)
// =========================================================================

export type InteractionType =
  | 'correction_recommendation'                // 보정권고
  | 'opinion_request'                          // 의견조회
  | 'status_report'                            // 사정보고
  | 'objection'                                // 이의
  | 'response'                                 // 답변
  | 'immediate_appeal';                        // 즉시항고 (v0.2 신규)

export interface Interaction {
  id: string;
  case_id: string;
  type: InteractionType;
  iteration_number: number;                    // 보정 1차·2차·3차
  initiator: ActorType;
  recipient: ActorType;
  due_date: string | null;
  response_date: string | null;
  items: string[];                             // 각 지적사항 또는 답변항목
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
}

// =========================================================================
// 2.11 CourtOrder — 법원 명령
// =========================================================================

export type CourtOrderType =
  | 'correction_rec'                           // 보정권고
  | 'dismissal'                                // 기각 (v0.2)
  | 'dismissal_revoked'                        // 기각취소 (v0.2)
  | 'opening_decision'                         // 개시결정
  | 'plan_approval'                            // 인가결정
  | 'termination'                              // 폐지결정
  | 'modification_approval'                    // 변경결정
  | 'discharge';                               // 면책결정

export interface CourtOrder {
  id: string;
  case_id: string;
  order_type: CourtOrderType;
  issued_date: string;
  required_actions: string[];
  deadline: string | null;
  appealable: boolean;
}

// =========================================================================
// 2.12 RepaymentEvent — 변제수행 이벤트
// =========================================================================

export type RepaymentEventType =
  | 'payment_completed'
  | 'payment_delayed'
  | 'income_change'
  | 'modification_request'
  | 'termination_warning';

export interface RepaymentEvent {
  id: string;
  case_id: string;
  type: RepaymentEventType;
  event_date: string;
  amount_krw: number | null;
  reason: string | null;
  evidence: string | null;
  triggered_actions: string[];
}

// =========================================================================
// 2.13 Actor — 행위자
// =========================================================================

export interface RehabActor {
  id: string;
  case_id: string;
  actor_type: ActorType;
  name: string;
  contact_channel: ContactChannel | null;
  responsibilities: string[];
}

// =========================================================================
// 집계 뷰 — 모든 엔티티를 한 번에
// =========================================================================

export interface RehabCaseFullView {
  case: RehabCase;
  debtor: Debtor;
  debts: Debt[];
  assets: Asset[];
  incomes: Income[];
  dependents: Dependent[];
  documents: RehabDocument[];
  repayment_plans: RepaymentPlan[];            // 버전 이력
  stage_history: StageHistoryEntry[];
  interactions: Interaction[];
  court_orders: CourtOrder[];
  repayment_events: RepaymentEvent[];
  actors: RehabActor[];
}
