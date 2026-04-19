// 온톨로지 v0.3 — 범용 객체 (Lead · Communication · Payment · Action)

import type { Role } from './roles';

// =========================================================================
// 공용 유니온
// =========================================================================

export type SubjectType = 'lead' | 'client' | 'case' | 'payment_schedule';
export type CommunicationSubject = 'lead' | 'client' | 'case';

// =========================================================================
// Lead (수임 전)
// =========================================================================

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'cold';
export type LeadSource = 'phone' | 'kakao_ads' | 'blog' | 'referral' | 'walk_in' | 'naver' | 'google' | 'other';
export type LeadLostReason =
  | 'fee_mismatch' | 'competitor' | 'cooled_off' | 'ineligible' | 'no_response' | 'other';
export type LeadUrgency = 'high' | 'normal' | 'low';

export interface Lead {
  id: string;
  workspace_id: string;
  name: string;
  contact: string | null;
  contact_secondary: string | null;
  source: LeadSource | null;
  assigned_consultant_id: string | null;
  status: LeadStatus;
  case_type_hint: string | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  lost_reason: LeadLostReason | null;
  converted_at: string | null;
  case_id: string | null;
  notes: string | null;
  triage_score: number | null;
  urgency: LeadUrgency;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: '신규',
  contacted: '상담중',
  qualified: '적격 확인',
  converted: '수임 전환',
  lost: '이탈',
  cold: '콜드',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  phone: '전화',
  kakao_ads: '카톡광고',
  blog: '블로그',
  referral: '지인추천',
  walk_in: '방문',
  naver: '네이버',
  google: '구글',
  other: '기타',
};

// =========================================================================
// Communication (다형)
// =========================================================================

export type CommChannel = 'call' | 'kakao' | 'sms' | 'email' | 'visit' | 'letter';
export type CommDirection = 'inbound' | 'outbound';
export type CommSentiment = 'positive' | 'neutral' | 'negative' | 'urgent';

export interface Communication {
  id: string;
  workspace_id: string;
  subject_type: CommunicationSubject;
  subject_id: string;
  channel: CommChannel;
  direction: CommDirection;
  occurred_at: string;
  summary: string | null;
  content: string | null;
  duration_seconds: number | null;
  attachment_ids: string[];
  logged_by: string | null;
  auto_captured: boolean;
  sentiment: CommSentiment | null;
  created_at: string;
}

export const COMM_CHANNEL_LABEL: Record<CommChannel, string> = {
  call: '통화',
  kakao: '카톡',
  sms: '문자',
  email: '이메일',
  visit: '방문',
  letter: '우편',
};

// =========================================================================
// Payment
// =========================================================================

export type PaymentPlanType = 'lump_sum' | 'installment' | 'conditional';
export type PaymentGate = 'hard' | 'soft';
export type PaymentKind = 'retainer' | 'installment' | 'success_fee' | 'court_fee' | 'misc';
export type PaymentStatus = 'scheduled' | 'partial' | 'paid' | 'overdue' | 'waived' | 'refunded';
export type PaymentMethod = 'bank_transfer' | 'card' | 'cash' | 'check';

export interface PaymentContract {
  id: string;
  workspace_id: string;
  case_id: string;
  total_amount_krw: number;
  plan_type: PaymentPlanType;
  installment_count: number;
  first_due_date: string | null;
  cycle_days: number | null;
  payment_gate: PaymentGate;
  auto_dunning_enabled: boolean;
  dunning_schedule_days: number[];
  dunning_template_ids: string[];
  signed_at: string | null;
  signed_by_user_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSchedule {
  id: string;
  workspace_id: string;
  case_id: string;
  contract_id: string;
  installment_no: number;
  kind: PaymentKind;
  amount_krw: number;
  paid_amount_krw: number;
  due_date: string;
  paid_date: string | null;
  status: PaymentStatus;
  dunning_count: number;
  last_dunning_at: string | null;
  next_dunning_at: string | null;
  payment_method: PaymentMethod | null;
  invoice_issued: boolean;
  gate_blocks_stages: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  retainer: '착수금',
  installment: '중도금',
  success_fee: '성공보수',
  court_fee: '법원비용',
  misc: '기타',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  scheduled: '예정',
  partial: '부분지급',
  paid: '완납',
  overdue: '연체',
  waived: '면제',
  refunded: '환불',
};

// =========================================================================
// Action (범용 업무)
// =========================================================================

export type ActionStatus = 'pending' | 'doing' | 'blocked' | 'done' | 'cancelled';

export interface ActionRecord {
  id: string;
  workspace_id: string;
  subject_type: SubjectType;
  subject_id: string;
  action_type: string;                          // ACTION_REGISTRY key
  title: string;
  description: string | null;
  assigned_to: string | null;
  team_role: Role | null;
  due_date: string | null;
  status: ActionStatus;
  priority: 1 | 2 | 3 | 4;
  payload: Record<string, unknown>;
  parent_action_id: string | null;
  auto_generated: boolean;
  blocking_reason: string | null;
  created_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  pending: '대기',
  doing: '진행중',
  blocked: '차단',
  done: '완료',
  cancelled: '취소',
};
