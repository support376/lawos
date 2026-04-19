import type { ColumnKey } from './types';

// Spec §5.2 허용 전이
// Triage: 승인(→todo) / 기각(→delete)
// To Do: 착수(→in_progress) / 되돌리기(→triage, ai_suggested일 때)
// In Progress: 초안(→review) / 즉시완료(→done) / 취소(→todo)
// Review & Send: 발송(→done) / 재작업(→in_progress)
// Done: 이동 불가
const TRANSITIONS: Record<ColumnKey, ColumnKey[]> = {
  triage: ['todo'],
  todo: ['in_progress', 'triage'],
  in_progress: ['review', 'done', 'todo'],
  review: ['done', 'in_progress'],
  done: [],
};

export function canMove(from: ColumnKey, to: ColumnKey): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTargets(from: ColumnKey): ColumnKey[] {
  return TRANSITIONS[from] ?? [];
}
