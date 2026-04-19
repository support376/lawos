// 분야별 템플릿 — 여기에 새 분야 추가하면 끝. 코드 수정 없음.

import type { CaseTemplate } from './types';

export const TEMPLATES: Record<string, CaseTemplate> = {
  personal_rehab: {
    case_type: 'personal_rehab',
    name: '개인회생',
    description:
      '소득 있는 채무자의 변제계획을 법원이 인가, 3년 변제 후 면책. 서류·조사 집약적.',
    version: 1,
    stages: [
      {
        key: 'consultation',
        label: '초기 상담 & 수임',
        description: '사실관계 파악, 경로 추천, 수임 확정',
        order: 1,
        required_doc_keys: [],
        suggested_actions: [
          'recommend_rehab_path',
          'generate_engagement_letter',
          'send_client_update',
        ],
        typical_duration_days: 7,
      },
      {
        key: 'document_prep',
        label: '서류 준비',
        description: '20여종 필수 서류 수집',
        order: 2,
        required_doc_keys: [
          'resident_reg',
          'family_reg',
          'marriage_reg',
          'income_tax_withholding',
          'employment_cert',
          'pay_stubs_6m',
          'national_tax_cert',
          'local_tax_cert',
          'health_ins_history',
          'debt_cert',
          'card_usage',
          'bank_statements_6m',
        ],
        suggested_actions: [
          'send_doc_request',
          'send_doc_reminder',
          'classify_uploaded_doc',
          'detect_missing_docs',
        ],
        typical_duration_days: 21,
        auto_advance_when: { min_docs_received: 10 },
      },
      {
        key: 'investigation',
        label: '재산·소득 조사',
        description: '편파변제·재산 은닉 여부 검토',
        order: 3,
        suggested_actions: [
          'detect_preferential_payment',
          'simulate_repayment_plan',
        ],
        typical_duration_days: 14,
      },
      {
        key: 'creditor_response',
        label: '채권자 대응',
        description: '내용증명 발송, 추심 정지',
        order: 4,
        suggested_actions: ['generate_creditor_notice'],
        typical_duration_days: 7,
      },
      {
        key: 'court_filing',
        label: '법원 제출 & 진행',
        description: '신청서 조립 → 전자소송 제출 → 개시 결정',
        order: 5,
        suggested_actions: [
          'generate_rehab_petition_draft',
          'mark_court_filed',
          'send_client_update',
        ],
        typical_duration_days: 90,
      },
      {
        key: 'repayment_monitoring',
        label: '변제 모니터링 (3년)',
        description: '매월 변제 확인, 면책 신청 타이밍 관리',
        order: 6,
        suggested_actions: [
          'schedule_monthly_reminder',
          'send_client_update',
        ],
        typical_duration_days: 1095,
      },
    ],
    document_keys: [
      'resident_reg', 'family_reg', 'marriage_reg', 'seal_cert',
      'real_estate_title', 'land_ledger', 'car_registration', 'lease_contract',
      'income_tax_withholding', 'employment_cert', 'pay_stubs_6m', 'business_reg_cert',
      'national_tax_cert', 'local_tax_cert',
      'four_ins_cert', 'health_ins_history',
      'debt_cert', 'card_usage', 'bank_statements_6m',
      'surety_cert',
    ],
    action_keys: [
      'send_doc_request', 'send_doc_reminder', 'classify_uploaded_doc',
      'detect_missing_docs', 'generate_engagement_letter',
      'generate_creditor_notice', 'generate_rehab_petition_draft',
      'detect_preferential_payment', 'simulate_repayment_plan',
      'recommend_rehab_path', 'send_client_update',
      'schedule_monthly_reminder', 'advance_stage', 'mark_court_filed',
    ],
  },

  // 추후 추가:
  // divorce: { ... },
  // criminal: { ... },
};

export function getTemplate(caseType: string): CaseTemplate | null {
  return TEMPLATES[caseType] ?? null;
}
