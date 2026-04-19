'use client';

import { useState, useTransition } from 'react';
import { upsertRehabDebtor, type DebtorPatch } from '@/app/actions/rehab';
import type { Debtor } from '@/lib/ontology/domains/personal_rehab/entities';
import { checkShorteningEligibility, screenRisks, checkEligibility } from '@/lib/ontology/domains/personal_rehab/risks';

const RESIDENCE_OPTIONS: Array<{ value: Debtor['residence_type']; label: string }> = [
  { value: 'owned', label: '자가' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly_rent', label: '월세' },
  { value: 'other', label: '기타' },
];

const JOB_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'earned', label: '근로' },
  { value: 'business', label: '사업' },
  { value: 'freelance', label: '프리랜서' },
  { value: 'unemployed', label: '무직' },
];

const SHORTENING_KEYS = [
  { key: 'is_under_30', label: '만 30세 미만' },
  { key: 'is_over_65', label: '만 65세 이상' },
  { key: 'is_single_parent', label: '한부모 가정' },
  { key: 'has_2plus_minor_children', label: '미성년 자녀 2명 이상' },
  { key: 'is_jeonse_fraud_victim', label: '전세사기 피해자' },
  { key: 'is_severely_disabled', label: '중증 장애인' },
] as const;

const RISK_CHECKBOX_KEYS = [
  { key: 'recent_loan_within_3m', label: '최근 3개월 내 대출', level: 'red' as const },
  { key: 'has_prior_discharge_within_5y', label: '면책 후 5년 이내 재신청', level: 'red' as const, on: 'eligibility' as const },
  { key: 'has_criminal_case', label: '형사사건 진행 중', level: 'red' as const },
  { key: 'preferential_transfer_risk', label: '편파변제 있음', level: 'yellow' as const },
  { key: 'fraudulent_transfer_risk', label: '최근 재산 처분', level: 'yellow' as const },
  { key: 'has_guarantor', label: '보증인 존재', level: 'yellow' as const },
  { key: 'has_tax_arrears', label: '국세 체납', level: 'yellow' as const },
  { key: 'has_insurance_arrears', label: '4대보험 체납', level: 'yellow' as const },
];

