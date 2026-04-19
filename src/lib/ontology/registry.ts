// caseType → 도메인 매핑. 새 도메인 추가시 여기만 수정.

import type { DomainOntology } from './core/types';
import { personalRehabDomain } from './domains/personal_rehab';
import { divorceDomain } from './domains/divorce';

export const DOMAIN_REGISTRY: Record<string, DomainOntology> = {
  personal_rehab: personalRehabDomain,
  divorce: divorceDomain,
  // criminal: criminalDomain,   // TODO
  // civil: civilDomain,         // TODO
};

export function getDomain(caseType: string | null | undefined): DomainOntology | null {
  if (!caseType) return null;
  return DOMAIN_REGISTRY[caseType] ?? null;
}
