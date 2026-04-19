// 온톨로지 뷰어 — 도메인·필드·플래그·전략·엔진 자리 한 눈에.

import Link from 'next/link';
import { DOMAIN_REGISTRY } from '@/lib/ontology/registry';
import type { DomainOntology } from '@/lib/ontology/core/types';

export const metadata = { title: '온톨로지 뷰어 — LawOS' };

export default function OntologyDebugPage() {
  const domains = Object.values(DOMAIN_REGISTRY);
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
      <main className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← 홈
          </Link>
          <h1 className="text-2xl font-semibold mt-2">🧬 온톨로지 뷰어</h1>
          <p className="text-sm text-zinc-500 mt-1">
            개체/관계/전략 카탈로그 + 엔진 구축 현황. 자리는 있으나 비어있는 항목은 `TODO`.
          </p>
        </div>

        <EngineStatus />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">도메인 ({domains.length})</h2>
          {domains.map((d) => (
            <DomainCard key={d.caseType} domain={d} />
          ))}
        </section>
      </main>
    </div>
  );
}

function EngineStatus() {
  const layers: Array<{
    key: number;
    name: string;
    file: string;
    status: 'active' | 'stub' | 'blocked' | 'holding';
    risk?: 'low' | 'medium' | 'high' | 'extreme';
    note?: string;
  }> = [
    { key: 0, name: '규칙기반 도메인 (현행)', file: 'intel-gaps.ts + domains/', status: 'active', risk: 'low' },
    { key: 1, name: '증거 갭 (규칙)', file: 'engine/evidence-gap.ts', status: 'stub', risk: 'low', note: 'LLM 0%' },
    { key: 2, name: '판례 RAG (검색)', file: 'engine/precedent-rag.ts', status: 'stub', risk: 'low', note: 'LLM 임베딩만' },
    { key: 3, name: 'LLM 하이브리드 (생성)', file: 'engine/llm-hybrid.ts', status: 'blocked', risk: 'medium', note: '판례 RAG 선행필요' },
    { key: 4, name: '창발 법리 (생성)', file: 'engine/creative-synthesis.ts', status: 'holding', risk: 'extreme', note: '변호사법 검토+eval 전 금지' },
  ];
  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-3">⚙️ 추론 엔진 레이어</h2>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        {layers.map((l) => {
          const border =
            l.status === 'active'
              ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800'
              : l.status === 'holding'
                ? 'border-red-400 bg-red-50 dark:bg-red-950/30 dark:border-red-800'
                : l.status === 'blocked'
                  ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800'
                  : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 opacity-80';
          const statusLabel =
            l.status === 'active'
              ? '✓ 작동중'
              : l.status === 'holding'
                ? '🔴 보류 (위험)'
                : l.status === 'blocked'
                  ? '⏸ 대기 (선행필요)'
                  : '○ stub';
          const riskBadge = l.risk
            ? l.risk === 'extreme'
              ? 'bg-red-600 text-white'
              : l.risk === 'high'
                ? 'bg-red-200 text-red-900'
                : l.risk === 'medium'
                  ? 'bg-amber-200 text-amber-900'
                  : 'bg-emerald-200 text-emerald-900'
            : '';
          return (
            <div key={l.name} className={`p-3 rounded border ${border}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  {l.key === 0 ? '현행' : `${l.key}단계`}
                </div>
                {l.risk && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${riskBadge}`}>
                    risk:{l.risk}
                  </span>
                )}
              </div>
              <div className="text-sm font-medium mt-0.5">{l.name}</div>
              <div className="text-[10px] text-zinc-500 mt-1 font-mono break-all">{l.file}</div>
              <div className="text-[10px] mt-1 font-medium">{statusLabel}</div>
              {l.note && (
                <div className="text-[10px] text-zinc-500 mt-0.5 italic">{l.note}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DomainCard({ domain }: { domain: DomainOntology }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">
          {domain.label}{' '}
          <span className="text-xs text-zinc-500 font-mono">({domain.caseType})</span>
        </h3>
        <span className="text-xs text-zinc-500">v{domain.version}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <Cell title={`Client 필드 (${domain.clientFields.length})`}>
          {domain.clientFields.length === 0 ? (
            <div className="text-xs text-zinc-400">비어있음 (TODO)</div>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {domain.clientFields.map((f) => (
                <li key={f.key}>
                  <span className="font-mono text-zinc-600 dark:text-zinc-400">{f.key}</span>{' '}
                  — {f.label}
                  {f.required && <span className="text-red-600 ml-1">*</span>}
                  {f.usedBy && f.usedBy.length > 0 && (
                    <span className="text-zinc-400"> → {f.usedBy.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cell>

        <Cell title={`위험신호 (${domain.riskFlags.length})`}>
          {domain.riskFlags.length === 0 ? (
            <div className="text-xs text-zinc-400">비어있음 (TODO)</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {domain.riskFlags.map((f) => (
                <li key={f.key} className="flex items-start gap-1.5">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
                      f.tone === 'danger'
                        ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    {f.label}
                  </span>
                  <div className="text-zinc-500 flex-1">
                    {f.legalBasis && <div className="italic">{f.legalBasis}</div>}
                    {f.activates && f.activates.length > 0 && (
                      <div className="text-zinc-400">→ {f.activates.join(', ')}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cell>

        <Cell title={`전략 (${domain.strategies.length})`}>
          {domain.strategies.length === 0 ? (
            <div className="text-xs text-amber-600">
              ⚠ 비어있음 — 현재 intel-gaps.ts의 하드코딩 9개가 personal_rehab에서만 작동.
              이관 필요.
            </div>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {domain.strategies.map((s) => (
                <li key={s.key}>
                  <span className="font-mono">{s.key}</span> — {s.label}
                </li>
              ))}
            </ul>
          )}
        </Cell>

        <Cell title={`문서 (${domain.documents.length})`}>
          {domain.documents.length === 0 ? (
            <div className="text-xs text-zinc-400">
              비어있음 (TODO — templates.ts에서 이관)
            </div>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {domain.documents.map((d) => (
                <li key={d.key}>
                  {d.required && <span className="text-red-600">*</span>} {d.label}
                  <span className="text-zinc-400 text-[10px] ml-1">({d.source})</span>
                </li>
              ))}
            </ul>
          )}
        </Cell>

        <Cell title={`상대방 역할 (${domain.counterpartyRoles.length})`}>
          <ul className="text-xs space-y-0.5">
            {domain.counterpartyRoles.map((r) => (
              <li key={r.key}>
                {r.label}
                {r.typicalWeaknesses && r.typicalWeaknesses.length > 0 && (
                  <span className="text-zinc-400 text-[10px] ml-1">
                    ({r.typicalWeaknesses.join(', ')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Cell>
      </div>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-2.5 border border-zinc-100 dark:border-zinc-800 rounded">
      <div className="text-xs font-medium text-zinc-500 mb-1.5">{title}</div>
      {children}
    </div>
  );
}
