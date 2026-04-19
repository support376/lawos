'use client';

import { useState, useTransition } from 'react';
import { analyzeText, type AnalyzeTextResult } from '../actions';
import type { Client } from '@/lib/types';
import { TICKET_TYPE_ICON, TICKET_TYPE_LABEL } from '@/lib/types';

const SAMPLE_TEXT = `김변호사님 안녕하세요, 지난 상담 감사했습니다.

저번에 말씀하신 소득증빙서류는 이번 주 금요일까지 준비해서 메일로 보내드리겠습니다.

그리고 다음 주 화요일 오후 2시에 추가 상담 가능하실까요? 가능하시면 회사로 방문하겠습니다.

변호사님이 재산목록 양식을 이번 주 내로 보내주시기로 하신 것도 다시 한번 확인 부탁드립니다.

감사합니다.
김민수 드림`;

const SOURCE_OPTIONS: { value: 'email' | 'kakao' | 'phone' | 'notes' | 'manual'; label: string }[] = [
  { value: 'manual', label: '일반' },
  { value: 'email', label: '이메일' },
  { value: 'kakao', label: '카톡' },
  { value: 'phone', label: '통화/상담' },
  { value: 'notes', label: '메모' },
];

export function PasteAnalyzeModal({
  open,
  onClose,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState('');
  const [clientId, setClientId] = useState('');
  const [source, setSource] = useState<'email' | 'kakao' | 'phone' | 'notes' | 'manual'>('manual');
  const [result, setResult] = useState<AnalyzeTextResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const close = () => {
    setText('');
    setClientId('');
    setSource('manual');
    setResult(null);
    setError(null);
    onClose();
  };

  const analyze = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await analyzeText({
          text,
          clientId: clientId || null,
          sourceHint: source,
        });
        setResult(r);
      } catch (err) {
        setError(err instanceof Error ? err.message : '분석 실패');
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
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-2xl shadow-xl max-h-[92vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">대화 붙여넣기</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              이메일/카톡/통화 내용을 붙여넣으면 AI가 할일을 찾아 Triage에 넣어줍니다
            </p>
          </div>
          <button
            onClick={close}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {!result ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                >
                  <option value="">고객 선택 (선택)</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={source}
                  onChange={(e) =>
                    setSource(e.target.value as typeof source)
                  }
                  className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="여기에 이메일/카톡/통화 내용을 붙여넣으세요..."
                  rows={12}
                  className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-mono leading-relaxed resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <button
                    type="button"
                    onClick={() => setText(SAMPLE_TEXT)}
                    className="text-xs text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    샘플 대화 넣기
                  </button>
                  <span className="text-xs text-zinc-500">{text.length} / 20000</span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 p-2 rounded">
                  {error}
                </p>
              )}
            </>
          ) : (
            <ResultView result={result} />
          )}
        </div>

        <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          {!result ? (
            <>
              <button
                onClick={close}
                className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
              >
                취소
              </button>
              <button
                onClick={analyze}
                disabled={pending || text.trim().length < 10}
                className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
              >
                {pending ? '분석 중...' : '분석하기'}
              </button>
            </>
          ) : (
            <button
              onClick={close}
              className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              확인 (Triage에서 승인)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: AnalyzeTextResult }) {
  const { extraction, createdTicketIds } = result;
  const count = createdTicketIds.length;

  return (
    <div className="space-y-4">
      <div
        className={`p-4 rounded-md border ${count > 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700'}`}
      >
        <p className="text-sm font-medium">
          {count > 0
            ? `${count}개의 할일을 Triage에 추가했습니다`
            : '추출된 할일이 없습니다'}
        </p>
        {extraction.summary && (
          <p className="text-xs text-zinc-500 mt-1">{extraction.summary}</p>
        )}
      </div>

      {extraction.items.length > 0 && (
        <div className="space-y-2">
          {extraction.items.map((item, i) => (
            <div
              key={i}
              className="p-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{TICKET_TYPE_ICON[item.type]}</span>
                  <span className="font-medium text-sm">{item.title}</span>
                </div>
                <span className="text-xs text-zinc-500 shrink-0">
                  신뢰도 {Math.round(item.confidence * 100)}%
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-zinc-500">
                <span>{TICKET_TYPE_LABEL[item.type]}</span>
                <span>·</span>
                <span>P{item.priority}</span>
                {item.due_date && (
                  <>
                    <span>·</span>
                    <span>마감 {item.due_date}</span>
                  </>
                )}
                {item.waiting_on && (
                  <>
                    <span>·</span>
                    <span>
                      대기:{' '}
                      {item.waiting_on === 'client'
                        ? '고객'
                        : item.waiting_on === 'court'
                          ? '법원'
                          : '상대'}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-2 leading-relaxed">
                💡 {item.reasoning}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
