// 글로벌 서류 카탈로그 — 여러 분야에서 재사용.
// 분야별 템플릿은 이 키를 참조.

import type { DocumentTypeDef } from './types';

export const DOCUMENTS: Record<string, DocumentTypeDef> = {
  // ===== 신원/가족 =====
  resident_reg: {
    key: 'resident_reg',
    label: '주민등록등본',
    source: '정부24',
    automation: 'client_self_issue',
    category: 'identity',
    obtain_instructions:
      '정부24(https://www.gov.kr) → 주민등록등본(초본) 발급 → 공동인증서/간편인증 → PDF 다운로드',
    validity_days: 90,
    required: true,
  },
  family_reg: {
    key: 'family_reg',
    label: '가족관계증명서',
    source: '대법원 전자가족관계등록',
    automation: 'client_self_issue',
    category: 'family',
    obtain_instructions:
      '전자가족관계등록시스템(efamily.scourt.go.kr)에서 본인인증 후 발급',
    validity_days: 90,
    required: true,
  },
  marriage_reg: {
    key: 'marriage_reg',
    label: '혼인관계증명서',
    source: '대법원 전자가족관계등록',
    automation: 'client_self_issue',
    category: 'family',
    validity_days: 90,
    required: true,
  },
  seal_cert: {
    key: 'seal_cert',
    label: '인감증명서',
    source: '주민센터',
    automation: 'client_self_issue',
    category: 'identity',
    obtain_instructions: '가까운 주민센터 방문. 대리인 발급은 위임장 필요.',
    validity_days: 30,
    required: false,
  },

  // ===== 재산 =====
  real_estate_title: {
    key: 'real_estate_title',
    label: '부동산 등기부등본',
    source: '대법원 인터넷등기소',
    automation: 'lawyer_manual',
    category: 'assets',
    obtain_instructions:
      '대법원 인터넷등기소(iros.go.kr) 열람 (건당 1,000원). 변호사 본인 계정으로 일괄 조회 가능.',
    validity_days: 30,
    required: false,
  },
  land_ledger: {
    key: 'land_ledger',
    label: '토지대장',
    source: '정부24',
    automation: 'client_self_issue',
    category: 'assets',
    required: false,
  },
  car_registration: {
    key: 'car_registration',
    label: '자동차등록원부',
    source: '정부24',
    automation: 'client_self_issue',
    category: 'assets',
    required: false,
  },
  lease_contract: {
    key: 'lease_contract',
    label: '임대차계약서',
    source: '본인 보관',
    automation: 'client_self_issue',
    category: 'assets',
    obtain_instructions: '원본 계약서 사본 (전/월세 계약 있는 경우)',
    required: false,
  },

  // ===== 소득 =====
  income_tax_withholding: {
    key: 'income_tax_withholding',
    label: '근로소득원천징수영수증',
    source: '회사 / 홈택스',
    automation: 'company_issued',
    category: 'income',
    obtain_instructions:
      '회사 인사/재무팀에 요청하거나 홈택스 Mytax → My 홈택스 → 연말정산 간소화에서 발급',
    required: true,
  },
  employment_cert: {
    key: 'employment_cert',
    label: '재직증명서',
    source: '회사',
    automation: 'company_issued',
    category: 'income',
    validity_days: 30,
    required: true,
  },
  pay_stubs_6m: {
    key: 'pay_stubs_6m',
    label: '급여명세서 (최근 6개월)',
    source: '회사',
    automation: 'company_issued',
    category: 'income',
    required: true,
  },
  business_reg_cert: {
    key: 'business_reg_cert',
    label: '사업자등록증명',
    source: '홈택스',
    automation: 'client_self_issue',
    category: 'income',
    obtain_instructions: '(사업자인 경우) 홈택스 → 증명발급 → 사업자등록증명',
    required: false,
  },

  // ===== 세금 =====
  national_tax_cert: {
    key: 'national_tax_cert',
    label: '국세 납세증명서',
    source: '홈택스',
    automation: 'client_self_issue',
    category: 'tax',
    obtain_instructions: '홈택스 → 민원증명 → 납세증명서 신청',
    validity_days: 30,
    required: true,
  },
  local_tax_cert: {
    key: 'local_tax_cert',
    label: '지방세 납세증명서',
    source: '위택스',
    automation: 'client_self_issue',
    category: 'tax',
    validity_days: 30,
    required: true,
  },

  // ===== 보험 =====
  four_ins_cert: {
    key: 'four_ins_cert',
    label: '4대보험 가입증명서',
    source: '국민연금/건강보험/고용/산재 공단',
    automation: 'client_self_issue',
    category: 'insurance',
    required: false,
  },
  health_ins_history: {
    key: 'health_ins_history',
    label: '건강보험 자격득실 확인서',
    source: '국민건강보험공단',
    automation: 'client_self_issue',
    category: 'insurance',
    required: true,
  },

  // ===== 채무 (개인회생 핵심) =====
  debt_cert: {
    key: 'debt_cert',
    label: '부채증명원 (채권자별)',
    source: '각 채권자 (은행/카드사/대부업)',
    automation: 'lawyer_manual',
    category: 'debt',
    obtain_instructions:
      '각 채권자에게 부채증명원 발급 요청 (변호사 직권 조회 가능)',
    required: true,
  },
  card_usage: {
    key: 'card_usage',
    label: '카드 사용내역 (최근 1년)',
    source: '카드사',
    automation: 'client_self_issue',
    category: 'debt',
    required: true,
  },
  bank_statements_6m: {
    key: 'bank_statements_6m',
    label: '통장거래내역 (최근 6개월)',
    source: '거래 은행',
    automation: 'client_self_issue',
    category: 'debt',
    obtain_instructions:
      '주거래 은행 앱에서 PDF 다운로드. 모든 통장 포함 (타 은행 포함).',
    required: true,
  },

  // ===== 기타 =====
  surety_cert: {
    key: 'surety_cert',
    label: '보증보험 증권',
    source: '서울보증보험 등',
    automation: 'client_self_issue',
    category: 'misc',
    required: false,
  },
};
