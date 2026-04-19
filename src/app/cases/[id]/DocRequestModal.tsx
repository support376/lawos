'use client';

import { useEffect, useState, useTransition } from 'react';
import { runSendDocRequest } from '@/app/actions/workflow';
import { DOCUMENTS } from '@/lib/ontology/documents';
import { getTemplate } from '@/lib/ontology/templates';
import { createClient } from '@/lib/supabase/client';
import type { WorkflowDocs } from '@/lib/ontology/types';

export function DocRequestModal({
  caseId,
  open,
  onClose,
  mode,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
  mode: 'request' | 'reminder';
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [docKeys, setDocKeys] = useState<string[]>([]);
  const [docs, setDocs] = useState<WorkflowDocs>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('cases')
        .select('case_type, workflow_docs')
        .eq('id', caseId)
        .maybeSingle();
      if (data?.case_type) {
        const t = getTemplate(data.case_type);
        if (t) setDocKeys(t.document_keys);
      }
      setDocs((data?.workflow_docs ?? {}) as WorkflowDocs);
      // 기본 선택: 리마인더면 requested만, 요청이면 missing만
      const initial = new Set<string>();
      for (const k of (data?.case_type
        ? getTemplate(data.case_type)?.document_keys ?? []
        : [])) {
        const st = ((data?.workflow_docs ?? {}) as WorkflowDocs)[k]?.status ?? 'missing';
        if (mode === 'reminder' && st === 'requested') initial.add(k);
        if (mode === 'request' && st === 'missing') initial.add(k);
      }
      setSelected(initial);
    })();
  }, [open, caseId, mode]);

  if (!open) return null;

  const submit = () => {
    if (selected.size === 0) {
      setError('1개 이상 선택해주세요');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const r = await runSendDocRequest({
          caseId,
          docKeys: Array.from(selected),
        });
        setDone(
          r.mocked
            ? 'Mock 발송 완료 (RESEND_API_KEY 미설정).'
            : r.sent
              ? `✓ ${selected.size}종 서류 요청 이메일 발송 완료.`
              : `발송 실패: ${r.error}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : '실패');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-lg p-5 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div>
          <h3 className="font-semibold">
            {mode === 'reminder' ? '⏰ 서류 리마인더' : '📧 서류 일괄 요청'}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            {mode === 'reminder'
              ? '요청 후 아직 미수령인 서류에 대해 재요청 이메일 전송.'
              : '고객에게 필요 서류 발급 가이드 + 목록 전송.'}
          </p>
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded p-2">
          {docKeys.length === 0 ? (
            <p className="text-sm text-zinc-500 p-4 text-center">템플릿 로드 중...</p>
          ) : (
            docKeys.map((k) => {
              const d = DOCUMENTS[k];
              if (!d) return null;
              const st = docs[k]?.status ?? 'missing';
              const isSelected = selected.has(k);
              return (
                <label
                  key={k}
                  className="flex items-center gap-2 p-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(k);
                      else next.delete(k);
                      setSelected(next);
                    }}
                  />
                  <span className="flex-1 truncate">{d.label}</span>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {st === 'received' ? '✅' : st === 'requested' ? '⏳' : '◯'}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {done && (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">
            {done}
          </p>
        )}

        <div className="flex justify-between items-center">
          <span className="text-xs text-zinc-500">
            선택 {selected.size} / 전체 {docKeys.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
            >
              {done ? '닫기' : '취소'}
            </button>
            {!done && (
              <button
                onClick={submit}
                disabled={pending || selected.size === 0}
                className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
              >
                {pending ? '발송 중...' : '발송'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
