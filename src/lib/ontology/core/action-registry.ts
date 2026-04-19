// 온톨로지 v0.3 — ACTION_REGISTRY 선언 모듈
// 새 Action 추가 = 이 배열에 한 줄. 핸들러는 src/app/actions/{key}.ts.

import type { Role } from './roles';
import type { SubjectType } from './objects';

export interface ActionSpec {
  key: string;
  label: string;
  description?: string;
  subject_types: SubjectType[];
  allowed_roles: Role[];
  required_params?: Record<string, 'string' | 'number' | 'date' | 'uuid' | 'boolean'>;
  produces?: {
    object_type?: 'communication' | 'action' | 'payment_schedule' | 'rehab_interaction' | 'rehab_court_order';
    event?: string;
    state_change?: string;
  };
  auto_trigger?: {
    on: string;
    debounce_days?: number;
  };
}

export const ACTION_REGISTRY: ActionSpec[] = [
  // ======================= Lead =======================
  {
    key: 'create_lead',
    label: '리드 등록',
    subject_types: ['lead'],
    allowed_roles: ['consultant', 'managing_partner', 'admin'],
    required_params: { name: 'string' },
  },
  {
    key: 'log_consultation',
    label: '상담 기록',
    description: '상담 대화·통화를 Communication으로 기록',
    subject_types: ['lead', 'case', 'client'],
    allowed_roles: ['consultant', 'attorney', 'managing_partner', 'admin'],
    required_params: { channel: 'string', content: 'string' },
    produces: { object_type: 'communication' },
  },
  {
    key: 'qualify_lead',
    label: '리드 자격 판정',
    subject_types: ['lead'],
    allowed_roles: ['consultant', 'managing_partner'],
    produces: { state_change: 'lead.status = qualified | lost' },
  },
  {
    key: 'convert_to_case',
    label: '수임 확정',
    description: 'Lead → Case + 착수금 PaymentContract 생성',
    subject_types: ['lead'],
    allowed_roles: ['consultant', 'attorney', 'managing_partner'],
    produces: { state_change: 'lead.status = converted; case created' },
  },
  {
    key: 'drop_lead',
    label: '리드 이탈',
    subject_types: ['lead'],
    allowed_roles: ['consultant', 'managing_partner'],
    required_params: { lost_reason: 'string' },
    produces: { state_change: 'lead.status = lost' },
  },
  {
    key: 'reassign_consultant',
    label: '상담원 재배정',
    subject_types: ['lead'],
    allowed_roles: ['managing_partner'],
    required_params: { new_consultant_id: 'uuid' },
  },

  // ======================= Case (개인회생) =======================
  {
    key: 'upsert_debtor',
    label: '채무자 프로필 입력',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'managing_partner'],
  },
  {
    key: 'add_debt',
    label: '채무 추가',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'document_staff', 'managing_partner'],
  },
  {
    key: 'add_asset',
    label: '재산 추가',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'document_staff', 'managing_partner'],
  },
  {
    key: 'add_income',
    label: '소득 추가',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'document_staff', 'managing_partner'],
  },
  {
    key: 'add_dependent',
    label: '부양가족 추가',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'document_staff', 'managing_partner'],
  },
  {
    key: 'analyze_preferential',
    label: '편파변제 분석',
    subject_types: ['case'],
    allowed_roles: ['analysis_staff', 'attorney', 'managing_partner'],
  },
  {
    key: 'simulate_repayment',
    label: '변제계획 시뮬',
    subject_types: ['case'],
    allowed_roles: ['analysis_staff', 'attorney', 'managing_partner'],
  },
  {
    key: 'advance_stage',
    label: 'Stage 전이',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'managing_partner'],
    required_params: { to_stage: 'string' },
  },
  {
    key: 'respond_correction',
    label: '보정 대응',
    subject_types: ['case'],
    allowed_roles: ['correction_staff', 'attorney', 'managing_partner'],
    produces: { object_type: 'rehab_interaction' },
  },
  {
    key: 'file_appeal',
    label: '즉시항고 제기',
    subject_types: ['case'],
    allowed_roles: ['correction_staff', 'attorney', 'managing_partner'],
    produces: { object_type: 'rehab_interaction' },
  },
  {
    key: 'draft_petition',
    label: '신청서 초안',
    subject_types: ['case'],
    allowed_roles: ['analysis_staff', 'attorney', 'managing_partner'],
  },
  {
    key: 'log_court_order',
    label: '법원 명령 기록',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'managing_partner'],
    produces: { object_type: 'rehab_court_order' },
  },
  {
    key: 'record_repayment_event',
    label: '변제 이벤트 기록',
    subject_types: ['case'],
    allowed_roles: ['billing_staff', 'attorney', 'managing_partner'],
  },

  // ======================= Communication 범용 =======================
  {
    key: 'log_communication',
    label: '접촉 기록',
    subject_types: ['lead', 'case', 'client'],
    allowed_roles: [
      'managing_partner', 'attorney', 'consultant',
      'document_staff', 'billing_staff', 'admin',
    ],
    produces: { object_type: 'communication' },
  },
  {
    key: 'send_kakao_message',
    label: '카톡 발송',
    subject_types: ['lead', 'case', 'client'],
    allowed_roles: ['managing_partner', 'consultant', 'billing_staff', 'attorney'],
    produces: { object_type: 'communication' },
  },

  // ======================= Payment =======================
  {
    key: 'create_payment_contract',
    label: '수임료 계약 생성',
    description: '분할·총액·주기 정해서 계약. N개 PaymentSchedule 자동 생성.',
    subject_types: ['case'],
    allowed_roles: ['billing_staff', 'attorney', 'managing_partner'],
    required_params: { total_amount_krw: 'number', installment_count: 'number' },
    produces: { object_type: 'payment_schedule' },
  },
  {
    key: 'confirm_payment',
    label: '입금 확인',
    subject_types: ['payment_schedule'],
    allowed_roles: ['billing_staff', 'managing_partner'],
    required_params: { paid_amount_krw: 'number' },
    produces: { state_change: 'payment_schedule.status updated' },
  },
  {
    key: 'send_dunning',
    label: '독촉 발송',
    subject_types: ['payment_schedule'],
    allowed_roles: ['billing_staff', 'managing_partner'],
    produces: { object_type: 'communication' },
    auto_trigger: { on: 'payment_schedule.overdue' },
  },
  {
    key: 'waive_payment',
    label: '결제 면제',
    subject_types: ['payment_schedule'],
    allowed_roles: ['managing_partner'],
    required_params: { reason: 'string' },
  },
  {
    key: 'issue_invoice',
    label: '세금계산서 발행',
    subject_types: ['payment_schedule'],
    allowed_roles: ['billing_staff', 'managing_partner'],
  },
  {
    key: 'refund_payment',
    label: '환불 처리',
    subject_types: ['payment_schedule'],
    allowed_roles: ['managing_partner'],
    required_params: { reason: 'string', amount_krw: 'number' },
  },

  // ======================= 수임 컨펌·할당 (2단계 승인) =======================
  {
    key: 'confirm_new_case',
    label: '신규 수임 컨펌·할당',
    description: '수임 확정 후 대표변호사가 담당자 지정 + 승인. Stage 전이 + 후속 Action 자동 배포.',
    subject_types: ['case'],
    allowed_roles: ['managing_partner', 'attorney'],
    required_params: { assigned_to: 'uuid' },
    produces: { state_change: 'case.assigned_to + stage + follow-up actions' },
  },
  {
    key: 'initial_writer_task',
    label: '신규 사건 검토',
    description: '담당 변호사에게 할당되는 첫 업무. 채무자 프로필 입력부터 시작.',
    subject_types: ['case'],
    allowed_roles: ['attorney', 'managing_partner'],
  },
  {
    key: 'initial_document_request',
    label: '필수 서류 요청 (20종)',
    description: '서류팀에 자동 배정. 의뢰인에게 서류 목록 안내·수집 시작.',
    subject_types: ['case'],
    allowed_roles: ['document_staff', 'attorney', 'managing_partner'],
  },

  // ======================= 시스템 자동 =======================
  {
    key: 'auto_overdue_check',
    label: '연체 일단위 감지',
    subject_types: ['payment_schedule'],
    allowed_roles: ['managing_partner'],
    auto_trigger: { on: 'cron.daily' },
  },
  {
    key: 'auto_cold_lead',
    label: 'Cold Lead 표시',
    subject_types: ['lead'],
    allowed_roles: ['managing_partner'],
    auto_trigger: { on: 'cron.daily', debounce_days: 30 },
  },
  {
    key: 'auto_stage_deadline_warning',
    label: 'Stage 장기체류 경고',
    subject_types: ['case'],
    allowed_roles: ['managing_partner'],
    auto_trigger: { on: 'cron.weekly' },
  },
];

// =========================================================================
// Registry 조회 유틸
// =========================================================================

export function getActionSpec(key: string): ActionSpec | null {
  return ACTION_REGISTRY.find((a) => a.key === key) ?? null;
}

export function listActionsForSubject(
  subjectType: SubjectType,
  userRoles: Role[],
): ActionSpec[] {
  return ACTION_REGISTRY.filter(
    (a) =>
      a.subject_types.includes(subjectType) &&
      a.allowed_roles.some((r) => userRoles.includes(r)),
  );
}

export function isActionAllowed(
  actionKey: string,
  userRoles: Role[],
): boolean {
  const spec = getActionSpec(actionKey);
  if (!spec) return false;
  return spec.allowed_roles.some((r) => userRoles.includes(r));
}
