// 팔란티어식 추천 엔진
// 현재 상태(스테이지 + 서류 + 최근 이벤트) 기반으로 "지금 할 행동" 계산.
// 새 정보/이벤트 들어오면 → 자동으로 다음 행동이 표면화.

import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { WorkflowDocs } from './types';

export type RecommendationPriority = 'urgent' | 'suggested' | 'optional';

export type RecommendationAction =
  // Stage 1 (consultation)
  | 'simulate_repayment'          // 변제계획 시뮬
  | 'recommend_path'              // 경로 추천 AI
  | 'generate_engagement_letter'  // 수임계약서
  // Stage 2 (doc_prep)
  | 'send_doc_request'            // 서류 요청 이메일
  | 'send_doc_reminder'           // 리마인더
  | 'send_portal_link'            // 고객 업로드 링크
  | 'advance_to_investigation'
  // Stage 3 (investigation)
  | 'detect_preferential_payment'
  | 'advance_to_creditor_response'
  // Stage 4 (creditor_response)
  | 'generate_creditor_notice'
  | 'advance_to_court_filing'
  // Stage 5 (court_filing)
  | 'draft_petition'
  | 'mark_court_filed'
  | 'advance_to_monitoring'
  // Stage 6
  | 'schedule_monthly_check'
  // Cross-stage
  | 'recalculate_repayment'
  | 'update_client_status';

export interface Recommendation {
  priority: RecommendationPriority;
  action: RecommendationAction;
  label: string;                  // 버튼 텍스트
  reason: string;                 // 왜 추천하는지
  icon?: string;
  pulse?: boolean;                // 새 정보 기반이면 강조
}

interface EngineState {
  caseType: string | null;
  currentStage: string | null;
  docs: WorkflowDocs;
  requiredDocKeys: string[];
  recentEvents: Array<{
    source_type: string;
    raw_content?: string | null;
    created_at: string;
    metadata?: Record<string, unknown> | null;
  }>;
  stageEnteredAt?: string | null;
  today: Date;
}

