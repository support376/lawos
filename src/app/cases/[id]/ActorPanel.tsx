'use client';

import { useState, useTransition } from 'react';
import type { ActorRoleSpec, FieldSpec } from '@/lib/ontology/core/types';
import { upsertActorIntel, createActor } from '@/app/actions/actor';

export interface ActorData {
  id: string;
  role: string;
  name: string;
  weight: string | null;
  profile: Record<string, unknown>;
}

export function ActorPanel({
  spec,
  actor,
  caseId,
  accentColor = 'zinc',
}: {
  spec: ActorRoleSpec;
  actor: ActorData | null;
  caseId: string;
  accentColor?: 'zinc' | 'red' | 'blue' | 'amber';
}) {
  const [editing, setEditing] = useState(false);
  const profile = actor?.profile ?? {};
  const filled = spec.intelSchema.filter((f) => {
    const v = profile[f.key];
    return v != null && v !== '';
  }).length;
  const pct = spec.intelSchema.length > 0
    ? Math.round((filled / spec.intelSchema.length) * 100)
    : 0;

  const border = accentColor === 'red'
    ? 'border-red-300 dark:border-red-900'
    : accentColor === 'blue'
      ? 'border-blue-300 dark:border-blue-900'
      : accentColor === 'amber'
        ? 'border-amber-300 dark:border-amber-900'
        : 'border-zinc-200 dark:border-zinc-800';

  const weightBadge = spec.weight === 'primary'
    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
    : spec.weight === 'secondary'
      ? 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200'
      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800';

  const roleBadges: string[] = [];
  if (spec.adversarial) roleBadges.push('⚔️ 적대적');
  if (spec.persuasive) roleBadges.push('🎯 설득대상');

  return (
    <section className={`bg-white dark:bg-zinc-900 border-2 ${border} rounded-lg`}>
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            {spec.icon} {spec.label}
          </h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${weightBadge}`}>
            {spec.weight === 'primary' ? '핵심' : spec.weight === 'secondary' ? '보조' : '배경'}
          </span>
          {roleBadges.map((b) => (
            <span key={b} className="text-[10px] text-zinc-500">{b}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-14 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
              <div
                className={`h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-zinc-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums text-zinc-500">{filled}/{spec.intelSchema.length}</span>
          </div>
          {actor && (
            <button
              onClick={() => setEditing((e) => !e)}
              className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {editing ? '닫기' : '편집'}
            </button>
          )}
        </div>
      </div>

      {!actor ? (
        <MissingActorCreate spec={spec} caseId={caseId} />
      ) : editing ? (
        <Editor
          caseId={caseId}
          actorId={actor.id}
          fields={spec.intelSchema}
          initial={profile}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className="p-4 space-y-1.5">
          {spec.description && (
            <p className="text-xs text-zinc-500 italic mb-2">{spec.description}</p>
          )}
          <dl className="grid grid-cols-1 gap-1.5">
            {spec.intelSchema.map((f) => {
              const v = profile[f.key];
              const missing = v == null || v === '';
              return (
                <div key={f.key} className="flex items-baseline gap-2 text-xs">
                  <dt className="text-zinc-500 w-28 shrink-0">
                    {f.label}
                    {f.required && <span className="text-red-600 ml-0.5">*</span>}
                  </dt>
                  <dd
                    className={
                      missing
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-zinc-900 dark:text-zinc-100 tabular-nums'
                    }
                  >
                    {missing ? '미입력' : formatValue(f, v)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </section>
  );
}

function MissingActorCreate({
  spec,
  caseId,
}: {
  spec: ActorRoleSpec;
  caseId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onCreate = () => {
    setError(null);
    startTransition(async () => {
      const r = await createActor({
        caseId,
        role: spec.role,
        name: spec.label,
        weight: spec.weight,
        consentScope: '도메인 자동 생성 (공적 역할)',
      });
      if (!r.ok) {
        setError(
          r.error && (r.error.includes('column') || r.error.includes('weight'))
            ? 'DB 마이그레이션 필요 (Supabase SQL Editor에서 case_counterparties.weight 추가)'
            : r.error ?? '생성 실패',
        );
      }
      // 성공시 server action의 revalidatePath가 페이지 리렌더
    });
  };

  return (
    <div className="p-5 text-center space-y-2">
      <div className="text-xs text-zinc-500">
        아직 등록되지 않음 — 자동 생성이 실패했거나 DB 마이그레이션이 필요할 수 있습니다.
      </div>
      <button
        onClick={onCreate}
        disabled={pending}
        className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
      >
        {pending ? '생성 중...' : `+ ${spec.label} 등록`}
      </button>
      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}

function formatValue(field: FieldSpec, v: unknown): string {
  if (field.kind === 'number_krw' && typeof v === 'number') {
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}억원`;
    if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만원`;
    return `${v.toLocaleString()}원`;
  }
  if (field.kind === 'boolean') return v ? '예' : '아니오';
  if (field.kind === 'enum' && field.enumValues) {
    const match = field.enumValues.find((e) => e.value === v);
    return match ? match.label : String(v);
  }
  return String(v);
}

function Editor({
  caseId,
  actorId,
  fields,
  initial,
  onClose,
}: {
  caseId: string;
  actorId: string;
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
      const r = await upsertActorIntel({ actorId, patch, caseId });
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
            {f.kind === 'enum' && f.enumValues ? (
              <select
                value={(values[f.key] as string | undefined) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              >
                <option value="">(선택)</option>
                {f.enumValues.map((ev) => (
                  <option key={ev.value} value={ev.value}>{ev.label}</option>
                ))}
              </select>
            ) : f.kind === 'boolean' ? (
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
