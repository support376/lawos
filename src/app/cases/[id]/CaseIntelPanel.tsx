'use client';

import { useState, useTransition } from 'react';
import { updateCaseIntel } from '@/app/actions/client-intel';
import type { FieldSpec } from '@/lib/ontology/core/types';

export function CaseIntelPanel({
  caseId,
  domainLabel,
  fields,
  initial,
}: {
  caseId: string;
  domainLabel: string;
  fields: FieldSpec[];
  initial: Record<string, unknown>;
}) {
  const [editing, setEditing] = useState(false);
  if (fields.length === 0) return null;

  const filled = fields.filter((f) => {
    const v = initial[f.key];
    return v != null && v !== '';
  }).length;
  const pct = Math.round((filled / fields.length) * 100);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          📋 사건 인텔
          <span className="text-xs text-zinc-500 font-normal">{domainLabel} 특화 필드</span>
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500">충족</span>
            <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
              <div
                className={`h-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-zinc-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums text-zinc-500">{filled}/{fields.length}</span>
          </div>
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            {editing ? '닫기' : '편집'}
          </button>
        </div>
      </div>

      {editing ? (
        <Editor caseId={caseId} fields={fields} initial={initial} onClose={() => setEditing(false)} />
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {fields.map((f) => {
            const v = initial[f.key];
            const missing = v == null || v === '';
            return (
              <div key={f.key} className="flex items-baseline gap-2 text-xs">
                <span className="text-zinc-500 w-28 shrink-0">
                  {f.label}
                  {f.required && <span className="text-red-600 ml-0.5">*</span>}
                </span>
                <span
                  className={
                    missing
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-zinc-900 dark:text-zinc-100 tabular-nums'
                  }
                >
                  {missing ? '미입력' : formatValue(f, v)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatValue(field: FieldSpec, v: unknown): string {
  if (field.kind === 'number_krw' && typeof v === 'number') {
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}억`;
    if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
    return v.toLocaleString();
  }
  if (field.kind === 'boolean') return v ? '예' : '아니오';
  return String(v);
}

function Editor({
  caseId,
  fields,
  initial,
  onClose,
}: {
  caseId: string;
  fields: FieldSpec[];
  initial: Record<string, unknown>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({ ...initial });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    setError(null);
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === '' || raw == null) {
        patch[f.key] = null;
        continue;
      }
      if (f.kind === 'number_krw' || f.kind === 'integer') {
        const n = Number(raw);
        patch[f.key] = Number.isFinite(n) ? n : null;
      } else {
        patch[f.key] = raw;
      }
    }
    startTransition(async () => {
      const r = await updateCaseIntel(caseId, patch);
      if (!r.ok) setError(r.hint ? `${r.error} — ${r.hint}` : r.error ?? '저장 실패');
      else onClose();
    });
  };

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-xs text-zinc-500 mb-1 block">
              {f.label}
              {f.required && <span className="text-red-600 ml-0.5">*</span>}
            </label>
            {f.kind === 'boolean' ? (
              <div className="flex gap-2">
                {[true, false].map((b) => (
                  <button
                    key={String(b)}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, [f.key]: b }))}
                    className={`text-xs px-3 py-1 rounded border ${
                      values[f.key] === b
                        ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {b ? '예' : '아니오'}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type={
                  f.kind === 'date'
                    ? 'date'
                    : f.kind === 'number_krw' || f.kind === 'integer'
                      ? 'number'
                      : 'text'
                }
                value={(values[f.key] as string | number | null | undefined) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              />
            )}
            {f.description && (
              <div className="text-[10px] text-zinc-500 mt-0.5">{f.description}</div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700"
        >
          취소
        </button>
        <button
          onClick={onSave}
          disabled={pending}
          className="px-4 py-1.5 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
        >
          {pending ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}
