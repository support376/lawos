// 레이어 2: 판례 RAG
// 대법원·하급심 판결문 임베딩 DB에서 현재 사건과 유사한 판례 N건 검색.
// 승/패 비율, 핵심쟁점, 적용 법리 반환.
//
// 구현 계획:
// - pgvector 테이블: precedents (id, court, case_no, ruling_date,
//                                summary, full_text, embedding vector(1536))
// - 인덱싱 소스: 대법원 판결문 오픈데이터 (ecourt 등)
// - 검색: OpenAI embeddings(text-embedding-3-small) → cosine similarity

export interface PrecedentHit {
  caseNo: string;
  court: string;
  rulingDate: string;
  summary: string;
  outcome: 'plaintiff_win' | 'defendant_win' | 'partial' | 'unknown';
  similarity: number;
  keyReasoning?: string;
}

// TODO: pgvector 쿼리 + Anthropic 임베딩 연결
export async function findSimilarPrecedents(
  _input: { caseType: string; situation: string; facts: string[] },
  _topK: number = 5,
): Promise<PrecedentHit[]> {
  return [];
}
