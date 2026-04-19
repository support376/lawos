// ⚠️ EXPERIMENTAL — 프로덕션 wire 금지
// ──────────────────────────────────────────────────────────
// 변호사법 §26 (법률사무 유사행위) 리스크 극도로 높음.
// 없는 판례·조문 창작 가능성 있음. eval 파이프라인 + 법적 검토 완성 전까지
// 절대 호출부 추가 금지. 이 파일은 "자리"만 유지.
// 해제 조건:
//   1. 판례 RAG(#81) 작동 + 정확도 측정 완료
//   2. AI 정확도 eval set(#88) 구축
//   3. 신뢰도 뱃지 강제 UI(#89) 적용
//   4. 변호사법 §26 법적 검토 확인
// ──────────────────────────────────────────────────────────
//
// 레이어 4: 창발적 논리 제안 (판례에도 없을 때)
// 기존 규칙·유사판례에 매칭되지 않는 "온톨로지 갭" 사건일 때,
// 법령 조문 그래프를 활용해 LLM이 신규 법리 초안 생성.
//
// 전제조건:
// - 법령 그래프: 조문 → 요건(element) → 효과(effect) 관계 임베딩
// - "이 사건의 사실관계에서 어떤 조문의 요건이 충족될 여지가 있는가" 역추론
//
// 안전장치:
// - 반드시 "이 전략은 판례 없음. 법률가 검토 필수" 경고 표시
// - ontology_gaps 테이블에 제안 로그 적재 → 주기 리뷰

export interface NovelTheory {
  proposedTitle: string;
  legalBasisSteps: Array<{
    statute: string;      // "민법 §750"
    element: string;      // "위법성"
    reasoning: string;
  }>;
  risks: string[];
  precedentAbsent: true;
  reviewRequired: true;
}

// TODO: 법령 그래프 RAG + LLM 역추론
export async function synthesizeNovelTheory(_input: {
  caseType: string;
  situation: string;
  failedMatches: string[];    // 기존 전략 어떤 것도 활성 안 됐는지
}): Promise<NovelTheory | null> {
  return null;
}
