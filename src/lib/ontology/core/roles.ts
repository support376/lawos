// 온톨로지 v0.3 — 역할 (Role)

export const ROLE_KEYS = [
  'managing_partner',
  'attorney',
  'consultant',
  'document_staff',
  'analysis_staff',
  'correction_staff',
  'billing_staff',
  'admin',
] as const;

export type Role = (typeof ROLE_KEYS)[number];

export const ROLE_LABEL: Record<Role, string> = {
  managing_partner: '대표변호사',
  attorney: '변호사',
  consultant: '상담원',
  document_staff: '서류팀',
  analysis_staff: '분석팀',
  correction_staff: '법정 대응',
  billing_staff: '결제팀',
  admin: '행정팀',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  managing_partner: '전사 조망 · 모든 Action · 할당 재배치',
  attorney: '할당된 Case · Stage 책임 · 법원 소통',
  consultant: '자신이 담당한 Lead · 전환 목표',
  document_staff: '서류준비·수집 Stage',
  analysis_staff: '신청·보정루프 Stage (편파분석·시뮬)',
  correction_staff: '기각·즉시항고·폐지 Stage',
  billing_staff: '결제 · 미수금 · 독촉 자동화',
  admin: '행정·비서 · Case 종합 뷰 조망 · Action 할당',
};

// 역할 우선순위 (권한 체크 시 비교용)
export const ROLE_RANK: Record<Role, number> = {
  managing_partner: 100,
  attorney: 60,
  consultant: 40,
  analysis_staff: 40,
  correction_staff: 40,
  document_staff: 30,
  billing_staff: 30,
  admin: 10,
};

export function hasAnyRole(userRoles: Role[], required: Role[]): boolean {
  return userRoles.some((r) => required.includes(r));
}

export function isHighPrivilege(userRoles: Role[]): boolean {
  return userRoles.includes('managing_partner');
}
