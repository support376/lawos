// ⚠️ 선행조건: 반드시 precedent-rag.ts(#81) 먼저 가동할 것.
// LLM이 판례 근거 없이 전략을 생성하면 환각 리스크 치솟음.
// 모든 제안에 인용 판례 caseNo 강제 + confidence 0.7 미만 결과 표시 금지.
//
// 레이어 3: LLM + 규칙 하이브리드 전략 생성
// 기존 하드코딩 9전략(규칙)을 유지한 상태에서,
// LLM이 free_notes + 유사판례 + 상대방 프로파일을 읽어 *추가* 전략 제안.
//
// 흐름:
// 1) rule-based (intel-gaps.ts) → 기본 전략 후보
// 2) LLM 호출: "이 사건에 기존 카탈로그 외 추가 전략 있는지" 질의
//    - 인풋: 의뢰인 인텔 + free_notes + 유사판례 + 이미 제시된 전략
//    - 아웃풋: 신규 전략 제안 (근거/승산 포함)
// 3) UI에서 "AI 제안 (검증필요)" 배지로 구분 표시

import type { StrategicOption } from '../intel-gaps';

export interface AISuggestedStrategy extends StrategicOption {
  source: 'ai_suggestion';
  confidence: number;        // 0..1
  precedentRefs?: string[];  // PrecedentHit.caseNo[]
  needsReview: true;
}

// TODO: Anthropic Claude Sonnet 4.5 호출로 generateObject 사용
export async function suggestAdditionalStrategies(_input: {
  clientIntel: Record<string, unknown>;
  freeNotes: string | null;
  existingStrategies: StrategicOption[];
  similarPrecedents: Array<{ caseNo: string; summary: string }>;
}): Promise<AISuggestedStrategy[]> {
  return [];
}
