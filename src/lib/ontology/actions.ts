// 글로벌 Action Catalog.
// 실제 handler는 src/app/actions/workflow.ts에 서버 액션으로 구현.

import type { ActionTypeDef } from './types';

export const ACTIONS: Record<string, ActionTypeDef> = {
  // ===== 서류 관리 =====
  send_doc_request: {
    key: 'send_doc_request',
    label: '서류 요청 이메일 발송',
    description:
      '선택한 서류에 대해 고객에게 발급 가이드 + 업로드 링크 이메일 전송.',
    handler: 'runSendDocRequest',
    required_role: 'member',
    side_effects: ['email', 'event_create'],
    audit_action: 'doc_requested',
    input_hints: ['수령할 서류 체크', '마감 기한 (선택)'],
  },
  send_doc_reminder: {
    key: 'send_doc_reminder',
    label: '미수령 서류 리마인더',
    description: '요청했는데 아직 안 온 서류만 자동으로 재요청.',
    handler: 'runSendDocReminder',
    required_role: 'member',
    side_effects: ['email', 'event_create'],
    audit_action: 'doc_reminded',
  },
  classify_uploaded_doc: {
    key: 'classify_uploaded_doc',
    label: 'AI 업로드 서류 자동 분류',
    description:
      '업로드된 파일을 Claude가 분석해서 어떤 서류 종류인지 자동 매칭.',
    handler: 'runClassifyUploaded',
    required_role: 'member',
    side_effects: ['llm_call', 'event_create'],
    audit_action: 'doc_classified',
  },
  detect_missing_docs: {
    key: 'detect_missing_docs',
    label: '누락 서류 탐지',
    description: '필수 서류 중 아직 안 받은 것 목록을 한 번에 확인.',
    handler: 'runDetectMissing',
    required_role: 'member',
    side_effects: [],
    audit_action: 'missing_docs_checked',
  },

  // ===== 문서 생성 =====
  generate_engagement_letter: {
    key: 'generate_engagement_letter',
    label: '수임계약서 초안 생성',
    description: '고객/사건 정보로 위임계약서 PDF 초안 자동 생성.',
    handler: 'runGenerateEngagementLetter',
    required_role: 'member',
    side_effects: ['pdf_gen', 'storage', 'event_create'],
    audit_action: 'engagement_letter_drafted',
  },
  generate_creditor_notice: {
    key: 'generate_creditor_notice',
    label: '내용증명 초안 (개인회생 예정 통보)',
    description:
      '각 채권자에게 "개인회생 신청 준비 중"을 통보하는 내용증명 생성.',
    handler: 'runGenerateCreditorNotice',
    required_role: 'member',
    side_effects: ['pdf_gen', 'storage'],
    audit_action: 'creditor_notice_drafted',
  },
  generate_rehab_petition_draft: {
    key: 'generate_rehab_petition_draft',
    label: '개인회생 신청서 초안 조립',
    description: '수집된 서류 + 기본 정보로 개인회생 신청서 초안 자동 조립.',
    handler: 'runGenerateRehabPetition',
    required_role: 'member',
    side_effects: ['pdf_gen', 'storage', 'llm_call'],
    audit_action: 'petition_drafted',
  },

  // ===== 분석 (개인회생 특화) =====
  detect_preferential_payment: {
    key: 'detect_preferential_payment',
    label: '편파변제 이력 탐지',
    description:
      '통장거래내역을 AI가 분석해서 개인회생 6개월 전 편파변제 의심 거래 추출.',
    handler: 'runDetectPreferentialPayment',
    required_role: 'member',
    side_effects: ['llm_call', 'event_create'],
    audit_action: 'preferential_payment_analyzed',
  },
  simulate_repayment_plan: {
    key: 'simulate_repayment_plan',
    label: '변제계획 시뮬레이션',
    description:
      '소득/채무/생계비 기반 최소변제액 계산. 3년/5년 플랜 비교.',
    handler: 'runSimulateRepayment',
    required_role: 'member',
    side_effects: [],
    audit_action: 'repayment_simulated',
  },
  recommend_rehab_path: {
    key: 'recommend_rehab_path',
    label: '경로 추천 (회생 vs 파산 vs 워크아웃)',
    description:
      '소득/재산/채무 비율 기반 최적 경로 추천. 각 옵션의 장단점 제시.',
    handler: 'runRecommendPath',
    required_role: 'member',
    side_effects: ['llm_call'],
    audit_action: 'path_recommended',
  },

  // ===== 고객 커뮤니케이션 =====
  send_client_update: {
    key: 'send_client_update',
    label: '고객 진행상황 안내 이메일',
    description:
      '현재 스테이지/진행률 기반 고객에게 진행 안내 이메일 자동 작성.',
    handler: 'runSendClientUpdate',
    required_role: 'member',
    side_effects: ['email', 'llm_call', 'event_create'],
    audit_action: 'client_updated',
  },
  schedule_monthly_reminder: {
    key: 'schedule_monthly_reminder',
    label: '월별 변제 확인 자동 리마인더 설정',
    description: '3년간 매월 고객에게 변제 확인 리마인더 발송 예약.',
    handler: 'runScheduleMonthlyReminder',
    required_role: 'member',
    side_effects: ['event_create'],
    audit_action: 'monthly_reminder_scheduled',
  },

  // ===== 스테이지 제어 =====
  advance_stage: {
    key: 'advance_stage',
    label: '다음 스테이지로 이동',
    description: '워크플로우 스테이지 수동 전환.',
    handler: 'runAdvanceStage',
    required_role: 'member',
    side_effects: ['state_transition', 'event_create'],
    audit_action: 'stage_advanced',
  },
  mark_court_filed: {
    key: 'mark_court_filed',
    label: '법원 제출 완료 기록',
    description:
      '전자소송에 제출한 후 사건번호 입력. 스테이지 자동 전환 + 이력 기록.',
    handler: 'runMarkCourtFiled',
    required_role: 'member',
    side_effects: ['state_transition', 'event_create'],
    audit_action: 'court_filed',
  },
};
