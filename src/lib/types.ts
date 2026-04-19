export type CaseType = 'personal_rehab' | 'divorce' | 'criminal' | 'other';

export type CaseStage = 'initial' | 'in_progress' | 'closed';

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  memo: string | null;
  created_at: string;
}

export type CaseVisibility = 'workspace' | 'assigned_only' | 'owner_only';

export interface Case {
  id: string;
  workspace_id: string;
  client_id: string;
  title: string;
  case_type: CaseType | null;
  stage: CaseStage | null;
  status: string;
  case_number: string | null;
  court: string | null;
  opposing_party: string | null;
  retainer_date: string | null;
  closed_date: string | null;
  outcome: string | null;
  assigned_to: string | null;
  visibility: CaseVisibility;
  created_at: string;
}

export const CASE_VISIBILITY_LABEL: Record<CaseVisibility, string> = {
  workspace: '워크스페이스 전체',
  assigned_only: '담당자 + 관리자만',
  owner_only: '소유자만 (최고 기밀)',
};

export interface TeamMemberLite {
  id: string;
  name: string | null;
  email: string;
}

export interface CaseEvent {
  id: string;
  workspace_id: string;
  case_id: string | null;
  client_id: string | null;
  source_type: string;
  raw_content: string | null;
  metadata: unknown;
  occurred_at: string | null;
  processed: boolean;
  created_at: string;
}

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  personal_rehab: '개인회생',
  divorce: '이혼',
  criminal: '형사',
  other: '기타',
};
