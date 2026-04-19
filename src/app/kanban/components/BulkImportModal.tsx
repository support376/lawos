'use client';

import { useState, useTransition } from 'react';
import {
  parseBulkText,
  commitBulkImport,
} from '@/app/actions/onboarding';
import type { BulkImportResult } from '@/lib/ai/bulk-import';
import {
  TICKET_TYPE_ICON,
  CASE_TYPE_LABEL,
  type CaseType,
} from '@/lib/types';

const SAMPLE = `김민수 (010-1234-5678)
 개인회생, 서울회생법원 2025개회12345
 수임 2025-10-15

 10/15 초회 상담 - 채무 6000만원
 10/20 소득증빙서류 요청
 10/28 3개월치 급여명세서 수령
 11/05 신청서 법원 제출
 11/25 개시 결정

 할일:
 - 변제계획서 12/15 제출
 - 김민수에게 채권자 목록 확인 요청 (대기 중)

박지영 (010-9876-5432)
 이혼 소송, 서울가정법원 2025드단5678
 상대방: 박○○, 상대 변호사: 김○○변호사
 수임 2025-11-01

 11/01 상담 - 협의 불발, 재판 전환
 11/10 소장 제출
 11/20 답변서 수신

 할일:
 - 재산분할 자료 수령 (박지영 대기)
 - 증인 명단 작성`;

export function BulkImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{
    clients: number;
    cases: number;
    history: number;
    tickets: number;
  } | null>(null);

  if (!open) return null;

  const close = () => {
    setText('');
    setParsed(null);
    setError(null);
    setCommitted(null);
    onClose();
  };

  const analyze = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await parseBulkText(text);
        setParsed(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : '분석 실패');
      }
    });
  };

  const commit = () => {
    if (!parsed) return;
    setError(null);
    startTransition(async () => {
      try {
        const stats = await commitBulkImport(parsed);
        setCommitted(stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장 실패');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-3xl shadow-xl max-h-[92vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold">📦 기존 사건 한 번에 불러오기</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            자유 형식으로 고객/사건/이력/할일 전부 붙여넣으면 AI가 구조화해서
            정리합니다
          </p>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {committed ? (
            <CommittedView stats={committed} />
          ) : !parsed ? (
            <InputView
              text={text}
              onTextChange={setText}
              onSample={() => setText(SAMPLE)}
              error={error}
            />
          ) : (
            <PreviewView parsed={parsed} error={error} />
          )}
        </div>

        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          {committed ? (
            <button
              onClick={close}
              className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              확인
            </button>
          ) : !parsed ? (
            <>
              <button
                onClick={close}
                className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
              >
                취소
              </button>
              <button
                onClick={analyze}
                disabled={pending || text.trim().length < 20}
                className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
              >
                {pending ? '분석 중... (10~30초)' : '분석하기'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setParsed(null)}
                className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
              >
                다시 입력
              </button>
              <button
                onClick={commit}
                disabled={pending}
                className="px-4 py-2 rounded-md text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {pending ? '저장 중...' : '전부 추가'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InputView({
  text,
  onTextChange,
  onSample,
  error,
}: {
  text: string;
  onTextChange: (t: string) => void;
  onSample: () => void;
  error: string | null;
}) {
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="여기에 고객/사건 정보를 자유롭게 붙여넣으세요.&#10;&#10;형식은 자유. 이름, 사건번호, 법원, 수임일, 진행 이력, 할일 등을 담아주세요."
        rows={18}
        className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-mono leading-relaxed resize-none"
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onSample}
          className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          샘플 데이터 (2명) 넣기
        </button>
        <span className="text-xs text-zinc-500">{text.length} / 50000</span>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
          {error}
        </p>
      )}
    </>
  );
}

function PreviewView({
  parsed,
  error,
}: {
  parsed: BulkImportResult;
  error: string | null;
}) {
  const totalCases = parsed.clients.reduce((s, c) => s + c.cases.length, 0);
  const totalHistory = parsed.clients.reduce(
    (s, c) => s + c.cases.reduce((ss, cs) => ss + cs.history.length, 0),
    0,
  );
  const totalTickets = parsed.clients.reduce(
    (s, c) => s + c.cases.reduce((ss, cs) => ss + cs.tickets.length, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-900/50 text-sm">
        <strong>프리뷰</strong> · 고객 {parsed.clients.length} · 사건 {totalCases} ·
        이력 {totalHistory} · 할일 {totalTickets}
      </div>

      {parsed.summary && (
        <p className="text-xs text-zinc-500">{parsed.summary}</p>
      )}

      {parsed.clients.map((client, ci) => (
        <div
          key={ci}
          className="border border-zinc-200 dark:border-zinc-700 rounded-md"
        >
          <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
            <div className="font-medium">{client.name}</div>
            {(client.phone || client.email) && (
              <div className="text-xs text-zinc-500 mt-0.5">
                {[client.phone, client.email].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {client.cases.map((cs, csi) => (
              <div key={csi} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{cs.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                      {cs.case_type && (
                        <span className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-700 rounded">
                          {CASE_TYPE_LABEL[cs.case_type as CaseType]}
                        </span>
                      )}
                      {cs.case_number && <span>#{cs.case_number}</span>}
                      {cs.court && <span>· {cs.court}</span>}
                      {cs.opposing_party && <span>· vs {cs.opposing_party}</span>}
                      {cs.retainer_date && <span>· 수임 {cs.retainer_date}</span>}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                      cs.status === 'closed'
                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                        : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {cs.status === 'closed' ? '종결' : '진행중'}
                  </span>
                </div>

                {cs.history.length > 0 && (
                  <div className="pl-3 border-l-2 border-zinc-200 dark:border-zinc-700 space-y-1">
                    {cs.history.map((h, hi) => (
                      <div key={hi} className="text-xs flex gap-2">
                        <span className="text-zinc-500 shrink-0">{h.date}</span>
                        <span>{h.summary}</span>
                      </div>
                    ))}
                  </div>
                )}

                {cs.tickets.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-zinc-500">활성 할일</div>
                    {cs.tickets.map((t, ti) => (
                      <div
                        key={ti}
                        className="text-xs flex items-center gap-2 p-1.5 rounded bg-zinc-50 dark:bg-zinc-800/50"
                      >
                        <span>{TICKET_TYPE_ICON[t.type]}</span>
                        <span className="flex-1">{t.title}</span>
                        {t.due_date && (
                          <span className="text-zinc-500">{t.due_date}</span>
                        )}
                        <span className="text-zinc-500">P{t.priority}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
          {error}
        </p>
      )}
    </div>
  );
}

function CommittedView({
  stats,
}: {
  stats: { clients: number; cases: number; history: number; tickets: number };
}) {
  return (
    <div className="text-center py-8 space-y-3">
      <div className="text-5xl">✅</div>
      <h3 className="text-lg font-semibold">임포트 완료</h3>
      <div className="text-sm text-zinc-500 space-y-1">
        <div>새 고객 {stats.clients}명</div>
        <div>사건 {stats.cases}건</div>
        <div>이력 이벤트 {stats.history}건</div>
        <div>활성 할일 {stats.tickets}개</div>
      </div>
      <p className="text-xs text-zinc-500 pt-2">
        칸반(To Do), 고객, 사건 페이지에서 확인할 수 있어요.
      </p>
    </div>
  );
}
