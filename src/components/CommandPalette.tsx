'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { naturalLanguageSearch, type SearchResult } from '@/app/actions/search';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResult(null);
    setError(null);
  }, []);

  // Cmd+K / Ctrl+K + 외부 이벤트
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) close();
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('lawos:openCommand', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('lawos:openCommand', openHandler);
    };
  }, [open, close]);

  const run = () => {
    if (!query.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await naturalLanguageSearch(query);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : '검색 실패');
      }
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 pt-[10vh]"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-2xl shadow-2xl"
      >
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run();
            }}
            placeholder="자연어로 물어보세요. 예: '이번 주 지연된 개인회생 사건'"
            className="w-full px-3 py-2 bg-transparent outline-none text-sm"
          />
          <div className="flex items-center justify-between mt-1 text-xs text-zinc-500">
            <span>Enter로 검색 · Esc로 닫기</span>
            {pending && <span>검색 중...</span>}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <p className="p-4 text-sm text-red-600">{error}</p>
          )}

          {result && (
            <div className="p-3">
              <div className="text-xs text-zinc-500 mb-2 px-1 flex items-center justify-between">
                <span>검색 결과 {result.count}건</span>
              </div>

              {result.rows.length === 0 ? (
                <p className="text-sm text-zinc-500 py-6 text-center">결과 없음</p>
              ) : (
                <div className="space-y-1">
                  {result.rows.map((r) => (
                    <Link
                      key={r.id}
                      href={r.href}
                      onClick={close}
                      className="block p-2.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {r.title || '(제목 없음)'}
                          </div>
                          {r.subtitle && (
                            <p className="text-xs text-zinc-500 truncate mt-0.5">
                              {r.subtitle}
                            </p>
                          )}
                        </div>
                        {r.badge && (
                          <span className="text-xs px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded shrink-0">
                            {r.badge}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {!result && !error && !pending && (
            <div className="p-6 text-xs text-zinc-500 space-y-2">
              <p className="font-medium">예시</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>이번 주 마감 지난 할일</li>
                <li>김민수 개인회생 사건</li>
                <li>고객 회신 대기 중인 것들</li>
                <li>최근 이혼 사건 중 진행중</li>
                <li>지난달 종결된 사건</li>
              </ul>
              <p className="pt-2 text-zinc-400">
                AI가 자연어를 구조화 쿼리로 변환합니다 (RAG 아님, 결정론적).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

