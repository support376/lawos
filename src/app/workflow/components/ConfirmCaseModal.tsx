'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { approveAndAssignCase } from '@/app/actions/case-approval';
import { listWorkspaceMembers } from '@/app/actions/action-items';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';

interface Member {
  id: string;
  name: string | null;
  email: string;
}

const WRITER_STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'engagement', label: '수임 (위임계약·추심 고지)' },
  { key: 'document_prep', label: '서류준비 (기본 진입)' },
  { key: 'filing', label: '신청접수 (서류 있으면 바로)' },
];

export function ConfirmCaseModal({
  actionId,
  caseId,
  clientName,
  onClose,
}: {
  actionId: string;
  caseId: string;
  clientName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [primary, setPrimary] = useState('');
  const [doc, setDoc] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [stage, setStage] = useState<StageKey>('document_prep');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listWorkspaceMembers().then(setMembers);
  }, []);

  const submit = () => {
    setErr(null);
    if (!primary) return setErr('주 담당 변호사 선택 필수');
    startTransition(async () => {
      const r = await approveAndAssignCase({
        confirmActionId: actionId,
        caseId,
        primaryAttorneyId: primary,
        documentStaffId: doc || null,
        analysisStaffId: analysis || null,
        toStage: stage,
        note: note || undefined,
      });
      if (!r.ok) return setErr(r.error ?? '실패');
      onClose();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <div>
          <h2 className="text-base font-semibold">🔔 수임 컨펌 · 담당자 지정</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {clientName} — 승인 시 담당자에게 자동으로 첫 업무가 배포됩니다.
          </p>
        </div>

        <div className="space-y-3">
          <Field label="주 담당 변호사 * (필수)">
            <select
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="inp-m"
            >
              <option value="">— 선택 —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email.split('@')[0]} ({m.email})
                </option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              이 사람이 사건 전반의 책임자. 첫 업무 "채무자 프로필 입력" Action 자동 배포.
            </p>
          </Field>

          <Field label="서류팀 담당 (선택)">
            <select
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              className="inp-m"
            >
              <option value="">— 지정 안함 —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email.split('@')[0]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              지정 시 "필수 서류 20종 안내 발송" Action 자동 배포.
            </p>
          </Field>

          <Field label="분석팀 담당 (선택)">
            <select
              value={analysis}
              onChange={(e) => setAnalysis(e.target.value)}
              className="inp-m"
            >
              <option value="">— 지정 안함 —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email.split('@')[0]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Stage 전이">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as StageKey)}
              className="inp-m"
            >
              {WRITER_STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </Field>

          <Field label="메모 (선택)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="특이사항·주의사항"
              className="inp-m"
            />
          </Field>
        </div>

        {err && <p className="text-xs text-red-600">{err}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700">
            취소
          </button>
          <button
            type="submit"
            disabled={pending || !primary}
            className="flex-1 px-4 py-1.5 text-sm rounded bg-emerald-600 text-white disabled:opacity-50 font-medium"
          >
            {pending ? '승인중...' : '✓ 승인·할당'}
          </button>
        </div>

        <style jsx>{`
          :global(.inp-m) {
            width: 100%;
            padding: 6px 10px;
            font-size: 13px;
            border: 1px solid rgb(212 212 216);
            border-radius: 4px;
            background: transparent;
          }
          :global(.dark .inp-m) {
            border-color: rgb(63 63 70);
          }
        `}</style>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">{label}</label>
      {children}
    </div>
  );
}
