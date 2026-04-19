// 개인회생 도메인 — intel-gaps.ts / ClientProfile / templates.ts 통합.

import type { DomainOntology } from '../../core/types';
import { DOCUMENTS } from '../../documents';
import { TEMPLATES } from '../../templates';
import { personalRehabStrategies } from './strategies';
import { personalRehabActors } from './actors';

const rehabTemplate = TEMPLATES['personal_rehab'];
const docKeys = rehabTemplate?.document_keys ?? [];

export const personalRehabDomain: DomainOntology = {
  caseType: 'personal_rehab',
  label: '개인회생',
  version: '0.3.0',
  actors: personalRehabActors,
  clientFields: [
    {
      key: 'monthly_income_krw',
      label: '월 소득',
      kind: 'number_krw',
      required: true,
      placeholder: '예: 3000000',
      usedBy: ['repayment_negotiate', 'high_value_defense'],
    },
    {
      key: 'total_debt_krw',
      label: '총 부채',
      kind: 'number_krw',
      required: true,
      usedBy: ['repayment_negotiate', 'high_value_defense'],
    },
    {
      key: 'dependents_count',
      label: '부양가족 수',
      kind: 'integer',
    },
    {
      key: 'occupation',
      label: '직업',
      kind: 'text',
    },
  ],
  riskFlags: [
    {
      key: 'gambling_history',
      label: '도박 이력',
      tone: 'warn',
      legalBasis: '채무자회생법 §564 면책불허',
      activates: ['discharge_defense'],
    },
    {
      key: 'prior_bankruptcy',
      label: '이전 파산/회생 이력',
      tone: 'warn',
      legalBasis: '채무자회생법 §624 재신청 요건',
      activates: ['reapplication_strategy'],
    },
    {
      key: 'asset_concealment',
      label: '재산 은닉 정황',
      tone: 'danger',
      activates: ['voluntary_disclosure'],
    },
    {
      key: 'other_active_suits',
      label: '다른 소송 병행',
      tone: 'warn',
      activates: ['parallel_suit_mgmt'],
    },
    {
      key: 'preferential_suspected',
      label: '편파변제 의심',
      tone: 'danger',
      activates: ['preemptive_defense'],
    },
  ],
  strategies: personalRehabStrategies,
  caseFields: [], // 개인회생은 전부 client 레벨 재무 정보 사용
  counterpartyRoles: [
    { key: 'creditor_bank', label: '금융기관', typicalWeaknesses: ['가압류 이력', '부당이자'] },
    { key: 'creditor_personal', label: '개인채권자' },
    { key: 'creditor_card', label: '카드사' },
    { key: 'creditor_second', label: '제2금융권' },
  ],
  documents: docKeys.map((k) => {
    const d = DOCUMENTS[k];
    return {
      key: k,
      label: d?.label ?? k,
      required: !!d?.required,
      source: 'client' as const,
    };
  }),
};
