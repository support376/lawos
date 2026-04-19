'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { startSTT, type STTFinal, type STTHandle } from '@/lib/stt/client';
import type { Client, Case, TicketType, Priority, CaseType } from '@/lib/types';
import { CASE_TYPE_LABEL, TICKET_TYPE_ICON } from '@/lib/types';
import {
  analyzeTranscriptDraft,
  commitCopilotResult,
  getClientContext,
  createClientQuick,
  type CopilotItem,
  type ClientContext,
} from '@/app/actions/copilot';

type Phase = 'setup' | 'recording' | 'review' | 'done';
type SetupMode = 'existing' | 'new' | 'unknown';

export function CopilotModal({
  open,
  onClose,
  clients,
  cases,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  cases: Case[];
}) {
  const wsUrl = process.env.NEXT_PUBLIC_STT_WS_URL;

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<SetupMode>('existing');

  // 기존 고객 선택
  const [clientId, setClientId] = useState('');
  const [caseId, setCaseId] = useState('');

  // 신규 고객 빠른 입력
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCaseType, setNewCaseType] = useState<CaseType>('personal_rehab');

  // 공통: 용건 메모
  const [purpose, setPurpose] = useState('');

  // 녹음 중 상태: 분야 튠 + 실시간 메모
  const [sessionCaseType, setSessionCaseType] = useState<CaseType | null>(null);
  const [sessionNotes, setSessionNotes] = useState('');

  // 컨텍스트 (선택된 기존 고객의 현재 상황)
  const [context, setContext] = useState<ClientContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  // 녹음 상태
  const [ready, setReady] = useState(false);
  const [partial, setPartial] = useState('');
  const [finals, setFinals] = useState<STTFinal[]>([]);

  // 검토 상태
  const [draftEventId, setDraftEventId] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<CopilotItem[]>([]);
  const [reviewSummary, setReviewSummary] = useState<string | null>(null);
  const [saveAsMilestone, setSaveAsMilestone] = useState(true);
  const [milestoneSummary, setMilestoneSummary] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [committedResult, setCommittedResult] = useState<{
    ticketIds: string[];
    milestoneCreated: boolean;
  } | null>(null);

  const [pending, startTransition] = useTransition();
  const handleRef = useRef<STTHandle | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const clientCases = cases.filter((c) => c.client_id === clientId && c.status === 'active');

  // 고객 선택되면 컨텍스트 로드
  const loadContext = useCallback(async (id: string) => {
    if (!id) {
      setContext(null);
      return;
    }
    setContextLoading(true);
    try {
      const ctx = await getClientContext(id);
      setContext(ctx);
    } catch {
      setContext(null);
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (clientId) loadContext(clientId);
    else setContext(null);
  }, [clientId, loadContext]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [finals, partial]);

  const resetAll = () => {
    if (handleRef.current) handleRef.current.cleanup();
    handleRef.current = null;
    setPhase('setup');
    setMode('existing');
    setClientId('');
    setCaseId('');
    setNewName('');
    setNewPhone('');
    setPurpose('');
    setSessionCaseType(null);
    setSessionNotes('');
    setContext(null);
    setReady(false);
    setPartial('');
    setFinals([]);
    setDraftEventId(null);
    setReviewItems([]);
    setReviewSummary(null);
    setSaveAsMilestone(true);
    setMilestoneSummary('');
    setError(null);
    setCommittedResult(null);
  };

  const close = () => {
    resetAll();
    onClose();
  };

  const start = async () => {
    if (!wsUrl) {
      setError('STT 서버 URL이 설정되지 않았습니다');
      return;
    }
    setError(null);

    // 신규 고객 모드면 먼저 고객 생성
    let effectiveClientId = clientId;
    let effectiveCaseId = caseId;

    if (mode === 'new') {
      if (!newName.trim()) {
        setError('신규 고객 이름을 입력해주세요');
        return;
      }
      try {
        const r = await createClientQuick({
          name: newName,
          phone: newPhone || null,
          caseType: newCaseType,
        });
        effectiveClientId = r.clientId;
        effectiveCaseId = r.caseId ?? '';
        setClientId(r.clientId);
        if (r.caseId) setCaseId(r.caseId);
        // 신규 상담이면 분야 튠 기본값 세팅
        setSessionCaseType(newCaseType);
        await loadContext(r.clientId);
      } catch (e) {
        setError(e instanceof Error ? e.message : '고객 생성 실패');
        return;
      }
    }

    // 기존 고객이면 그 고객의 최근 사건 타입으로 기본 설정
    if (mode === 'existing' && context?.activeCases[0]?.case_type) {
      setSessionCaseType(context.activeCases[0].case_type);
    }

    // 기본 milestone 요약 세팅 (저장 시 덮어쓰기 가능)
    if (!milestoneSummary) {
      setMilestoneSummary(purpose.trim() || '상담');
    }

    setFinals([]);
    setPartial('');

    try {
      const handle = await startSTT(wsUrl, {
        onReady: () => setReady(true),
        onPartial: (text) => setPartial(text),
        onFinal: (seg) => {
          setFinals((prev) => [...prev, seg]);
          setPartial('');
        },
        onError: (err) => setError(err),
      });
      handleRef.current = handle;
      // 방금 만든 값으로 로컬 상태 확정
      void effectiveClientId;
      void effectiveCaseId;
      setPhase('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : '시작 실패');
    }
  };

  const stopAndReview = async () => {
    if (!handleRef.current) return;
    const h = handleRef.current;
    handleRef.current = null;

    await h.stop();

    const transcript = finals.map((f) => f.text).join(' ').trim();
    if (!transcript) {
      setError('전사 내용이 비어있습니다');
      setPhase('setup');
      return;
    }

    setPhase('review');

    startTransition(async () => {
      const draft = await analyzeTranscriptDraft({
        transcript,
        clientId: clientId || null,
        caseId: caseId || null,
        sourceHint: 'copilot',
        customInstructions: purpose.trim() || null,
        presetLabel: mode === 'new' ? '신규 상담' : mode === 'unknown' ? '용건 불명' : null,
        sessionNotes: sessionNotes.trim() || null,
        caseTypeHint: sessionCaseType,
      });

      setDraftEventId(draft.eventId);
      setReviewSummary(draft.summary);
      setReviewItems(
        draft.items.map((it) => ({
          enabled: true,
          title: it.title,
          type: it.type,
          priority: it.priority as Priority,
          due_date: it.due_date,
          waiting_on: it.waiting_on,
          description: null,
          ai_confidence: it.confidence ?? null,
          ai_reasoning: it.reasoning ?? null,
        })),
      );

      if (!draft.ok && draft.error) {
        setError(`[${draft.stage}] ${draft.error}`);
      }
    });
  };

  const commit = () => {
    if (!draftEventId) return;
    setError(null);
    startTransition(async () => {
      const r = await commitCopilotResult({
        eventId: draftEventId,
        clientId: clientId || null,
        caseId: caseId || null,
        items: reviewItems,
        saveAsMilestone: saveAsMilestone && !!caseId,
        milestoneSummary: milestoneSummary || null,
      });
      if (!r.ok) {
        setError(r.error ?? '저장 실패');
        return;
      }
      setCommittedResult({
        ticketIds: r.ticketIds,
        milestoneCreated: r.milestoneCreated,
      });
      setPhase('done');
    });
  };

  if (!open) return null;

  const canCloseFromOutside = phase === 'setup' || phase === 'done';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4"
      onClick={canCloseFromOutside ? close : undefined}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-zinc-900 rounded-lg w-full shadow-2xl flex flex-col ${
          phase === 'recording'
            ? 'max-w-[1400px] h-[95vh]'
            : 'max-w-4xl max-h-[92vh]'
        }`}
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              🎙 상담 코파일럿
              {phase === 'recording' && (
                <span className="flex items-center gap-1 text-red-600 text-sm">
                  <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                  녹음 중
                </span>
              )}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {phase === 'setup' && '1. 준비'}
              {phase === 'recording' && '2. 녹음 중 — 컨텍스트 보면서 대응'}
              {phase === 'review' && '3. 검토 & 편집'}
              {phase === 'done' && '4. 완료'}
            </p>
          </div>
          <button
            onClick={close}
            disabled={!canCloseFromOutside}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
          >
            ✕
          </button>
        </div>

        <div className={`flex-1 p-6 ${phase === 'recording' ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto'}`}>
          {phase === 'setup' && (
            <SetupView
              mode={mode}
              onModeChange={setMode}
              clients={clients}
              clientId={clientId}
              onClientChange={setClientId}
              caseId={caseId}
              onCaseChange={setCaseId}
              clientCases={clientCases}
              newName={newName}
              newPhone={newPhone}
              newCaseType={newCaseType}
              onNewName={setNewName}
              onNewPhone={setNewPhone}
              onNewCaseType={setNewCaseType}
              purpose={purpose}
              onPurposeChange={setPurpose}
              context={context}
              contextLoading={contextLoading}
              hasWs={!!wsUrl}
              error={error}
            />
          )}

          {phase === 'recording' && (
            <RecordingView
              ready={ready}
              finals={finals}
              partial={partial}
              context={context}
              transcriptRef={transcriptRef}
              clients={clients}
              clientId={clientId}
              onClientChange={(id) => {
                setClientId(id);
                setCaseId('');
              }}
              purpose={purpose}
              sessionCaseType={sessionCaseType}
              onCaseTypeChange={setSessionCaseType}
              sessionNotes={sessionNotes}
              onNotesChange={setSessionNotes}
              error={error}
            />
          )}

          {phase === 'review' && (
            <ReviewView
              pending={pending}
              items={reviewItems}
              summary={reviewSummary}
              finals={finals}
              context={context}
              onUpdate={(idx, patch) =>
                setReviewItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
              }
              onRemove={(idx) => setReviewItems((prev) => prev.filter((_, i) => i !== idx))}
              onAdd={() =>
                setReviewItems((prev) => [
                  ...prev,
                  {
                    enabled: true,
                    title: '',
                    type: 'follow_up',
                    priority: 3,
                    due_date: null,
                    waiting_on: null,
                    description: null,
                  },
                ])
              }
              canSaveMilestone={!!caseId}
              saveAsMilestone={saveAsMilestone}
              onMilestoneToggle={setSaveAsMilestone}
              milestoneSummary={milestoneSummary}
              onMilestoneSummaryChange={setMilestoneSummary}
              error={error}
            />
          )}

          {phase === 'done' && committedResult && (
            <DoneView result={committedResult} itemCount={reviewItems.filter((i) => i.enabled).length} />
          )}
        </div>

        <Footer
          phase={phase}
          pending={pending}
          hasWs={!!wsUrl}
          canStart={mode !== 'new' || !!newName.trim()}
          itemsEnabled={reviewItems.filter((i) => i.enabled).length}
          onStart={start}
          onStop={stopAndReview}
          onCommit={commit}
          onClose={close}
        />
      </div>
    </div>
  );
}

// ============ SetupView ============
function SetupView({
  mode,
  onModeChange,
  clients,
  clientId,
  onClientChange,
  caseId,
  onCaseChange,
  clientCases,
  newName,
  newPhone,
  newCaseType,
  onNewName,
  onNewPhone,
  onNewCaseType,
  purpose,
  onPurposeChange,
  context,
  contextLoading,
  hasWs,
  error,
}: {
  mode: SetupMode;
  onModeChange: (m: SetupMode) => void;
  clients: Client[];
  clientId: string;
  onClientChange: (v: string) => void;
  caseId: string;
  onCaseChange: (v: string) => void;
  clientCases: Case[];
  newName: string;
  newPhone: string;
  newCaseType: CaseType;
  onNewName: (v: string) => void;
  onNewPhone: (v: string) => void;
  onNewCaseType: (v: CaseType) => void;
  purpose: string;
  onPurposeChange: (v: string) => void;
  context: ClientContext | null;
  contextLoading: boolean;
  hasWs: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* 모드 선택 */}
      <div className="flex gap-2">
        {[
          { key: 'existing', label: '기존 고객 상담/통화', emoji: '👤' },
          { key: 'new', label: '신규 상담', emoji: '✨' },
          { key: 'unknown', label: '전화 받음 (용건 불명)', emoji: '📞' },
        ].map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onModeChange(m.key as SetupMode)}
            className={`flex-1 px-3 py-2.5 rounded-md text-sm border transition ${
              mode === m.key
                ? 'border-red-500 bg-red-50 dark:bg-red-950/30 font-medium'
                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-400'
            }`}
          >
            <span className="mr-1">{m.emoji}</span>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'existing' && (
        <>
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
              고객
            </label>
            <select
              value={clientId}
              onChange={(e) => {
                onClientChange(e.target.value);
                onCaseChange('');
              }}
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            >
              <option value="">선택...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {clientCases.length > 0 && (
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
                관련 사건 (선택)
              </label>
              <select
                value={caseId}
                onChange={(e) => onCaseChange(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              >
                <option value="">자동 판단</option>
                {clientCases.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          )}

          {clientId && (
            <ContextPreview context={context} loading={contextLoading} />
          )}
        </>
      )}

      {mode === 'new' && (
        <div className="space-y-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md">
          <p className="text-xs text-zinc-500">신규 고객을 빠르게 등록하고 바로 상담 시작</p>
          <input
            value={newName}
            onChange={(e) => onNewName(e.target.value)}
            placeholder="이름 (필수)"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            autoFocus
          />
          <input
            value={newPhone}
            onChange={(e) => onNewPhone(e.target.value)}
            placeholder="전화 (선택)"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
          <select
            value={newCaseType}
            onChange={(e) => onNewCaseType(e.target.value as CaseType)}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          >
            {(['personal_rehab', 'divorce', 'criminal', 'other'] as CaseType[]).map((t) => (
              <option key={t} value={t}>{CASE_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">
            시작 누르면 {newName || '(이름)'} 고객 + {CASE_TYPE_LABEL[newCaseType]} 사건이 자동 생성됩니다.
          </p>
        </div>
      )}

      {mode === 'unknown' && (
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md">
          <p className="text-sm">
            📞 <strong>전화 받음 모드</strong>
          </p>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            바로 녹음 시작됩니다. 통화 중 고객이 파악되면 녹음 화면 우측에서 선택하면
            그 시점부터 해당 고객의 현재 상황이 로드됩니다.
          </p>
        </div>
      )}

      {/* 공통: 용건 메모 */}
      <div>
        <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 block">
          용건 / 메모 (선택, AI가 참고)
        </label>
        <textarea
          value={purpose}
          onChange={(e) => onPurposeChange(e.target.value)}
          rows={2}
          placeholder="예: 지난 주 요청한 소득증빙 서류 확인 / 재산분할 조정 가능성 논의"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
        />
      </div>

      {!hasWs && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-900 dark:text-amber-200 rounded">
          ⚠ STT 서버 URL이 설정되지 않았습니다
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">{error}</p>
      )}
    </div>
  );
}

// ============ ContextPreview ============
function ContextPreview({
  context,
  loading,
}: {
  context: ClientContext | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded text-xs text-zinc-500">
        현재 상황 로드 중...
      </div>
    );
  }
  if (!context) return null;

  const hasAny =
    context.activeCases.length > 0 ||
    context.activeTickets.length > 0 ||
    context.recentEvents.length > 0;

  if (!hasAny) {
    return (
      <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded text-xs text-zinc-500">
        {context.client.name} — 진행 중 사건/할일 없음
      </div>
    );
  }

  return (
    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded space-y-2 text-xs">
      <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
        {context.client.name} — 현재 상황
      </div>
      <div className="grid grid-cols-3 gap-2 text-zinc-500">
        <span>활성 사건 {context.activeCases.length}</span>
        <span>활성 할일 {context.activeTickets.length}</span>
        <span>최근 이력 {context.recentEvents.length}</span>
      </div>
      <p className="text-zinc-400 leading-relaxed">
        녹음 시작하면 오른쪽에 자세히 표시됩니다.
      </p>
    </div>
  );
}

// ============ RecordingView ============
const CASE_TYPE_PILLS: { key: CaseType | 'none'; label: string }[] = [
  { key: 'personal_rehab', label: '개인회생' },
  { key: 'divorce', label: '이혼' },
  { key: 'criminal', label: '형사' },
  { key: 'other', label: '기타' },
  { key: 'none', label: '분야 없음' },
];

function RecordingView({
  ready,
  finals,
  partial,
  context,
  transcriptRef,
  clients,
  clientId,
  onClientChange,
  purpose,
  sessionCaseType,
  onCaseTypeChange,
  sessionNotes,
  onNotesChange,
  error,
}: {
  ready: boolean;
  finals: STTFinal[];
  partial: string;
  context: ClientContext | null;
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  clients: Client[];
  clientId: string;
  onClientChange: (id: string) => void;
  purpose: string;
  sessionCaseType: CaseType | null;
  onCaseTypeChange: (v: CaseType | null) => void;
  sessionNotes: string;
  onNotesChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col h-full gap-3">
      {/* 튠 바 (상단) */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-xs text-zinc-500 whitespace-nowrap">🎯 분야:</span>
        <div className="flex gap-1 flex-wrap">
          {CASE_TYPE_PILLS.map((p) => {
            const isActive =
              p.key === 'none' ? sessionCaseType === null : sessionCaseType === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() =>
                  onCaseTypeChange(p.key === 'none' ? null : (p.key as CaseType))
                }
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  isActive
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {purpose && (
          <span className="text-xs text-zinc-500 ml-auto italic">💭 {purpose}</span>
        )}
      </div>

      {/* 메인 3-column 레이아웃 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* 전사 — 제일 넓게 */}
        <div className="lg:col-span-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              실시간 전사 {!ready && <span className="text-zinc-400">(연결 중...)</span>}
            </label>
          </div>
          <div
            ref={transcriptRef}
            className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-4 overflow-y-auto leading-relaxed text-sm space-y-2 min-h-0"
          >
            {finals.length === 0 && !partial && ready && (
              <div className="text-zinc-500 italic">말씀해주세요...</div>
            )}
            {finals.map((f) => (
              <div key={f.seg_id} className="text-zinc-900 dark:text-zinc-100">
                {f.text}
              </div>
            ))}
            {partial && <div className="text-zinc-500 italic">{partial}</div>}
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        {/* 중간: 실시간 메모 */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            📝 메모 (AI 분석 시 참고됨)
          </label>
          <textarea
            value={sessionNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="상담 중 중요한 내용을 여기 적어두세요.&#10;&#10;예:&#10;- 상대 변호사: 김○○&#10;- 재산분할 핵심 쟁점은 아파트&#10;- 고객 원하는 방향: 조기 종결"
            className="flex-1 p-3 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none min-h-0"
          />
          <p className="text-xs text-zinc-500 mt-1">
            {sessionNotes.length}자 · AI가 추출할 때 이 메모도 함께 분석합니다
          </p>
        </div>

        {/* 우측: 컨텍스트 */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            👤 고객 컨텍스트
          </label>
          <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-md p-3 overflow-y-auto min-h-0">
            {!clientId ? (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">고객 파악되면 선택</p>
                <select
                  value={clientId}
                  onChange={(e) => onClientChange(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                >
                  <option value="">미지정</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : !context ? (
              <p className="text-xs text-zinc-500">로드 중...</p>
            ) : (
              <ClientContextPanel
                context={context}
                onChangeClient={onClientChange}
                clients={clients}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientContextPanel({
  context,
  onChangeClient,
  clients,
}: {
  context: ClientContext;
  onChangeClient: (id: string) => void;
  clients: Client[];
}) {
  const today = new Date();

  const stuckWaiting = context.activeTickets.filter((t) => t.waiting_on);
  const dueSoon = context.activeTickets.filter((t) => {
    if (!t.due_date || t.waiting_on) return false;
    const diff = differenceInCalendarDays(parseISO(t.due_date), today);
    return diff <= 3;
  });
  const others = context.activeTickets.filter(
    (t) => !t.waiting_on && !dueSoon.includes(t),
  );

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{context.client.name}</div>
          {context.client.phone && (
            <div className="text-xs text-zinc-500">{context.client.phone}</div>
          )}
        </div>
        <select
          onChange={(e) => onChangeClient(e.target.value)}
          value=""
          className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          title="고객 변경"
        >
          <option value="">변경...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {context.activeCases.length > 0 && (
        <div>
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">진행 중 사건</div>
          <div className="space-y-1">
            {context.activeCases.map((c) => (
              <div key={c.id} className="text-xs p-1.5 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                <div>{c.title}</div>
                <div className="text-zinc-500 mt-0.5">
                  {c.case_type && CASE_TYPE_LABEL[c.case_type]}
                  {c.case_number && ` · #${c.case_number}`}
                  {c.court && ` · ${c.court}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stuckWaiting.length > 0 && (
        <div>
          <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
            ⏳ 대기 중 ({stuckWaiting.length})
          </div>
          <div className="space-y-0.5">
            {stuckWaiting.map((t) => (
              <div key={t.id} className="text-xs flex items-center gap-1.5">
                <span>{TICKET_TYPE_ICON[t.type]}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-amber-600">
                  {t.waiting_on === 'client' ? '고객' : t.waiting_on === 'court' ? '법원' : '상대'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dueSoon.length > 0 && (
        <div>
          <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">
            🔴 마감 임박 ({dueSoon.length})
          </div>
          <div className="space-y-0.5">
            {dueSoon.map((t) => (
              <div key={t.id} className="text-xs flex items-center gap-1.5">
                <span>{TICKET_TYPE_ICON[t.type]}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-red-600">{t.due_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            기타 활성 할일 ({others.length})
          </div>
          <div className="space-y-0.5">
            {others.slice(0, 6).map((t) => (
              <div key={t.id} className="text-xs flex items-center gap-1.5">
                <span>{TICKET_TYPE_ICON[t.type]}</span>
                <span className="flex-1 truncate">{t.title}</span>
                {t.due_date && <span className="text-zinc-500">{t.due_date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {context.recentEvents.length > 0 && (
        <div>
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            최근 이력
          </div>
          <div className="space-y-0.5">
            {context.recentEvents.slice(0, 5).map((ev) => (
              <div key={ev.id} className="text-xs">
                <span className="text-zinc-500">{ev.date.slice(5, 10)}</span>{' '}
                <span>{ev.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {context.activeCases.length === 0 && context.activeTickets.length === 0 && (
        <div className="text-xs text-zinc-500 italic py-4">
          진행 중인 사건/할일 없음. 새 상담으로 시작.
        </div>
      )}
    </div>
  );
}

// ============ ReviewView ============
const TYPE_LABEL: Record<TicketType, string> = {
  promise: '구두약속',
  document_request: '서류요청',
  follow_up: '후속확인',
};

function ReviewView({
  pending,
  items,
  summary,
  finals,
  context,
  onUpdate,
  onRemove,
  onAdd,
  canSaveMilestone,
  saveAsMilestone,
  onMilestoneToggle,
  milestoneSummary,
  onMilestoneSummaryChange,
  error,
}: {
  pending: boolean;
  items: CopilotItem[];
  summary: string | null;
  finals: STTFinal[];
  context: ClientContext | null;
  onUpdate: (idx: number, patch: Partial<CopilotItem>) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  canSaveMilestone: boolean;
  saveAsMilestone: boolean;
  onMilestoneToggle: (v: boolean) => void;
  milestoneSummary: string;
  onMilestoneSummaryChange: (v: string) => void;
  error: string | null;
}) {
  if (pending && items.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-zinc-500">
        AI가 할일을 추출하고 있습니다... (5~15초)
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {context && (
        <div className="text-xs text-zinc-500">
          💡 AI는 <strong>{context.client.name}</strong>의 현재 진행 상황(사건 {context.activeCases.length}·할일 {context.activeTickets.length})을 참고해서 중복 없이 추출했습니다.
        </div>
      )}
      {summary && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded text-sm">
          <strong>요약:</strong> {summary}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">
            추출된 할일 ({items.filter((i) => i.enabled).length}/{items.length})
          </h3>
          <button
            type="button"
            onClick={onAdd}
            className="text-xs text-zinc-600 dark:text-zinc-400 underline"
          >
            + 수동 추가
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">
            추출된 항목 없음. 대화에 명확한 약속/요청/후속이 없었을 수 있습니다. 수동 추가 가능.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-md border ${
                  it.enabled
                    ? 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'
                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 opacity-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={it.enabled}
                    onChange={(e) => onUpdate(idx, { enabled: e.target.checked })}
                    className="mt-1.5"
                  />
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={it.title}
                      onChange={(e) => onUpdate(idx, { title: e.target.value })}
                      placeholder="제목"
                      className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      <select
                        value={it.type}
                        onChange={(e) => onUpdate(idx, { type: e.target.value as TicketType })}
                        className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                      >
                        {(Object.keys(TYPE_LABEL) as TicketType[]).map((k) => (
                          <option key={k} value={k}>{TYPE_LABEL[k]}</option>
                        ))}
                      </select>
                      <select
                        value={String(it.priority)}
                        onChange={(e) => onUpdate(idx, { priority: Number(e.target.value) as Priority })}
                        className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                      >
                        <option value="1">P1 긴급</option>
                        <option value="2">P2 높음</option>
                        <option value="3">P3 보통</option>
                        <option value="4">P4 낮음</option>
                      </select>
                      <input
                        type="date"
                        value={it.due_date ?? ''}
                        onChange={(e) => onUpdate(idx, { due_date: e.target.value || null })}
                        className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(idx)}
                    className="text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded px-1.5 py-0.5"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canSaveMilestone && (
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsMilestone}
              onChange={(e) => onMilestoneToggle(e.target.checked)}
            />
            <span>이 상담을 사건 이력으로도 저장</span>
          </label>
          {saveAsMilestone && (
            <input
              value={milestoneSummary}
              onChange={(e) => onMilestoneSummaryChange(e.target.value)}
              placeholder="이력 요약 (예: 서류 수령 확인 및 다음 단계 합의)"
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
            />
          )}
        </div>
      )}

      <details className="text-xs text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100">
          전체 전사 보기 ({finals.length}개 세그먼트)
        </summary>
        <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded whitespace-pre-wrap max-h-64 overflow-y-auto">
          {finals.map((f) => f.text).join(' ')}
        </div>
      </details>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">{error}</p>
      )}
    </div>
  );
}

// ============ DoneView ============
function DoneView({
  result,
  itemCount,
}: {
  result: { ticketIds: string[]; milestoneCreated: boolean };
  itemCount: number;
}) {
  return (
    <div className="text-center py-8 space-y-3">
      <div className="text-5xl">✅</div>
      <h3 className="text-lg font-semibold">저장 완료</h3>
      <div className="text-sm text-zinc-500 space-y-1">
        <div>Triage에 {result.ticketIds.length}개 티켓 추가 (선택한 {itemCount}개 중)</div>
        {result.milestoneCreated && <div>사건 이력에 추가됨</div>}
      </div>
    </div>
  );
}

// ============ Footer ============
function Footer({
  phase,
  pending,
  hasWs,
  canStart,
  itemsEnabled,
  onStart,
  onStop,
  onCommit,
  onClose,
}: {
  phase: Phase;
  pending: boolean;
  hasWs: boolean;
  canStart: boolean;
  itemsEnabled: number;
  onStart: () => void;
  onStop: () => void;
  onCommit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
      {phase === 'setup' && (
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
          >
            취소
          </button>
          <button
            onClick={onStart}
            disabled={!hasWs || !canStart}
            className="px-4 py-2 rounded-md text-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            🎙 녹음 시작
          </button>
        </>
      )}
      {phase === 'recording' && (
        <button
          onClick={onStop}
          className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          ⏹ 종료 & 검토
        </button>
      )}
      {phase === 'review' && (
        <>
          <button
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          >
            취소 (저장 안 함)
          </button>
          <button
            onClick={onCommit}
            disabled={pending || itemsEnabled === 0}
            className="px-4 py-2 rounded-md text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {pending ? '저장 중...' : `${itemsEnabled}개 저장`}
          </button>
        </>
      )}
      {phase === 'done' && (
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          확인
        </button>
      )}
    </div>
  );
}
