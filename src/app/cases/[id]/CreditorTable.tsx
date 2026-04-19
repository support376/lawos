'use client';

import { useState, useTransition } from 'react';
import type { ActorData } from './ActorPanel';
import { createActor } from '@/app/actions/actor';

export function CreditorTable({
  caseId,
  actors,
}: {
  caseId: string;
  actors: ActorData[];
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('bank');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onAdd = () => {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await createActor({
        caseId,
        role: 'creditor',
        name: name.trim(),
        weight: 'background',
        profile: {
          creditor_type: type,
          claim_amount_krw: amount ? Number(amount) : null,
        },
      });
      if (!r.ok) setError(r.error ?? '등록 실패');
      else {
        setName('');
        setAmount('');
        setAdding(false);
      }
    });
  };

  const total = actors.reduce(
    (s, a) => s + Number((a.profile as Record<string, unknown>)['claim_amount_krw'] ?? 0),
    0,
  );

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          💳 채권자 명부
          <span className="text-xs text-zinc-500 font-normal">
            배경 객체 ({actors.length}명 · 총 {Math.round(total / 10_000).toLocaleString()}만원)
          </span>
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          {adding ? '닫기' : '+ 추가'}
        </button>
      </div>

      {adding && (
        <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="채권자 이름"
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          >
            <option value="bank">은행</option>
            <option value="second_tier">제2금융권</option>
            <option value="card">카드사</option>
            <option value="personal">개인</option>
            <option value="public">공공기관</option>
          </select>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="채권액(원)"
            className="px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded bg-transparent tabular-nums"
          />
          <button
            onClick={onAdd}
            disabled={pending || !name.trim()}
            className="px-3 py-1 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '추가중...' : '등록'}
          </button>
          {error && (
            <div className="md:col-span-4 text-xs text-red-600">{error}</div>
          )}
        </div>
      )}

      {actors.length === 0 ? (
        <div className="p-6 text-xs text-zinc-500 text-center">
          미등록. 신청 전 전원 등록 필요.
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
          <div className="px-4 py-1.5 grid grid-cols-12 gap-2 text-zinc-500 font-medium">
            <div className="col-span-4">이름</div>
            <div className="col-span-3">유형</div>
            <div className="col-span-3 text-right">채권액</div>
            <div className="col-span-2">담보</div>
          </div>
          {actors.map((a) => {
            const p = a.profile as Record<string, unknown>;
            return (
              <div key={a.id} className="px-4 py-1.5 grid grid-cols-12 gap-2">
                <div className="col-span-4 truncate">{a.name}</div>
                <div className="col-span-3 text-zinc-500">{String(p['creditor_type'] ?? '-')}</div>
                <div className="col-span-3 text-right tabular-nums">
                  {p['claim_amount_krw']
                    ? `${Math.round(Number(p['claim_amount_krw']) / 10_000).toLocaleString()}만`
                    : '-'}
                </div>
                <div className="col-span-2">{p['secured'] ? '✓' : '—'}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
