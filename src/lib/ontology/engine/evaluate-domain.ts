// 도메인 메타기반 전략 평가 엔진.
// domain.strategies 각각의 evaluate(input) 호출 → available/locked 분류.

import type { DomainOntology, StrategySpec } from '../core/types';
import type { StrategicOption } from '../intel-gaps';

export interface DomainEvalResult {
  available: StrategicOption[];
  locked: StrategicOption[];
}

export function evaluateDomain(
  domain: DomainOntology,
  input: unknown,
): DomainEvalResult {
  const available: StrategicOption[] = [];
  const locked: StrategicOption[] = [];

  for (const spec of domain.strategies) {
    const res = spec.evaluate(input);
    const met = res.conditions.length > 0 && res.conditions.every((c) => c.met);
    const partial = !met && res.conditions.some((c) => c.met);

    const blockedBy = met
      ? undefined
      : res.conditions
          .filter((c) => !c.met)
          .map((c) => c.label)
          .join(', ') + ' 필요';

    const card: StrategicOption = {
      key: spec.key,
      label: spec.label,
      category: spec.category,
      icon: spec.icon,
      reasoning: res.reasoning(met),
      risk: res.risk,
      upside: res.upside,
      requirements_met: met,
      blocked_by: blockedBy,
      activation_conditions: res.conditions,
      targetActor: spec.targetActor,
    };

    if (met) available.push(card);
    else if (partial) locked.push(card);
  }

  return { available, locked };
}

/** 전략 key로 StrategySpec 찾기 (requiredEvidence 조회 등에 사용) */
export function findStrategy(
  domain: DomainOntology,
  key: string,
): StrategySpec | null {
  return domain.strategies.find((s) => s.key === key) ?? null;
}
