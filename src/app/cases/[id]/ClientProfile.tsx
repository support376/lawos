'use client';

import { useState, useTransition } from 'react';
import {
  updateClientIntel,
  type Asset,
  type ClientIntelPatch,
  type RiskFlags,
} from '@/app/actions/client-intel';
import { getDomain } from '@/lib/ontology/registry';
import type { RiskFlagSpec } from '@/lib/ontology/core/types';

export interface ClientSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  memo: string | null;
  occupation: string | null;
  monthly_income_krw: number | null;
  total_debt_krw: number | null;
  dependents_count: number | null;
  assets: Asset[];
  risk_flags: RiskFlags;
  // 기존 인텔 (events 기반)
  activeCaseCount?: number;
  preferentialFoundCount?: number;
  hasRepaymentSim?: boolean;
  hasEngagementLetter?: boolean;
  // 증빙 (필수 서류 체크리스트 통합)
  documents?: Array<{ key: string; label: string; received: boolean; required: boolean }>;
}

// 도메인 없을 때 폴백 — 공통 플래그 최소
const FALLBACK_RISK_FLAGS: RiskFlagSpec[] = [
  { key: 'other_active_suits', label: '다른 소송 병행', tone: 'warn' },
];

function getRiskFlagSpecs(caseType: string | null | undefined): RiskFlagSpec[] {
  const d = getDomain(caseType);
  if (d && d.riskFlags.length > 0) return d.riskFlags;
  return FALLBACK_RISK_FLAGS;
}

function krwFormat(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString();
}

