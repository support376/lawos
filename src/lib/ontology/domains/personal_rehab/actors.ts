// 개인회생 Actor 구성 — 핵심 대결구도는 의뢰인 vs 법원.
// 채권자는 수동적 객체(이의제기 외 공격능력 없음).

import type { ActorRoleSpec } from '../../core/types';

export const personalRehabActors: ActorRoleSpec[] = [
  {
    role: 'client',
    label: '의뢰인 (채무자)',
    weight: 'primary',
    cardinality: 'single',
    adversarial: false,
    persuasive: false,
    icon: '👤',
    description: '변제계획을 제시하고 면책을 구하는 당사자',
    autoCreate: false, // clients 테이블 별도 관리
    intelSchema: [
      {
        key: 'monthly_income_krw',
        label: '월 소득',
        kind: 'number_krw',
        required: true,
        description: '변제율·가처분소득 산정 기초',
        usedBy: ['repayment_negotiate', 'high_value_defense'],
      },
      {
        key: 'total_debt_krw',
        label: '총 부채',
        kind: 'number_krw',
        required: true,
        usedBy: ['repayment_negotiate', 'high_value_defense'],
      },
      { key: 'dependents_count', label: '부양가족 수', kind: 'integer' },
      { key: 'occupation', label: '직업', kind: 'text' },
    ],
  },
  {
    role: 'court',
    label: '회생법원 (심사자)',
    weight: 'primary',
    cardinality: 'single',
    adversarial: false,
    persuasive: true,
    icon: '⚖️',
    description: '변제계획 인가·면책 결정자. 엄격도·관심사·보정패턴이 핵심.',
    autoCreate: true,
    intelSchema: [
      {
        key: 'court_name',
        label: '관할 법원',
        kind: 'text',
        required: true,
      },
      {
        key: 'strictness_observed',
        label: '담당부 엄격도 (관측)',
        kind: 'enum',
        enumValues: [
          { value: 'very_strict', label: '매우 엄격' },
          { value: 'strict', label: '엄격' },
          { value: 'moderate', label: '보통' },
          { value: 'flexible', label: '유연' },
        ],
      },
      {
        key: 'recent_correction_reasons',
        label: '최근 보정명령 빈출 사유',
        kind: 'text',
        description: '이 법원에서 반복 지적되는 사항',
      },
      {
        key: 'key_focus_notes',
        label: '법원 관심 쟁점',
        kind: 'text',
      },
      {
        key: 'judge_identified',
        label: '담당 재판부 특정 여부',
        kind: 'boolean',
      },
    ],
  },
  {
    role: 'creditor',
    label: '채권자',
    weight: 'background',
    cardinality: 'multiple',
    adversarial: false,
    persuasive: false,
    icon: '💳',
    description: '수동적 객체. 이의제기 외 공격수단 없음. 명부등록·통지만 필요.',
    autoCreate: false,
    intelSchema: [
      { key: 'creditor_type', label: '채권자 유형', kind: 'enum',
        enumValues: [
          { value: 'bank', label: '은행' },
          { value: 'second_tier', label: '제2금융권' },
          { value: 'card', label: '카드사' },
          { value: 'personal', label: '개인' },
          { value: 'public', label: '공공기관' },
        ] },
      { key: 'claim_amount_krw', label: '채권액', kind: 'number_krw' },
      { key: 'interest_rate', label: '이자율(%)', kind: 'integer' },
      { key: 'secured', label: '담보 있음', kind: 'boolean' },
      { key: 'objection_likely', label: '이의 가능성 있음', kind: 'boolean' },
    ],
  },
];