export function DebtorProfileSection({
  caseId,
  debtor,
}: {
  caseId: string;
  debtor: Debtor | null;
}) {
  const [editing, setEditing] = useState(false);

  if (!debtor) {
    return (
      <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg p-5 text-center space-y-3">
        <p className="text-sm">👤 채무자 프로필 없음</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          상담·수임 단계에서 채무자 기본 정보와 리스크 플래그를 먼저 입력하세요.
        </p>
        <button
          onClick={() => setEditing(true)}
          className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          + 채무자 프로필 생성
        </button>
        {editing && (
          <DebtorEditor caseId={caseId} initial={null} onClose={() => setEditing(false)} />
        )}
      </section>
    );
  }

  const risks = screenRisks(debtor);
  const shortening = checkShorteningEligibility(debtor);
  const eligibility = checkEligibility(debtor);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold">👤 채무자 프로필 — {debtor.name}</h2>
        <button
          onClick={() => setEditing(true)}
          className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700"
        >
          편집
        </button>
      </div>
      <div className="p-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCell label="연령" value={debtor.age?.toString() ?? '-'} />
          <InfoCell label="성별" value={debtor.gender ?? '-'} />
          <InfoCell label="주거" value={residenceLabel(debtor.residence_type)} />
          <InfoCell label="보증금" value={debtor.deposit_amount_krw ? `${Math.round(debtor.deposit_amount_krw / 10000).toLocaleString()}만` : '-'} />
          <InfoCell label="직업" value={debtor.job_types.map(jobLabel).join('·') || '-'} />
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
            적격성
          </div>
          {eligibility.is_eligible ? (
            <p className="text-emerald-700 dark:text-emerald-400">✓ 개인회생 신청 가능</p>
          ) : (
            <div className="text-red-600 dark:text-red-400">
              🔴 차단사유:
              <ul className="list-disc list-inside mt-0.5">
                {eligibility.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
          {eligibility.warnings.length > 0 && (
            <div className="text-amber-700 dark:text-amber-400 mt-1">
              ⚠ {eligibility.warnings.join(', ')}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
            리스크 스크리닝 — {risks.summary}
          </div>
          {risks.flags.length === 0 ? (
            <p className="text-zinc-500">리스크 플래그 없음</p>
          ) : (
            <div className="space-y-1">
              {risks.flags.map((f) => (
                <div key={f.key} className="flex items-start gap-2">
                  <span>{f.level === 'red' ? '🔴' : '🟡'}</span>
                  <div className="flex-1">
                    <span className="font-medium">{f.label}</span>
                    <span className="text-zinc-500 ml-2">— {f.response}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
            24개월 단축계획 자격
          </div>
          {shortening.is_eligible ? (
            <div className="text-emerald-700 dark:text-emerald-400">
              ✓ 자격 충족 ({shortening.reasons.map((r) => r.label).join(', ')})
            </div>
          ) : (
            <p className="text-zinc-500">해당사유 없음 — 36개월 원칙</p>
          )}
        </div>
      </div>

      {editing && (
        <DebtorEditor caseId={caseId} initial={debtor} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function residenceLabel(v: Debtor['residence_type']): string {
  return RESIDENCE_OPTIONS.find((o) => o.value === v)?.label ?? '-';
}

function jobLabel(v: string): string {
  return JOB_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function DebtorEditor({
  caseId,
  initial,
  onClose,
}: {
  caseId: string;
  initial: Debtor | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState(initial?.age?.toString() ?? '');
  const [gender, setGender] = useState<Debtor['gender']>(initial?.gender ?? null);
  const [residence, setResidence] = useState<Debtor['residence_type']>(initial?.residence_type ?? null);
  const [deposit, setDeposit] = useState(initial?.deposit_amount_krw?.toString() ?? '');
  const [jobs, setJobs] = useState<string[]>(initial?.job_types ?? []);
  const [shortening, setShortening] = useState({
    is_under_30: initial?.shortening?.is_under_30 ?? false,
    is_over_65: initial?.shortening?.is_over_65 ?? false,
    is_single_parent: initial?.shortening?.is_single_parent ?? false,
    has_2plus_minor_children: initial?.shortening?.has_2plus_minor_children ?? false,
    is_jeonse_fraud_victim: initial?.shortening?.is_jeonse_fraud_victim ?? false,
    is_severely_disabled: initial?.shortening?.is_severely_disabled ?? false,
  });
  const [risks, setRisks] = useState({
    has_tax_arrears: initial?.risks?.has_tax_arrears ?? false,
    has_insurance_arrears: initial?.risks?.has_insurance_arrears ?? false,
    has_criminal_case: initial?.risks?.has_criminal_case ?? false,
    preferential_transfer_risk: initial?.risks?.preferential_transfer_risk ?? false,
    fraudulent_transfer_risk: initial?.risks?.fraudulent_transfer_risk ?? false,
    has_guarantor: initial?.risks?.has_guarantor ?? false,
    recent_loan_within_3m: initial?.risks?.recent_loan_within_3m ?? false,
  });
  const [eligibility, setEligibility] = useState({
    has_prior_discharge_within_5y: initial?.eligibility?.has_prior_discharge_within_5y ?? false,
    has_regular_income: initial?.eligibility?.has_regular_income ?? true,
    is_business_income_earner: initial?.eligibility?.is_business_income_earner ?? false,
    unsecured_debt_cap_ok: initial?.eligibility?.unsecured_debt_cap_ok ?? true,
    secured_debt_cap_ok: initial?.eligibility?.secured_debt_cap_ok ?? true,
  });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleJob = (j: string) => {
    setJobs((prev) => (prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j]));
  };

  const save = () => {
    setError(null);
    if (!name.trim()) return setError('이름 필수');
    const patch: DebtorPatch = {
      name: name.trim(),
      age: age ? Number(age) : null,
      gender,
      residence_type: residence,
      deposit_amount_krw: deposit ? Number(deposit) : null,
      job_types: jobs as Debtor['job_types'],
      shortening,
      risks,
      eligibility,
    };
    startTransition(async () => {
      const r = await upsertRehabDebtor({ caseId, patch });
      if (!r.ok) setError(r.error ?? '저장 실패');
      else onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); save(); }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-2xl p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto"
      >
        <h2 className="text-lg font-semibold">채무자 프로필</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="이름 *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
          <Field label="연령">
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
          <Field label="성별">
            <select
              value={gender ?? ''}
              onChange={(e) => setGender((e.target.value || null) as Debtor['gender'])}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            >
              <option value="">—</option>
              <option value="M">남</option>
              <option value="F">여</option>
              <option value="other">기타</option>
            </select>
          </Field>
          <Field label="주거">
            <select
              value={residence ?? ''}
              onChange={(e) => setResidence((e.target.value || null) as Debtor['residence_type'])}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            >
              <option value="">—</option>
              {RESIDENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value!}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="보증금 (원)">
            <input
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
            />
          </Field>
          <Field label="직업 (복수)">
            <div className="flex flex-wrap gap-1">
              {JOB_OPTIONS.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  onClick={() => toggleJob(o.value)}
                  className={`text-xs px-2 py-1 rounded border ${
                    jobs.includes(o.value)
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-xs font-semibold mb-2">적격성</div>
          <div className="space-y-1.5 text-sm">
            <CheckRow
              label="면책 후 5년 이내 재신청 (🔴 차단)"
              checked={eligibility.has_prior_discharge_within_5y}
              onChange={(v) => setEligibility((s) => ({ ...s, has_prior_discharge_within_5y: v }))}
            />
            <CheckRow
              label="정기적·확실한 수입 있음"
              checked={eligibility.has_regular_income}
              onChange={(v) => setEligibility((s) => ({ ...s, has_regular_income: v }))}
            />
            <CheckRow
              label="무담보 채무 10억 이하"
              checked={eligibility.unsecured_debt_cap_ok}
              onChange={(v) => setEligibility((s) => ({ ...s, unsecured_debt_cap_ok: v }))}
            />
            <CheckRow
              label="담보 채무 15억 이하"
              checked={eligibility.secured_debt_cap_ok}
              onChange={(v) => setEligibility((s) => ({ ...s, secured_debt_cap_ok: v }))}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-xs font-semibold mb-2">리스크 플래그</div>
          <div className="space-y-1.5 text-sm">
            {RISK_CHECKBOX_KEYS.filter((r) => r.key !== 'has_prior_discharge_within_5y').map((r) => (
              <CheckRow
                key={r.key}
                label={`${r.level === 'red' ? '🔴' : '🟡'} ${r.label}`}
                checked={(risks as Record<string, boolean>)[r.key] ?? false}
                onChange={(v) => setRisks((s) => ({ ...s, [r.key]: v }))}
              />
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-xs font-semibold mb-2">24개월 단축계획 자격 (6가지 중 하나라도 충족)</div>
          <div className="space-y-1.5 text-sm">
            {SHORTENING_KEYS.map((s) => (
              <CheckRow
                key={s.key}
                label={s.label}
                checked={shortening[s.key]}
                onChange={(v) => setShortening((prev) => ({ ...prev, [s.key]: v }))}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-sm border border-zinc-300 dark:border-zinc-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '저장 중...' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 block mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 px-1 py-0.5 rounded text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