export function ClientProfile({
  client,
  caseId,
  caseType,
}: {
  client: ClientSummary;
  caseId?: string;
  caseType?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const riskSpecs = getRiskFlagSpecs(caseType);

  // 도메인이 선언한 clientFields로 렌더 필드 결정 (없으면 기본 4개)
  const domain = getDomain(caseType);
  const visibleFieldKeys = new Set(
    domain && domain.clientFields.length > 0
      ? domain.clientFields.map((f) => f.key)
      : ['monthly_income_krw', 'total_debt_krw', 'dependents_count', 'occupation'],
  );
  const showIncome = visibleFieldKeys.has('monthly_income_krw');
  const showDebt = visibleFieldKeys.has('total_debt_krw');
  const showDependents = visibleFieldKeys.has('dependents_count');
  const showOccupation = visibleFieldKeys.has('occupation');

  // 인텔 충족률 계산 (도메인 clientFields 기준)
  const financialValuesMap: Record<string, unknown> = {
    monthly_income_krw: client.monthly_income_krw,
    total_debt_krw: client.total_debt_krw,
    dependents_count: client.dependents_count,
    occupation: client.occupation,
  };
  const financialKeys = ['monthly_income_krw', 'total_debt_krw', 'dependents_count', 'occupation'];
  const relevantFinKeys = financialKeys.filter((k) => visibleFieldKeys.has(k));
  const financialFilled = relevantFinKeys.filter((k) => {
    const v = financialValuesMap[k];
    return v != null && v !== '';
  }).length;
  const financialTotal = Math.max(1, relevantFinKeys.length);

  const docsReceived = (client.documents ?? []).filter((d) => d.received && d.required).length;
  const docsRequired = (client.documents ?? []).filter((d) => d.required).length;

  const activeFlags = Object.entries(client.risk_flags ?? {}).filter(([, v]) => v);
  const aiFlags: string[] = [];
  if (client.preferentialFoundCount && client.preferentialFoundCount > 0)
    aiFlags.push(`🔴 편파변제 ${client.preferentialFoundCount}건 (AI 분석)`);
  if (client.hasEngagementLetter) aiFlags.push('✅ 수임확정');
  if (client.hasRepaymentSim) aiFlags.push('✅ 변제시뮬');

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          👤 의뢰인 인텔
          <span className="text-xs text-zinc-500 font-normal">
            사람 속성 (여러 사건 공유)
          </span>
        </h3>
        <div className="flex items-center gap-3">
          <IntelMeter
            label="재무"
            done={financialFilled}
            total={financialTotal}
          />
          {docsRequired > 0 && (
            <IntelMeter label="증빙" done={docsReceived} total={docsRequired} />
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            {editing ? '닫기' : '편집'}
          </button>
        </div>
      </div>

      {editing ? (
        <IntelEditor
          client={client}
          caseId={caseId}
          riskSpecs={riskSpecs}
          visibleFieldKeys={visibleFieldKeys}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* 기본 */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-500">기본</div>
            <div className="font-semibold">{client.name}</div>
            {client.occupation && (
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                직업: {client.occupation}
              </div>
            )}
            {(client.phone || client.email) && (
              <div className="text-xs text-zinc-500">
                {client.phone && <div>📞 {client.phone}</div>}
                {client.email && <div>✉️ {client.email}</div>}
              </div>
            )}
            {client.activeCaseCount !== undefined && client.activeCaseCount > 1 && (
              <div className="text-xs text-zinc-500">
                활성 사건 {client.activeCaseCount}건
              </div>
            )}
          </div>

          {/* 재무 */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-500 flex items-baseline gap-1 flex-wrap">
              재무
              <span className="text-[10px] font-normal text-zinc-400">
                {caseType === 'personal_rehab'
                  ? '— 변제율·가처분소득 산정'
                  : caseType === 'divorce'
                    ? '— 양육비·재산분할 기여도'
                    : '— 사건 분석 기초'}
              </span>
            </div>
            {showIncome && (
              <DataRow label="월 소득" value={`${krwFormat(client.monthly_income_krw)}원`} missing={client.monthly_income_krw == null} />
            )}
            {showDebt && (
              <DataRow label="총 부채" value={`${krwFormat(client.total_debt_krw)}원`} missing={client.total_debt_krw == null} />
            )}
            {showDependents && (
              <DataRow
                label="부양가족"
                value={client.dependents_count != null ? `${client.dependents_count}명` : '-'}
                missing={client.dependents_count == null}
              />
            )}
            {client.assets && client.assets.length > 0 && (
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                자산 {client.assets.length}건 ·{' '}
                {krwFormat(client.assets.reduce((s, a) => s + (a.value_krw ?? 0), 0))}원
              </div>
            )}
          </div>

          {/* 위험신호 + AI */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-500">위험신호</div>
            {activeFlags.length === 0 && aiFlags.length === 0 ? (
              <div className="text-xs text-zinc-400">없음</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {activeFlags.map(([k]) => {
                  const meta = riskSpecs.find((f) => f.key === k);
                  if (!meta) return null;
                  return (
                    <span
                      key={k}
                      className={`text-xs px-2 py-0.5 rounded ${
                        meta.tone === 'danger'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      {meta.label}
                    </span>
                  );
                })}
                {aiFlags.map((f, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 메모 (가로 전체) */}
          {client.memo && (
            <div className="md:col-span-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 mb-1">메모</div>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {client.memo}
              </p>
            </div>
          )}

          {/* 증빙 체크리스트 */}
          {client.documents && client.documents.length > 0 && (
            <div className="md:col-span-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-xs font-medium text-zinc-500 mb-1.5">
                증빙 ({docsReceived}/{docsRequired} 필수)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {client.documents.map((d) => (
                  <span
                    key={d.key}
                    className={`text-xs px-2 py-0.5 rounded border ${
                      d.received
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900'
                        : d.required
                          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    {d.received ? '✓' : d.required ? '!' : '○'} {d.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DataRow({
  label,
  value,
  missing,
}: {
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-zinc-500 w-14 shrink-0">{label}</span>
      <span
        className={
          missing
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-zinc-900 dark:text-zinc-100 tabular-nums'
        }
      >
        {missing ? '미입력' : value}
      </span>
    </div>
  );
}

function IntelMeter({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color =
    pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-zinc-400';
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-zinc-500">{done}/{total}</span>
    </div>
  );
}

function IntelEditor({
  client,
  caseId,
  riskSpecs,
  visibleFieldKeys,
  onClose,
}: {
  client: ClientSummary;
  caseId?: string;
  riskSpecs: RiskFlagSpec[];
  visibleFieldKeys: Set<string>;
  onClose: () => void;
}) {
  const [income, setIncome] = useState(client.monthly_income_krw ?? '');
  const [debt, setDebt] = useState(client.total_debt_krw ?? '');
  const [dependents, setDependents] = useState(client.dependents_count ?? '');
  const [occupation, setOccupation] = useState(client.occupation ?? '');
  const [phone, setPhone] = useState(client.phone ?? '');
  const [email, setEmail] = useState(client.email ?? '');
  const [memo, setMemo] = useState(client.memo ?? '');
  const [flags, setFlags] = useState<RiskFlags>(client.risk_flags ?? {});
  const [assets, setAssets] = useState<Asset[]>(client.assets ?? []);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    setError(null);
    const patch: ClientIntelPatch = {
      monthly_income_krw: income === '' ? null : Number(income),
      total_debt_krw: debt === '' ? null : Number(debt),
      dependents_count: dependents === '' ? null : Number(dependents),
      occupation: occupation || null,
      phone: phone || null,
      email: email || null,
      memo: memo || null,
      risk_flags: flags,
      assets,
    };
    startTransition(async () => {
      const r = await updateClientIntel(client.id, patch, caseId);
      if (!r.ok) {
        setError(r.hint ? `${r.error} — ${r.hint}` : r.error ?? '저장 실패');
      } else {
        onClose();
      }
    });
  };

  const toggleFlag = (k: string) => setFlags((f) => ({ ...f, [k]: !f[k] }));

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleFieldKeys.has('monthly_income_krw') && (
          <Field label="월 소득 (원)">
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="예: 3000000"
              className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
        )}
        {visibleFieldKeys.has('total_debt_krw') && (
          <Field label="총 부채 (원)">
            <input
              type="number"
              value={debt}
              onChange={(e) => setDebt(e.target.value)}
              placeholder="예: 80000000"
              className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
        )}
        {visibleFieldKeys.has('dependents_count') && (
          <Field label="부양가족 수">
            <input
              type="number"
              value={dependents}
              onChange={(e) => setDependents(e.target.value)}
              placeholder="예: 2"
              className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
        )}
        {visibleFieldKeys.has('occupation') && (
          <Field label="직업">
            <input
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="예: 직장인, 자영업"
              className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
        )}
        <Field label="전화">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          />
        </Field>
        <Field label="이메일">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          />
        </Field>
      </div>

      <Field label="위험신호 (전략 활성화 조건)">
        <div className="flex flex-wrap gap-2">
          {riskSpecs.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleFlag(f.key)}
              className={`text-xs px-2.5 py-1 rounded border ${
                flags[f.key]
                  ? f.tone === 'danger'
                    ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
                    : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {flags[f.key] ? '✓ ' : ''}
              {f.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="자산 (라벨/금액)">
        <AssetsEditor assets={assets} onChange={setAssets} />
      </Field>

      <Field label="메모 (자유 텍스트)">
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          className="w-full px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
        />
      </Field>

      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function AssetsEditor({
  assets,
  onChange,
}: {
  assets: Asset[];
  onChange: (a: Asset[]) => void;
}) {
  const update = (i: number, patch: Partial<Asset>) => {
    const next = [...assets];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(assets.filter((_, j) => j !== i));
  const add = () => onChange([...assets, { label: '', value_krw: 0 }]);

  return (
    <div className="space-y-1.5">
      {assets.map((a, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            type="text"
            value={a.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="예: 전세보증금"
            className="flex-1 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          />
          <input
            type="number"
            value={a.value_krw}
            onChange={(e) => update(i, { value_krw: Number(e.target.value) })}
            placeholder="금액"
            className="w-32 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-transparent tabular-nums"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="px-2 text-xs text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs px-2 py-1 rounded border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        + 자산 추가
      </button>
    </div>
  );
}
