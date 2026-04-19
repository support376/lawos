export type ColumnKey = 'triage' | 'todo' | 'in_progress' | 'review' | 'done';

export type TicketType = 'promise' | 'document_request' | 'follow_up';

export type Priority = 1 | 2 | 3 | 4;

export type WaitingOn = 'client' | 'court' | 'opposing' | null;

export type ActionType = 'send_email' | 'create_calendar' | 'manual' | null;

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

export interface Ticket {
  id: string;
  workspace_id: string;
  board_id: string;
  column_key: ColumnKey;
  order: number;

  case_id: string | null;
  client_id: string | null;

  title: string;
  description: string | null;
  type: TicketType;
  priority: Priority;

  due_date: string | null;
  waiting_on: WaitingOn;

  source_event_id: string | null;
  ai_suggested: boolean;
  ai_reasoning: string | null;
  ai_confidence: number | null;

  draft_payload: unknown;
  action_type: ActionType;

  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TicketWithRelations extends Ticket {
  client: Pick<Client, 'id' | 'name'> | null;
  case: Pick<Case, 'id' | 'title' | 'case_type'> | null;
}

export interface KanbanColumn {
  id: string;
  board_id: string;
  key: ColumnKey;
  name: string;
  order: number;
  color: string | null;
}

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  promise: '구두약속',
  document_request: '서류요청',
  follow_up: '후속확인',
};

export const TICKET_TYPE_ICON: Record<TicketType, string> = {
  promise: '🤝',
  document_request: '📄',
  follow_up: '🔔',
};

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  personal_rehab: '개인회생',
  divorce: '이혼',
  criminal: '형사',
  other: '기타',
};

export const COLUMN_COLOR_CLASSES: Record<string, string> = {
  gray: 'bg-zinc-100 dark:bg-zinc-900',
  blue: 'bg-blue-50 dark:bg-blue-950/40',
  amber: 'bg-amber-50 dark:bg-amber-950/40',
  purple: 'bg-purple-50 dark:bg-purple-950/40',
  green: 'bg-emerald-50 dark:bg-emerald-950/40',
};

export const PRIORITY_COLOR: Record<Priority, string> = {
  1: 'border-l-red-500',
  2: 'border-l-amber-500',
  3: 'border-l-blue-500',
  4: 'border-l-zinc-300',
};
