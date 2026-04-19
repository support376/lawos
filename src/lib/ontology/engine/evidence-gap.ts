// 레이어 1: 증거 갭 분석 (규칙기반, LLM 0%)
// StrategySpec.requiredEvidence(자연어 라벨 배열)을 현재 수집된 증거와 대조 → 누락 노출.
//
// 증거 소스:
// - workflow_docs: key별 received 여부 (구조화)
// - attachments: original_name (자연어)
// - 향후 event metadata 등
//
// 매칭 전략 (간단): 라벨 토큰이 (수령된 문서 label/키 OR 첨부 파일명) 에 하나라도 포함되면 OK.
// 과잉매칭보다 누락탐지가 목적이므로 느슨한 편이 안전.

import type { DomainOntology, StrategySpec } from '../core/types';
import type { WorkflowDocs } from '../types';
import { DOCUMENTS } from '../documents';

export interface EvidenceGap {
  strategyKey: string;
  strategyLabel: string;
  missingEvidence: string[];
  satisfiedEvidence: string[];
  coveragePct: number;
  suggestedTickets: Array<{
    title: string;
    type: 'document_request' | 'follow_up';
    waiting_on: 'client' | 'court' | null;
  }>;
}

export interface EvidenceCorpus {
  /** 수령 완료된 workflow_docs 키들 */
  receivedDocKeys: string[];
  /** 첨부파일 원본명 */
  attachmentNames: string[];
}

export function buildEvidenceCorpus(input: {
  workflowDocs: WorkflowDocs;
  attachments: Array<{ original_name: string | null }>;
}): EvidenceCorpus {
  const receivedDocKeys = Object.entries(input.workflowDocs)
    .filter(([, v]) => v?.status === 'received')
    .map(([k]) => k);
  const attachmentNames = input.attachments
    .map((a) => (a.original_name ?? '').toLowerCase())
    .filter(Boolean);
  return { receivedDocKeys, attachmentNames };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '').replace(/[·,./\-]/g, '');
}

/** 필요 증거 라벨 1건이 증거 corpus에서 커버되는지 */
function isCovered(label: string, corpus: EvidenceCorpus): boolean {
  const target = normalize(label);
  // 1) workflow_docs 수령된 키의 DOCUMENT label/desc와 비교
  for (const k of corpus.receivedDocKeys) {
    const doc = DOCUMENTS[k];
    if (!doc) continue;
    const hayLabel = normalize(doc.label);
    const hayKey = normalize(k);
    if (hayLabel.includes(target) || target.includes(hayLabel)) return true;
    if (hayKey.includes(target) || target.includes(hayKey)) return true;
  }
  // 2) 첨부파일 원본명
  for (const name of corpus.attachmentNames) {
    const n = normalize(name);
    if (n.includes(target) || target.includes(n.slice(0, 8))) return true;
  }
  return false;
}

export function analyzeEvidenceGaps(
  domain: DomainOntology,
  activeStrategyKeys: string[],
  corpus: EvidenceCorpus,
): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  const strategies: StrategySpec[] = domain.strategies.filter((s) =>
    activeStrategyKeys.includes(s.key),
  );

  for (const s of strategies) {
    const required = s.requiredEvidence ?? [];
    if (required.length === 0) continue;

    const missing: string[] = [];
    const satisfied: string[] = [];
    for (const ev of required) {
      if (isCovered(ev, corpus)) satisfied.push(ev);
      else missing.push(ev);
    }
    if (missing.length === 0) continue;

    const coveragePct = Math.round((satisfied.length / required.length) * 100);
    gaps.push({
      strategyKey: s.key,
      strategyLabel: s.label,
      missingEvidence: missing,
      satisfiedEvidence: satisfied,
      coveragePct,
      suggestedTickets: missing.map((ev) => ({
        title: `${ev} 수집`,
        type: 'document_request' as const,
        waiting_on: 'client' as const,
      })),
    });
  }
  return gaps;
}
