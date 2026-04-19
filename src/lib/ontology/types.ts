// 온톨로지 프레임워크 타입 정의
// 분야별 차이는 전부 템플릿 JSON으로. 코드는 공통.

export type DocAutomation =
  | 'api_auto'           // 우리 시스템이 API 통해 자동 발급
  | 'b2b_api'            // B2B 계약 후 API 호출 (신용조회 등)
  | 'client_self_issue'  // 고객이 본인인증으로 직접 발급
  | 'company_issued'     // 회사/제3자가 발급 (재직증명 등)
  | 'lawyer_manual';     // 변호사가 직접 처리

export type DocCategory =
  | 'identity' | 'family' | 'assets' | 'income' | 'tax'
  | 'insurance' | 'debt' | 'legal' | 'misc';

export interface DocumentTypeDef {
  key: string;
  label: string;
  source: string;                  // 발급처 (예: '정부24')
  automation: DocAutomation;
  category: DocCategory;
  obtain_instructions?: string;    // 고객이 볼 가이드
  validity_days?: number | null;   // 유효 기간 (null=무관)
  required: boolean;               // 필수 여부
}

export type ActionSideEffect =
  | 'email' | 'sms' | 'pdf_gen' | 'storage' | 'ticket_create'
  | 'event_create' | 'state_transition' | 'llm_call';

export interface ActionTypeDef {
  key: string;
  label: string;
  description: string;
  handler: string;                 // 서버 액션 함수명
  required_role: 'owner' | 'admin' | 'member';
  side_effects: ActionSideEffect[];
  audit_action: string;            // ticket_activities.action 값
  input_hints?: string[];          // UI에 표시할 입력 가이드
}

export interface StageDef {
  key: string;
  label: string;
  description?: string;
  order: number;
  required_doc_keys?: string[];    // 이 스테이지 완료에 필요한 서류
  suggested_actions?: string[];    // 이 스테이지에서 권장 액션 키
  entry_actions?: string[];        // 스테이지 진입 시 자동 실행
  typical_duration_days?: number;
  auto_advance_when?: {
    all_required_docs_received?: boolean;
    min_docs_received?: number;
  };
}

export interface CaseTemplate {
  case_type: string;
  name: string;
  description: string;
  stages: StageDef[];
  document_keys: string[];         // 이 분야에 필요한 DocumentType 키들
  action_keys: string[];           // 이 분야에서 쓸 수 있는 ActionType 키들
  version: number;
}

// 사건 인스턴스 상태 (cases.workflow_* 컬럼에 저장)
export type DocStatus =
  | 'missing' | 'requested' | 'received' | 'not_applicable';

export interface DocState {
  status: DocStatus;
  requested_at?: string;
  received_at?: string;
  attachment_ids?: string[];
  notes?: string;
}

export interface WorkflowDocs {
  [docKey: string]: DocState;
}

export interface StageHistoryEntry {
  stage: string;
  entered_at: string;
  exited_at?: string;
}