export function computeRecommendations(
  state: EngineState,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const stage = state.currentStage;
  const today = state.today;

  const hasActionEvent = (action: string) =>
    state.recentEvents.some((e) => {
      const m = e.metadata as { action?: string } | null;
      return m?.action === action;
    });

  const docKeyState = (k: string) => state.docs[k]?.status ?? 'missing';
  const receivedCount = state.requiredDocKeys.filter(
    (k) => docKeyState(k) === 'received',
  ).length;
  const total = state.requiredDocKeys.length;
  const requiredReceivedPct = total > 0 ? (receivedCount / total) * 100 : 0;
  const missing = state.requiredDocKeys.filter(
    (k) => docKeyState(k) === 'missing',
  );
  const requested = state.requiredDocKeys.filter(
    (k) => docKeyState(k) === 'requested',
  );
  const hasBankStatement = docKeyState('bank_statements_6m') === 'received';

  const daysInStage = state.stageEnteredAt
    ? differenceInCalendarDays(today, parseISO(state.stageEnteredAt))
    : 0;

  // ============ Stage 1: 초기 상담 & 수임 ============
  if (stage === 'consultation') {
    if (!hasActionEvent('engagement_letter')) {
      recs.push({
        priority: 'urgent',
        action: 'generate_engagement_letter',
        label: '수임계약서 생성',
        reason: '아직 수임계약서가 생성되지 않았습니다. 수임 증빙과 보수 합의 명문화를 위해 필요.',
        icon: '📝',
      });
    }
    if (!hasActionEvent('repayment_simulation')) {
      recs.push({
        priority: 'suggested',
        action: 'simulate_repayment',
        label: '변제계획 시뮬레이션',
        reason: '소득/채무로 월 변제액을 먼저 계산하면 수임 여부 및 경로 판단에 도움.',
        icon: '🧮',
      });
    }
    if (!hasActionEvent('path_recommendation')) {
      recs.push({
        priority: 'suggested',
        action: 'recommend_path',
        label: 'AI 경로 추천 (회생/파산/워크아웃)',
        reason: '상담자 상황에 맞는 최적 경로를 AI가 비교·추천합니다.',
        icon: '💡',
      });
    }
    if (hasActionEvent('engagement_letter') && daysInStage >= 3) {
      recs.push({
        priority: 'optional',
        action: 'send_doc_request',
        label: '서류 준비 단계로 진행',
        reason: '수임 완료 후 3일 경과. 다음 단계(서류 수집) 시작 시점입니다.',
        icon: '→',
      });
    }
  }

  // ============ Stage 2: 서류 준비 ============
  if (stage === 'document_prep') {
    // 요청 한 번도 안 함
    if (requested.length === 0 && missing.length > 0 && !hasActionEvent('send_doc_request')) {
      recs.push({
        priority: 'urgent',
        action: 'send_doc_request',
        label: `서류 ${missing.length}종 일괄 요청`,
        reason: '아직 고객에게 서류 요청이 나가지 않았습니다.',
        icon: '📧',
        pulse: true,
      });
    }

    // 포털 링크 안 보냈으면
    if (!hasActionEvent('portal_link') && missing.length >= 5) {
      recs.push({
        priority: 'suggested',
        action: 'send_portal_link',
        label: '고객 업로드 링크 전송',
        reason: '서류 다수가 미수령 상태. 고객이 직접 업로드할 수 있는 링크를 보내면 수령 속도가 올라갑니다.',
        icon: '🔗',
      });
    }

    // 요청 후 3일+ 미수령
    const stuckRequested = requested.filter((k) => {
      const st = state.docs[k];
      if (!st?.requested_at) return false;
      return differenceInCalendarDays(today, parseISO(st.requested_at)) >= 3;
    });
    if (stuckRequested.length > 0) {
      recs.push({
        priority: 'urgent',
        action: 'send_doc_reminder',
        label: `리마인더 발송 (${stuckRequested.length}종)`,
        reason: `${stuckRequested.length}종 서류가 요청 후 3일+ 미수령. 자동 cron도 있지만 즉시 발송 가능.`,
        icon: '⏰',
      });
    }

    // 18/20 이상 (90%+) 수령 → 다음 스테이지
    if (requiredReceivedPct >= 90) {
      recs.push({
        priority: 'urgent',
        action: 'advance_to_investigation',
        label: '재산·소득 조사 단계로 진행',
        reason: `필수 서류 ${receivedCount}/${total} 수령 완료 (${Math.round(requiredReceivedPct)}%). 조사 단계 진입 가능.`,
        icon: '→',
        pulse: true,
      });
    }

    // 통장내역 수령 시 → 편파변제 조기 탐지 제안
    if (hasBankStatement && !hasActionEvent('preferential_analysis')) {
      recs.push({
        priority: 'suggested',
        action: 'detect_preferential_payment',
        label: '편파변제 사전 탐지',
        reason: '통장내역이 수령됐습니다. 조사 단계 전에 미리 분석해두면 내용증명 대비 가능.',
        icon: '🔍',
        pulse: true,
      });
    }
  }

  // ============ Stage 3: 재산·소득 조사 ============
  if (stage === 'investigation') {
    if (!hasActionEvent('preferential_analysis') && hasBankStatement) {
      recs.push({
        priority: 'urgent',
        action: 'detect_preferential_payment',
        label: '편파변제 AI 탐지',
        reason: '통장내역 수령됨. 법정 쟁점(6개월 내 특정 채권자 편중) 탐지 필수.',
        icon: '🔍',
        pulse: true,
      });
    }

    // 편파변제 분석됐는데 내용증명 안 보낸 경우
    const prefEvent = state.recentEvents.find((e) => {
      const m = e.metadata as { action?: string; suspicious_count?: number } | null;
      return m?.action === 'preferential_analysis';
    });
    if (prefEvent) {
      const suspCount = (prefEvent.metadata as { suspicious_count?: number } | null)
        ?.suspicious_count ?? 0;
      if (suspCount > 0 && !hasActionEvent('creditor_notice')) {
        recs.push({
          priority: 'urgent',
          action: 'generate_creditor_notice',
          label: `내용증명 생성 (${suspCount}건 쟁점)`,
          reason: '편파변제 의심 거래 발견. 해당 채권자에게 개인회생 예정 통보 발송 필요.',
          icon: '📮',
          pulse: true,
        });
      }
    }

    if (hasActionEvent('preferential_analysis') && daysInStage >= 7) {
      recs.push({
        priority: 'suggested',
        action: 'advance_to_creditor_response',
        label: '채권자 대응 단계로 진행',
        reason: '조사 완료 후 1주 경과. 채권자 대응(내용증명) 단계 진입 가능.',
        icon: '→',
      });
    }
  }

  // ============ Stage 4: 채권자 대응 ============
  if (stage === 'creditor_response') {
    if (!hasActionEvent('creditor_notice')) {
      recs.push({
        priority: 'urgent',
        action: 'generate_creditor_notice',
        label: '내용증명 초안 생성',
        reason: '개인회생 신청 준비 중임을 채권자에게 통보하여 추심 정지 요청 필요.',
        icon: '📮',
      });
    }
    if (hasActionEvent('creditor_notice') && daysInStage >= 10) {
      recs.push({
        priority: 'suggested',
        action: 'advance_to_court_filing',
        label: '법원 제출 단계로 진행',
        reason: '채권자 통보 후 10일 경과. 신청서 조립 및 제출 준비.',
        icon: '→',
      });
    }
  }

  // ============ Stage 5: 법원 제출 ============
  if (stage === 'court_filing') {
    recs.push({
      priority: 'urgent',
      action: 'draft_petition',
      label: '개인회생 신청서 조립 (수동)',
      reason: '수집된 서류와 분석 결과로 신청서 작성. 자동 조립은 V1.5에 구현 예정.',
      icon: '⚖️',
    });
    if (!hasActionEvent('court_filed')) {
      recs.push({
        priority: 'suggested',
        action: 'mark_court_filed',
        label: '제출 완료 표시',
        reason: '전자소송에 제출한 후 사건번호 입력하면 변제 모니터링 단계로 자동 전환.',
        icon: '✓',
      });
    }
  }

  // ============ Stage 6: 변제 모니터링 ============
  if (stage === 'repayment_monitoring') {
    if (!hasActionEvent('monthly_schedule')) {
      recs.push({
        priority: 'suggested',
        action: 'schedule_monthly_check',
        label: '월별 변제 확인 자동화 설정',
        reason: '3년간 매월 변제 여부를 고객에게 자동 확인. 수동 관리 불필요.',
        icon: '📅',
      });
    }
  }

  // ============ 스테이지 무관: 이벤트 기반 ============
  // 신규 대화/전사에서 소득·채무 변동 힌트
  const hasRecentCommunication = state.recentEvents.some((e) => {
    const days = differenceInCalendarDays(today, parseISO(e.created_at));
    return days <= 7 && ['copilot', 'email', 'kakao', 'phone'].includes(e.source_type);
  });
  if (hasRecentCommunication && stage !== 'consultation') {
    const content = state.recentEvents
      .map((e) => (e.raw_content ?? '').toLowerCase())
      .join(' ');
    if (/소득|급여|월급|인상|삭감|퇴사|이직/.test(content)) {
      recs.push({
        priority: 'suggested',
        action: 'recalculate_repayment',
        label: '변제액 재계산 필요?',
        reason: '최근 상담/이메일에 소득 변동 언급 감지. 변제액 재시뮬 권장.',
        icon: '🔄',
        pulse: true,
      });
    }
  }

  return recs;
}
