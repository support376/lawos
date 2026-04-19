// 전략(StrategicOption) 채택 시 자동으로 생성할 칸반 티켓들.
// "전략 선택 → 행정 실행" 자동화의 핵심.

import type { TicketType, Priority } from '@/lib/types';

export interface TacticTicketTemplate {
  title: string;
  type: TicketType;
  priority: Priority;
  description?: string;
  waiting_on?: 'client' | 'court' | 'opposing' | null;
  due_in_days?: number | null; // 오늘부터 N일 이내 마감
}

// strategic option key → 자동 생성할 티켓 목록
export const TACTIC_TO_TICKETS: Record<string, TacticTicketTemplate[]> = {
  // ========== 편파변제 선제 소명 ==========
  preemptive_defense: [
    {
      title: '의심거래 영수증·증빙 수집',
      type: 'document_request',
      priority: 1,
      description: 'AI가 탐지한 의심거래 각각에 대한 지급 사유·긴급성·객관 증빙 확보',
      waiting_on: 'client',
      due_in_days: 7,
    },
    {
      title: '편파변제 소명서 초안 작성',
      type: 'promise',
      priority: 1,
      description: '각 거래별 법정 판단기준(친족·관계인·시기·금액) 대비 방어 논리',
      due_in_days: 14,
    },
    {
      title: '법원 보정명령 빈출사유 체크',
      type: 'follow_up',
      priority: 2,
      description: '해당 법원 최근 판례·보정사유 확인 후 대응',
      due_in_days: 10,
    },
  ],

  // ========== 채권자 내용증명 선제 발송 ==========
  creditor_notice_preempt: [
    {
      title: '채권자별 내용증명 초안 준비',
      type: 'document_request',
      priority: 2,
      description: '각 채권자에게 개인회생 신청 예정 통보 + 추심 정지 요청',
      due_in_days: 5,
    },
    {
      title: '우체국 등기발송 예약 (또는 내용증명 우편)',
      type: 'promise',
      priority: 2,
      description: '증거력 있는 발송 채널 사용',
      due_in_days: 7,
    },
    {
      title: '채권자 회신 모니터링 (7일)',
      type: 'follow_up',
      priority: 3,
      description: '수령 거부·회신 내용 기록',
      waiting_on: 'opposing',
      due_in_days: 14,
    },
  ],

  // ========== 변제율 조정 여력 검토 ==========
  repayment_negotiate: [
    {
      title: '채권자집회 시나리오 3안 준비',
      type: 'promise',
      priority: 2,
      description: '기본안 / +2% 안 / +5% 안 — 각 시나리오별 인가 확률·리스크',
      due_in_days: 14,
    },
    {
      title: '가처분소득 여유 정밀 재계산',
      type: 'follow_up',
      priority: 3,
      description: '증액 여지 확정. 의뢰인 부양 부담 재확인.',
      due_in_days: 10,
    },
  ],

  // ========== 재산 은닉 반증 자료 구축 ==========
  asset_audit: [
    {
      title: '전 계좌 내역 재점검 (가족 명의 포함 확인)',
      type: 'document_request',
      priority: 2,
      description: '본인·배우자·미성년 자녀 계좌 전수 확인',
      waiting_on: 'client',
      due_in_days: 14,
    },
    {
      title: '부동산 공시지가·등기부 조회',
      type: 'follow_up',
      priority: 3,
      description: '재산목록 vs 공부 교차 검증',
      due_in_days: 10,
    },
    {
      title: '법인 실소유 정황 점검 (해당시)',
      type: 'follow_up',
      priority: 3,
      description: '등기상 명의자 외 실제 지배 여부',
      due_in_days: 14,
    },
  ],

  // ========== 고부채 소득활용 방어 ==========
  high_value_defense: [
    {
      title: '소득 증빙 전수 확보 (급여·사업·부업)',
      type: 'document_request',
      priority: 1,
      description: '회생재산 산정시 소득 과대평가 방지용 반박자료',
      waiting_on: 'client',
      due_in_days: 10,
    },
    {
      title: '변제율 시나리오 다중 산정 (15/20/25%)',
      type: 'promise',
      priority: 2,
      description: '각 시나리오별 인가 확률·월부담',
      due_in_days: 14,
    },
  ],

  // ========== 면책불허 리스크 방어 (도박) ==========
  discharge_defense: [
    {
      title: '도박 관련 치료·반성 증빙 수집',
      type: 'document_request',
      priority: 1,
      description: '치료기록·단도박 모임·상담 기록 등 의지입증 자료',
      waiting_on: 'client',
      due_in_days: 14,
    },
    {
      title: '도박 vs 생활비 지출 구분 소명서',
      type: 'promise',
      priority: 1,
      description: '사행성 vs 필요성 구분 + 면책허가결정례 인용',
      due_in_days: 21,
    },
    {
      title: '§564 면책불허 판례 조사',
      type: 'follow_up',
      priority: 2,
      description: '유사사안 최근 판례 + 해당 법원 성향',
      due_in_days: 10,
    },
  ],

  // ========== 재신청 특수 대응 ==========
  reapplication_strategy: [
    {
      title: '이전 면책확정일·사건번호 확보',
      type: 'document_request',
      priority: 1,
      description: '7년 경과 계산 기준. 결정문 사본 입수',
      waiting_on: 'client',
      due_in_days: 7,
    },
    {
      title: '사정변경 소명서 (§624 재신청 요건)',
      type: 'promise',
      priority: 1,
      description: '이전 신청과 비교한 소득·가족·건강·사업 변동',
      due_in_days: 14,
    },
  ],

  // ========== 은닉의심 자산 자진 공개 ==========
  voluntary_disclosure: [
    {
      title: '의심자산 전수 목록화 (취득경위 포함)',
      type: 'document_request',
      priority: 1,
      description: '자진 공개 원칙. 감출 생각 없음 어필',
      waiting_on: 'client',
      due_in_days: 7,
    },
    {
      title: '자진 공개 설명서 작성',
      type: 'promise',
      priority: 1,
      description: '법원 조사 전 선제 제출 — 악의 부정 논리',
      due_in_days: 14,
    },
  ],

  // ========== 병행소송 영향평가 ==========
  parallel_suit_mgmt: [
    {
      title: '병행소송 현황 정리표',
      type: 'document_request',
      priority: 2,
      description: '사건번호·쟁점·예상결과·재무영향',
      waiting_on: 'client',
      due_in_days: 10,
    },
    {
      title: '승소/패소 각 시나리오 변제능력 재시뮬',
      type: 'promise',
      priority: 2,
      description: '변수 제거 후 인가 안정성 확보',
      due_in_days: 14,
    },
  ],
};

// 전략 채택 시 기본 설명 (이벤트 로그용)
export const TACTIC_ADOPTION_LABEL: Record<string, string> = {
  preemptive_defense: '편파변제 선제 소명 전략',
  creditor_notice_preempt: '채권자 내용증명 선제 발송',
  repayment_negotiate: '변제율 조정 여력 확보',
  asset_audit: '재산 은닉 반증 자료 구축',
  high_value_defense: '고부채 사건 소득활용 방어',
  discharge_defense: '면책불허 리스크 방어',
  reapplication_strategy: '재신청 특수 대응',
  voluntary_disclosure: '은닉의심 자산 자진 공개',
  parallel_suit_mgmt: '병행소송 영향 평가',
};
