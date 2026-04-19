// 전략 추천 엔진 — 팔란티어 Gotham의 "적 프로필 × 전술 플레이북" 매칭.
// 각 사건의 상대방 프로필을 기반으로 가장 효과적인 전술을 추천.

import { TACTICS, type Tactic } from './tactics';

export interface CounterpartyProfile {
  id: string;
  name: string;
  role?: string | null;
  weaknesses?: Array<{
    label: string;
    source_type?: string;
    legality?: 'clear_legal' | 'requires_judgment' | null;
  }>;
  personality_tags?: string[];
  consent_recorded: boolean;
}

export interface TacticRecommendation {
  tactic: Tactic;
  match_score: number;         // 0~1, 상대 약점 매칭 정도
  matched_triggers: string[];  // 상대 프로필에서 매칭된 약점
  caution: string[];           // 집중 리스크
}

/**
 * 상대방 프로필 + 사건 유형으로 적합한 전술 순위화
 */
export function recommendTactics(input: {
  caseType: string;
  counterparty?: CounterpartyProfile | null;
  adoptedTacticKeys?: string[]; // 이미 채택된 전술은 제외
}): TacticRecommendation[] {
  const applicable = Object.values(TACTICS).filter((t) =>
    t.applicable_case_types.includes(input.caseType),
  );

  const adopted = new Set(input.adoptedTacticKeys ?? []);

  const weaknessLabels = (input.counterparty?.weaknesses ?? []).map((w) =>
    w.label.toLowerCase(),
  );
  const personality = (input.counterparty?.personality_tags ?? []).map((t) =>
    t.toLowerCase(),
  );
  const profileTags = new Set([...weaknessLabels, ...personality]);

  const recs: TacticRecommendation[] = [];
  for (const t of applicable) {
    if (adopted.has(t.key)) continue;

    const matchedTriggers: string[] = [];
    for (const trigger of t.counterparty_triggers) {
      // 약점/성격 태그 중 이 trigger와 부분 일치하는 게 있나
      const triggerLower = trigger.toLowerCase();
      for (const tag of profileTags) {
        if (tag.includes(triggerLower) || triggerLower.includes(tag)) {
          matchedTriggers.push(trigger);
          break;
        }
      }
    }

    // 매칭 점수: 트리거 있는 전술은 +0.4씩, 없는 전술은 기본 0.5
    const triggerScore =
      t.counterparty_triggers.length > 0
        ? matchedTriggers.length / t.counterparty_triggers.length
        : 0;
    const base = t.counterparty_triggers.length === 0 ? 0.5 : 0;
    const matchScore = Math.min(1, base + triggerScore * 0.5);

    // 주의사항 수집
    const caution: string[] = [];
    if (t.risk_level === 'high') caution.push(`⚠ 고위험: ${t.risk_description}`);
    if (t.requires_client_consent && !input.counterparty?.consent_recorded) {
      caution.push('📋 의뢰인 동의 기록 필요');
    }
    if (t.professional_notes) caution.push(t.professional_notes);

    recs.push({
      tactic: t,
      match_score: matchScore,
      matched_triggers: matchedTriggers,
      caution,
    });
  }

  // 매칭 점수 → 성공률 → 리스크 순으로 정렬
  return recs.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    const aS = a.tactic.estimated_success ?? 0;
    const bS = b.tactic.estimated_success ?? 0;
    if (bS !== aS) return bS - aS;
    // 낮은 리스크 우선
    const riskOrder = { low: 0, medium: 1, high: 2 };
    return riskOrder[a.tactic.risk_level] - riskOrder[b.tactic.risk_level];
  });
}
