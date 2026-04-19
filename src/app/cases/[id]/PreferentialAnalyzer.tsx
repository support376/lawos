'use client';

import { useState, useTransition } from 'react';
import {
  analyzePreferentialPayments,
  type AnalyzePrefResult,
} from '@/app/actions/analyze';

export function PreferentialAnalyzer({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalyzePrefResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const analyze = () => {
    if (!text.trim()) return;
    startTransition(async () => {
      const r = await analyzePreferentialPayments({
        caseId,
        bankText: text,
      });
      setResult(r);
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div>
          <h3 className="text-sm font-semibold">🔍 편파변제 탐지</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            통장거래내역 붙여넣기 → AI가 의심 거래 자동 추출
          </p>
        </div>
        <span className="text-xs text-zinc-500">{expanded ? '접기 ▲' : '열기 ▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="통장거래내역을 붙여넣으세요. (은행 앱에서 PDF/Excel로 받은 내역 복사)&#10;&#10;예:&#10;2025-08-15  출금  5,000,000  김○○(지인대여금 상환)&#10;2025-08-20  출금  3,000,000  박○○ 계좌 송금&#10;2025-09-01  입금    280,000  급여&#10;..."
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-mono resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{text.length} / 100,000</span>
            <button
              onClick={analyze}
              disabled={pending || text.trim().length < 20}
              className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? '분석 중... (10~20초)' : 'AI로 분석'}
            </button>
          </div>

          {result && (
            <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              {!result.ok ? (
                <p className="text-sm text-red-600">{result.error}</p>
              ) : result.suspicious_payments.length === 0 ? (
                <p className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded text-sm text-emerald-800 dark:text-emerald-300">
                  ✓ {result.summary}
                </p>
              ) : (
                <>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded text-sm">
                    <strong className="text-amber-900 dark:text-amber-200">
                      의심 거래 {result.suspicious_payments.length}건 · 총{' '}
                      {result.total_suspicious_krw.toLocaleString()}원
                    </strong>
                    <p className="text-xs text-amber-800 dark:text-amber-400 mt-1">
                      {result.summary}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {result.suspicious_payments.map((p, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded border text-sm ${
                          p.risk_level === 'high'
                            ? 'border-red-300 bg-red-50 dark:bg-red-950/30'
                            : p.risk_level === 'medium'
                              ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
                              : 'border-zinc-200 bg-zinc-50 dark:bg-zinc-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{p.recipient}</span>
                            <span className="text-zinc-500 ml-2">{p.date}</span>
                          </div>
                          <span className="tabular-nums font-medium shrink-0">
                            {p.amount_krw.toLocaleString()}원
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                              p.risk_level === 'high'
                                ? 'bg-red-600 text-white'
                                : p.risk_level === 'medium'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-zinc-400 text-white'
                            }`}
                          >
                            {p.risk_level === 'high'
                              ? '고위험'
                              : p.risk_level === 'medium'
                                ? '주의'
                                : '낮음'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                          💡 {p.reason}
                        </p>
                      </div>
                    ))}
                  </div>

                  {result.recommendations.length > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded">
                      <div className="text-xs font-medium text-blue-900 dark:text-blue-200 mb-1.5">
                        📋 권장 후속조치
                      </div>
                      <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
                        {result.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
