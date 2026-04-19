'use client';

import { useState, useTransition } from 'react';
import { format, parseISO } from 'date-fns';
import { DOCUMENTS } from '@/lib/ontology/documents';
import { ACTIONS } from '@/lib/ontology/actions';
import type {
  CaseTemplate,
  WorkflowDocs,
  DocStatus,
  StageHistoryEntry,
  DocAutomation,
} from '@/lib/ontology/types';
import {
  initializeWorkflow,
  advanceStage,
  setDocStatus,
  runSendDocRequest,
  runDetectMissing,
} from '@/app/actions/workflow';

const AUTOMATION_LABEL: Record<DocAutomation, string> = {
  api_auto: '🤖 자동',
  b2b_api: '🔌 B2B API',
  client_self_issue: '👤 고객 직접 발급',
  company_issued: '🏢 회사 발급',
  lawyer_manual: '⚖️ 변호사 처리',
};

const STATUS_LABEL: Record<DocStatus, string> = {
  missing: '⚪ 미요청',
  requested: '🟡 요청함',
  received: '🟢 수령',
  not_applicable: '➖ 해당 없음',
};

export function WorkflowPanel({
  caseId,
  template,
  currentStage,
  docs,
  history,
  isInitialized,
}: {
  caseId: string;
  template: CaseTemplate;
  currentStage: string | null;
  docs: WorkflowDocs;
  history: StageHistoryEntry[];
  isInitialized: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [detectResult, setDetectResult] = useState<{
    missing: Array<{ key: string; label: string }>;
    requested: Array<{ key: string; label: string }>;
    received: Array<{ key: string; label: string }>;
    total_required: number;
  } | null>(null);

  const stages = template.stages;
  const currentIdx = currentStage
    ? stages.findIndex((s) => s.key === currentStage)
    : -1;

  const currentStageDef = stages.find((s) => s.key === currentStage);
  const suggestedActionKeys = currentStageDef?.suggested_actions ?? [];

  // 서류 상태 통계
  const docStats = {
    total: template.document_keys.length,
    received: 0,
    requested: 0,
    missing: 0,
  };
  for (const k of template.document_keys) {
    const st = docs[k]?.status ?? 'missing';
    if (st === 'received') docStats.received++;
    else if (st === 'requested') docStats.requested++;
    else docStats.missing++;
  }
  const progressPct =
    docStats.total > 0
      ? Math.round((docStats.received / docStats.total) * 100)
      : 0;

  if (!isInitialized) {
    return (
      <section className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-5">
        <h2 className="text-sm font-semibold mb-2">
          🗂 {template.name} 워크플로우
        </h2>
        <p className="text-sm text-zinc-500 mb-3">
          이 사건의 스테이지/서류 체크리스트/액션 카탈로그가 준비돼 있습니다.
          활성화하면 자동 진행 추적이 시작됩니다.
        </p>
        <button
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await initializeWorkflow(caseId);
              if (!r.ok) {
                setError(
                  r.hint ? `${r.error}\n\n💡 ${r.hint}` : (r.error ?? '초기화 실패'),
                );
              }
            });
          }}
          disabled={pending}
          className="px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-sm disabled:opacity-50"
        >
          {pending ? '초기화 중...' : '워크플로우 시작'}
        </button>
        {error && (
          <pre className="text-sm text-red-600 mt-3 bg-red-50 dark:bg-red-950/30 p-3 rounded whitespace-pre-wrap font-sans">
            {error}
          </pre>
        )}
      </section>
    );
  }

  const onRequest = () => {
    if (selectedDocs.size === 0) {
      setError('요청할 서류를 선택하세요');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const r = await runSendDocRequest({
          caseId,
          docKeys: Array.from(selectedDocs),
        });
        if (r.error) setError(`발송 실패: ${r.error}`);
        else if (r.mocked) setError('Mock 발송 (RESEND_API_KEY 미설정)');
        setSelectedDocs(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : '실패');
      }
    });
  };

  const onDetect = () => {
    startTransition(async () => {
      try {
        const r = await runDetectMissing(caseId);
        setDetectResult({
          total_required: r.total_required,
          missing: r.missing.map((d) => ({ key: d.key, label: d.label })),
          requested: r.requested.map((d) => ({ key: d.key, label: d.label })),
          received: r.received.map((d) => ({ key: d.key, label: d.label })),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : '실패');
      }
    });
  };

  const onStageChange = (toKey: string) => {
    startTransition(async () => {
      try {
        await advanceStage(caseId, toKey);
      } catch (e) {
        setError(e instanceof Error ? e.message : '실패');
      }
    });
  };

  // 서류를 automation 레벨별로 그룹핑
  const docGroups: Record<DocAutomation, string[]> = {
    api_auto: [],
    b2b_api: [],
    client_self_issue: [],
    company_issued: [],
    lawyer_manual: [],
  };
  for (const k of template.document_keys) {
    const d = DOCUMENTS[k];
    if (d) docGroups[d.automation].push(k);
  }

  return (
    <section className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold">🗂 {template.name} 워크플로우</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{template.description}</p>
      </div>

      {/* Stage 진행도 바 */}
      <div>
        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          진행 스테이지
        </div>
        <div className="flex items-center gap-1">
          {stages.map((s, i) => {
            const isCurrent = s.key === currentStage;
            const isPast = currentIdx >= 0 && i < currentIdx;
            return (
              <button
                key={s.key}
                onClick={() => onStageChange(s.key)}
                disabled={pending}
                className={`flex-1 py-2 px-2 text-xs rounded ${
                  isCurrent
                    ? 'bg-red-600 text-white font-medium'
                    : isPast
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                } disabled:opacity-50`}
                title={s.description}
              >
                {i + 1}. {s.label}
              </button>
            );
          })}
        </div>
        {currentStageDef?.description && (
          <p className="text-xs text-zinc-500 mt-2">
            <strong>현재:</strong> {currentStageDef.description}
          </p>
        )}
      </div>

      {/* 서류 진행도 */}
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          <span>📄 서류 체크리스트</span>
          <span className="text-zinc-500">
            {docStats.received} / {docStats.total} 수령 ({progressPct}%)
          </span>
        </div>
        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* automation 레벨별 그룹 */}
        {(Object.keys(docGroups) as DocAutomation[]).map((auto) => {
          const keys = docGroups[auto];
          if (keys.length === 0) return null;
          return (
            <div key={auto} className="mb-4">
              <div className="text-xs font-medium text-zinc-500 mb-1.5">
                {AUTOMATION_LABEL[auto]}
              </div>
              <div className="space-y-1">
                {keys.map((docKey) => {
                  const d = DOCUMENTS[docKey];
                  if (!d) return null;
                  const state = docs[docKey] ?? { status: 'missing' as DocStatus };
                  const isSelected = selectedDocs.has(docKey);
                  return (
                    <label
                      key={docKey}
                      className="flex items-center gap-2 p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const next = new Set(selectedDocs);
                          if (e.target.checked) next.add(docKey);
                          else next.delete(docKey);
                          setSelectedDocs(next);
                        }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{d.label}</span>
                        {d.required && (
                          <span className="text-xs text-red-600 ml-1">*</span>
                        )}
                        <span className="text-xs text-zinc-500 ml-2">
                          {d.source}
                        </span>
                      </span>
                      <select
                        value={state.status}
                        onChange={(e) => {
                          startTransition(() =>
                            setDocStatus(caseId, docKey, e.target.value as DocStatus),
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        disabled={pending}
                        className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                      >
                        {(Object.keys(STATUS_LABEL) as DocStatus[]).map((k) => (
                          <option key={k} value={k}>
                            {STATUS_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button
            onClick={onRequest}
            disabled={pending || selectedDocs.size === 0}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending
              ? '발송 중...'
              : `📧 선택 ${selectedDocs.size}종 일괄 요청`}
          </button>
          <button
            onClick={onDetect}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            누락 분석
          </button>
          {detectResult && (
            <span className="text-xs text-zinc-500">
              필수 {detectResult.total_required} · 수령 {detectResult.received.length} ·
              요청중 {detectResult.requested.length} · 미요청 {detectResult.missing.length}
            </span>
          )}
        </div>
      </div>

      {/* 권장 Action */}
      {suggestedActionKeys.length > 0 && (
        <div>
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            ⚡ 이 스테이지 권장 액션
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedActionKeys.map((k) => {
              const a = ACTIONS[k];
              if (!a) return null;
              return (
                <span
                  key={k}
                  title={a.description}
                  className="inline-block px-2.5 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                >
                  {a.label}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            (상세 실행은 각 액션별 UI에서. 서류 요청은 위에서 바로 가능.)
          </p>
        </div>
      )}

      {/* 이력 요약 */}
      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            스테이지 이력 ({history.length})
          </summary>
          <div className="mt-2 space-y-1 pl-3 border-l-2 border-zinc-200 dark:border-zinc-800">
            {history.map((h, i) => {
              const s = stages.find((x) => x.key === h.stage);
              return (
                <div key={i} className="text-zinc-500">
                  {format(parseISO(h.entered_at), 'yyyy-MM-dd HH:mm')} ·{' '}
                  {s?.label ?? h.stage}
                  {h.exited_at && (
                    <span> → {format(parseISO(h.exited_at), 'MM-dd HH:mm')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
          {error}
        </p>
      )}
    </section>
  );
}
