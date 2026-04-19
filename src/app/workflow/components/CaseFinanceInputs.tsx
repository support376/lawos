'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addRehabDebt,
  addRehabAsset,
  addRehabIncome,
  addRehabDependent,
  deleteRehabRow,
} from '@/app/actions/rehab';
import type {
  Debt,
  Asset,
  Income,
  Dependent,
  DebtType,
  AssetType,
  IncomeType,
  DependentRelation,
} from '@/lib/ontology/domains/personal_rehab/entities';

function krw(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

type Tab = 'debt' | 'asset' | 'income' | 'dependent';

export function CaseFinanceInputs({
  caseId,
  debts,
  assets,
  incomes,
  dependents,
}: {
  caseId: string;
  debts: Debt[];
  assets: Asset[];
  incomes: Income[];
  dependents: Dependent[];
}) {
  const [tab, setTab] = useState<Tab>('debt');

  const counts = { debt: debts.length, asset: assets.length, income: incomes.length, dependent: dependents.length };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">재정 입력 (채무·재산·소득·부양)</h2>
      </div>
      <div className="border-b border-zinc-200 dark:border-zinc-800 flex">
        {([
          { k: 'debt' as const, l: '채무', c: counts.debt },
          { k: 'asset' as const, l: '재산', c: counts.asset },
          { k: 'income' as const, l: '소득', c: counts.income },
          { k: 'dependent' as const, l: '부양가족', c: counts.dependent },
        ]).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-xs ${
              tab === t.k
                ? 'border-b-2 border-zinc-900 dark:border-zinc-100 font-medium'
                : 'text-zinc-500'
            }`}
          >
            {t.l} ({t.c})
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === 'debt' && <DebtTab caseId={caseId} rows={debts} />}
        {tab === 'asset' && <AssetTab caseId={caseId} rows={assets} />}
        {tab === 'income' && <IncomeTab caseId={caseId} rows={incomes} />}
        {tab === 'dependent' && <DependentTab caseId={caseId} rows={dependents} />}
      </div>
    </section>
  );
}

// ============= Debt =============
const DEBT_TYPES: Array<{ v: DebtType; l: string }> = [
  { v: 'general_unsecured', l: '일반무담보' },
  { v: 'secured', l: '담보부' },
  { v: 'priority', l: '우선권' },
  { v: 'tax', l: '조세' },
  { v: 'non_dischargeable', l: '비면책·형사' },
  { v: 'private_loan', l: '사채' },
];

function DebtTab({ caseId, rows }: { caseId: string; rows: Debt[] }) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button onClick={() => setShowNew(true)} className="text-xs px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
          + 채무 추가
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">채무 없음</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-3">유형</th>
              <th className="py-1.5 pr-3">채권자</th>
              <th className="py-1.5 pr-3 text-right">원금</th>
              <th className="py-1.5 pr-3 text-right">이자</th>
              <th className="py-1.5 pr-3">플래그</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <DebtRow key={d.id} debt={d} />
            ))}
          </tbody>
        </table>
      )}
      {showNew && <DebtForm caseId={caseId} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function DebtRow({ debt }: { debt: Debt }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onDelete = () => {
    if (!confirm('이 채무를 삭제할까요?')) return;
    startTransition(async () => {
      await deleteRehabRow({ table: 'rehab_debts', id: debt.id });
      router.refresh();
    });
  };
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-1.5 pr-3">{DEBT_TYPES.find((t) => t.v === debt.type)?.l ?? debt.type}</td>
      <td className="py-1.5 pr-3">{debt.creditor_name}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(debt.principal_krw)}원</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(debt.interest_krw)}원</td>
      <td className="py-1.5 pr-3 text-[10px]">
        {debt.has_collateral && '담보 '}
        {debt.is_litigated && '소송 '}
        {debt.has_guarantor && '보증 '}
      </td>
      <td className="py-1.5">
        <button onClick={onDelete} disabled={pending} className="text-[10px] text-red-600 disabled:opacity-50">✕</button>
      </td>
    </tr>
  );
}

function DebtForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'general_unsecured' as DebtType,
    creditor_name: '',
    creditor_type: 'bank' as 'bank' | 'card' | 'private' | 'tax_authority' | 'criminal' | 'other',
    principal_krw: '',
    interest_krw: '0',
    overdue_interest_krw: '0',
    has_collateral: false,
    is_litigated: false,
    has_guarantor: false,
  });

  const submit = () => {
    setErr(null);
    if (!form.creditor_name.trim()) return setErr('채권자 필수');
    const p = Number(form.principal_krw);
    if (!Number.isFinite(p) || p < 0) return setErr('원금 오류');
    startTransition(async () => {
      const r = await addRehabDebt({
        caseId,
        data: {
          type: form.type,
          creditor_name: form.creditor_name.trim(),
          creditor_type: form.creditor_type,
          principal_krw: p,
          interest_krw: Number(form.interest_krw) || 0,
          overdue_interest_krw: Number(form.overdue_interest_krw) || 0,
          origin_date: null,
          last_payment_date: null,
          cause: null,
          has_collateral: form.has_collateral,
          is_in_collection: false,
          is_litigated: form.is_litigated,
          judgment_finalized: false,
          has_guarantor: form.has_guarantor,
          statute_of_limitations_expired: false,
        },
      });
      if (!r.ok) setErr(r.error ?? '실패');
      else { onClose(); router.refresh(); }
    });
  };

  return (
    <Modal onClose={onClose} title="채무 추가">
      <div className="grid grid-cols-2 gap-2">
        <InputField label="채권자 *">
          <input value={form.creditor_name} onChange={(e) => setForm({ ...form, creditor_name: e.target.value })} className="inp" autoFocus />
        </InputField>
        <InputField label="유형">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DebtType })} className="inp">
            {DEBT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </InputField>
        <InputField label="원금 (원) *">
          <input type="number" value={form.principal_krw} onChange={(e) => setForm({ ...form, principal_krw: e.target.value })} className="inp" />
        </InputField>
        <InputField label="이자 (원)">
          <input type="number" value={form.interest_krw} onChange={(e) => setForm({ ...form, interest_krw: e.target.value })} className="inp" />
        </InputField>
        <InputField label="지연손해금">
          <input type="number" value={form.overdue_interest_krw} onChange={(e) => setForm({ ...form, overdue_interest_krw: e.target.value })} className="inp" />
        </InputField>
        <InputField label="채권자 유형">
          <select value={form.creditor_type} onChange={(e) => setForm({ ...form, creditor_type: e.target.value as typeof form.creditor_type })} className="inp">
            <option value="bank">은행</option>
            <option value="card">카드</option>
            <option value="private">사채</option>
            <option value="tax_authority">세무</option>
            <option value="criminal">형사</option>
            <option value="other">기타</option>
          </select>
        </InputField>
      </div>
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.has_collateral} onChange={(e) => setForm({ ...form, has_collateral: e.target.checked })} /> 담보</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.is_litigated} onChange={(e) => setForm({ ...form, is_litigated: e.target.checked })} /> 소송 중</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.has_guarantor} onChange={(e) => setForm({ ...form, has_guarantor: e.target.checked })} /> 보증인</label>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} pending={pending} />
    </Modal>
  );
}

// ============= Asset =============
const ASSET_TYPES: Array<{ v: AssetType; l: string }> = [
  { v: 'real_estate', l: '부동산' },
  { v: 'deposit', l: '예금' },
  { v: 'security_deposit', l: '임차보증금' },
  { v: 'insurance_surrender', l: '보험해약금' },
  { v: 'vehicle', l: '차량' },
  { v: 'retirement', l: '퇴직금' },
  { v: 'business_asset', l: '사업용자산' },
  { v: 'receivable', l: '채권' },
];

function AssetTab({ caseId, rows }: { caseId: string; rows: Asset[] }) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button onClick={() => setShowNew(true)} className="text-xs px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">+ 재산 추가</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">재산 없음</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-3">유형</th>
              <th className="py-1.5 pr-3">라벨</th>
              <th className="py-1.5 pr-3 text-right">시가</th>
              <th className="py-1.5 pr-3 text-right">청산</th>
              <th className="py-1.5 pr-3 text-right">면제</th>
              <th className="py-1.5 pr-3 text-right">담보채권</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => <AssetRow key={a.id} asset={a} />)}
          </tbody>
        </table>
      )}
      {showNew && <AssetForm caseId={caseId} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function AssetRow({ asset }: { asset: Asset }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onDelete = () => {
    if (!confirm('이 재산을 삭제할까요?')) return;
    startTransition(async () => {
      await deleteRehabRow({ table: 'rehab_assets', id: asset.id });
      router.refresh();
    });
  };
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-1.5 pr-3">{ASSET_TYPES.find((t) => t.v === asset.type)?.l ?? asset.type}</td>
      <td className="py-1.5 pr-3">{asset.label}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(asset.market_value_krw)}원</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(asset.liquidation_value_krw)}원</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(asset.exempt_amount_krw)}원</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(asset.secured_claims_on_asset_krw)}원</td>
      <td className="py-1.5"><button onClick={onDelete} disabled={pending} className="text-[10px] text-red-600">✕</button></td>
    </tr>
  );
}

function AssetForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'deposit' as AssetType,
    label: '',
    market_value_krw: '',
    liquidation_value_krw: '',
    exempt_amount_krw: '0',
    secured_claims_on_asset_krw: '0',
  });

  const submit = () => {
    setErr(null);
    if (!form.label.trim()) return setErr('라벨 필수');
    startTransition(async () => {
      const r = await addRehabAsset({
        caseId,
        data: {
          type: form.type,
          label: form.label.trim(),
          market_value_krw: Number(form.market_value_krw) || 0,
          liquidation_value_krw: Number(form.liquidation_value_krw) || 0,
          exempt_amount_krw: Number(form.exempt_amount_krw) || 0,
          secured_claims_on_asset_krw: Number(form.secured_claims_on_asset_krw) || 0,
          pending_confirmation: false,
        },
      });
      if (!r.ok) setErr(r.error ?? '실패');
      else { onClose(); router.refresh(); }
    });
  };

  return (
    <Modal onClose={onClose} title="재산 추가">
      <div className="grid grid-cols-2 gap-2">
        <InputField label="유형">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })} className="inp">
            {ASSET_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </InputField>
        <InputField label="라벨 *">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="예: 국민은행 급여통장" className="inp" autoFocus />
        </InputField>
        <InputField label="시가 (원)">
          <input type="number" value={form.market_value_krw} onChange={(e) => setForm({ ...form, market_value_krw: e.target.value })} className="inp" />
        </InputField>
        <InputField label="청산가치 (원)">
          <input type="number" value={form.liquidation_value_krw} onChange={(e) => setForm({ ...form, liquidation_value_krw: e.target.value })} className="inp" />
        </InputField>
        <InputField label="면제액 (원)">
          <input type="number" value={form.exempt_amount_krw} onChange={(e) => setForm({ ...form, exempt_amount_krw: e.target.value })} className="inp" />
        </InputField>
        <InputField label="담보채권 (원)">
          <input type="number" value={form.secured_claims_on_asset_krw} onChange={(e) => setForm({ ...form, secured_claims_on_asset_krw: e.target.value })} className="inp" />
        </InputField>
      </div>
      <p className="text-[10px] text-zinc-500">
        순가치 = 청산 − 면제 − 담보채권. 이 값이 청산가치보장에 쓰임.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} pending={pending} />
    </Modal>
  );
}

// ============= Income =============
const INCOME_TYPES: Array<{ v: IncomeType; l: string }> = [
  { v: 'earned', l: '근로' },
  { v: 'business', l: '사업' },
  { v: 'freelance', l: '프리랜서' },
  { v: 'public_benefit', l: '공적급여' },
];

function IncomeTab({ caseId, rows }: { caseId: string; rows: Income[] }) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button onClick={() => setShowNew(true)} className="text-xs px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">+ 소득 추가</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">소득 없음</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-3">유형</th>
              <th className="py-1.5 pr-3 text-right">월액(세후)</th>
              <th className="py-1.5 pr-3">플래그</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => <IncomeRow key={i.id} income={i} />)}
          </tbody>
        </table>
      )}
      {showNew && <IncomeForm caseId={caseId} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function IncomeRow({ income }: { income: Income }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const onDelete = () => {
    if (!confirm('삭제할까요?')) return;
    startTransition(async () => {
      await deleteRehabRow({ table: 'rehab_incomes', id: income.id });
      router.refresh();
    });
  };
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-1.5 pr-3">{INCOME_TYPES.find((t) => t.v === income.type)?.l ?? income.type}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{krw(income.monthly_amount_krw)}원</td>
      <td className="py-1.5 pr-3 text-[10px]">
        {income.is_regular ? '정기 ' : ''}
        {income.is_documented ? '문서화 ' : ''}
      </td>
      <td className="py-1.5"><button onClick={onDelete} disabled={pending} className="text-[10px] text-red-600">✕</button></td>
    </tr>
  );
}

function IncomeForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'earned' as IncomeType,
    monthly_amount_krw: '',
    is_regular: true,
    is_documented: true,
    declared_for_intake_krw: '',
    bank_evidence_amount_krw: '',
  });

  const submit = () => {
    setErr(null);
    const n = Number(form.monthly_amount_krw);
    if (!Number.isFinite(n) || n < 0) return setErr('월액 오류');
    startTransition(async () => {
      const r = await addRehabIncome({
        caseId,
        data: {
          type: form.type,
          monthly_amount_krw: n,
          is_regular: form.is_regular,
          is_documented: form.is_documented,
          declared_for_intake_krw: form.declared_for_intake_krw ? Number(form.declared_for_intake_krw) : null,
          bank_evidence_amount_krw: form.bank_evidence_amount_krw ? Number(form.bank_evidence_amount_krw) : null,
        },
      });
      if (!r.ok) setErr(r.error ?? '실패');
      else { onClose(); router.refresh(); }
    });
  };

  return (
    <Modal onClose={onClose} title="소득 추가">
      <div className="grid grid-cols-2 gap-2">
        <InputField label="유형">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as IncomeType })} className="inp">
            {INCOME_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </InputField>
        <InputField label="월 세후 (원) *">
          <input type="number" value={form.monthly_amount_krw} onChange={(e) => setForm({ ...form, monthly_amount_krw: e.target.value })} className="inp" autoFocus />
        </InputField>
      </div>
      {form.type === 'business' && (
        <div className="grid grid-cols-2 gap-2">
          <InputField label="인테이크 신고액">
            <input type="number" value={form.declared_for_intake_krw} onChange={(e) => setForm({ ...form, declared_for_intake_krw: e.target.value })} className="inp" />
          </InputField>
          <InputField label="계좌 실증액">
            <input type="number" value={form.bank_evidence_amount_krw} onChange={(e) => setForm({ ...form, bank_evidence_amount_krw: e.target.value })} className="inp" />
          </InputField>
        </div>
      )}
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.is_regular} onChange={(e) => setForm({ ...form, is_regular: e.target.checked })} /> 정기적</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.is_documented} onChange={(e) => setForm({ ...form, is_documented: e.target.checked })} /> 원천·4대보험</label>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} pending={pending} />
    </Modal>
  );
}

// ============= Dependent =============
function DependentTab({ caseId, rows }: { caseId: string; rows: Dependent[] }) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button onClick={() => setShowNew(true)} className="text-xs px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">+ 부양가족 추가</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-4">부양가족 없음</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 pr-3">관계</th>
              <th className="py-1.5 pr-3">나이</th>
              <th className="py-1.5 pr-3">플래그</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => <DependentRow key={d.id} dep={d} />)}
          </tbody>
        </table>
      )}
      {showNew && <DependentForm caseId={caseId} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function DependentRow({ dep }: { dep: Dependent }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const labels: Record<DependentRelation, string> = { spouse: '배우자', child: '자녀', parent: '부모', other: '기타' };
  const onDelete = () => {
    if (!confirm('삭제할까요?')) return;
    startTransition(async () => {
      await deleteRehabRow({ table: 'rehab_dependents', id: dep.id });
      router.refresh();
    });
  };
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-1.5 pr-3">{labels[dep.relation]}</td>
      <td className="py-1.5 pr-3">{dep.age ?? '—'}</td>
      <td className="py-1.5 pr-3 text-[10px]">
        {dep.is_cohabiting ? '동거 ' : ''}
        {dep.is_minor ? '미성년 ' : ''}
        {dep.has_own_income ? '경제활동 ' : ''}
        {dep.young_adult_dependent_claim ? '성년자녀주장 ' : ''}
      </td>
      <td className="py-1.5"><button onClick={onDelete} disabled={pending} className="text-[10px] text-red-600">✕</button></td>
    </tr>
  );
}

function DependentForm({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    relation: 'child' as DependentRelation,
    age: '',
    is_cohabiting: true,
    has_own_income: false,
    is_minor: true,
    young_adult_dependent_claim: false,
  });

  const submit = () => {
    setErr(null);
    startTransition(async () => {
      const r = await addRehabDependent({
        caseId,
        data: {
          relation: form.relation,
          age: form.age ? Number(form.age) : 0,
          is_cohabiting: form.is_cohabiting,
          has_own_income: form.has_own_income,
          is_minor: form.is_minor,
          young_adult_dependent_claim: form.young_adult_dependent_claim,
        },
      });
      if (!r.ok) setErr(r.error ?? '실패');
      else { onClose(); router.refresh(); }
    });
  };

  return (
    <Modal onClose={onClose} title="부양가족 추가">
      <div className="grid grid-cols-2 gap-2">
        <InputField label="관계">
          <select value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value as DependentRelation })} className="inp">
            <option value="spouse">배우자</option>
            <option value="child">자녀</option>
            <option value="parent">부모</option>
            <option value="other">기타</option>
          </select>
        </InputField>
        <InputField label="나이">
          <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="inp" />
        </InputField>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.is_cohabiting} onChange={(e) => setForm({ ...form, is_cohabiting: e.target.checked })} /> 동거</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.is_minor} onChange={(e) => setForm({ ...form, is_minor: e.target.checked })} /> 미성년</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.has_own_income} onChange={(e) => setForm({ ...form, has_own_income: e.target.checked })} /> 경제활동</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.young_adult_dependent_claim} onChange={(e) => setForm({ ...form, young_adult_dependent_claim: e.target.checked })} /> 성년자녀 부양 주장</label>
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <ModalFooter onClose={onClose} onSubmit={submit} pending={pending} />
    </Modal>
  );
}

// ============= shared =============
function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-3 shadow-xl max-h-[92vh] overflow-y-auto">
        <h3 className="text-base font-semibold">{title}</h3>
        {children}
        <style jsx>{`
          :global(.inp) {
            width: 100%;
            padding: 6px 10px;
            font-size: 13px;
            border: 1px solid rgb(212 212 216);
            border-radius: 4px;
            background: transparent;
          }
          :global(.dark .inp) {
            border-color: rgb(63 63 70);
          }
        `}</style>
      </div>
    </div>
  );
}

function InputField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-zinc-500 block mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function ModalFooter({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: () => void; pending: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700">취소</button>
      <button type="button" onClick={onSubmit} disabled={pending} className="px-4 py-1.5 text-sm rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50">
        {pending ? '저장중...' : '추가'}
      </button>
    </div>
  );
}
