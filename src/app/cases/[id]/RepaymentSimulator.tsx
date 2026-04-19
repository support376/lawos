'use client';

import { useState, useTransition } from 'react';
import {
  simulateRepaymentAction,
  recommendPathAction,
} from '@/app/actions/simulate';
import type { RepaymentResult } from '@/lib/calculators/repayment';
import type { PathRecommendation } from '@/lib/ai/recommend';

const PATH_LABEL: Record<string, string> = {
  personal_rehab: '개인회생',
  bankruptcy: '파산·면책',
  workout: '워크아웃',
  pre_workout: '프리워크아웃',
};

const FIT_COLOR: Record<string, string> = {
  strong_fit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  possible: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  not_fit: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
};

export function RepaymentSimulator() {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const [income, setIncome] = useState('');
  const [family, setFamily] = useState('1');
  const [unsecured, setUnsecured] = useState('');
  const [secured, setSecured] = useState('');
  const [asset, setAsset] = useState('');
  const [planYears, setPlanYears] = useState<3 | 5>(3);
  const [stableJob, setStableJob] = useState(true);
  const [litigation, setLitigation] = useState(false);

  const [simResult, setSimResult] = useState<RepaymentResult | null>(null);
  const [pathResult, setPathResult] = useState<PathRecommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSim = () => {
    setError(null);
    const r = simulateRepaymentAction({
      monthlyIncome: Number(income) || 0,
      familySize: Number(family) || 1,
      totalDebt: Number(unsecured) || 0,
      assetValue: Number(asset) || 0,
      planYears,
    });
    // Server action returns Promise even for sync
    Promise.resolve(r).then(setSimResult);
  };

  const runRecommend = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await recommendPathAction({
          monthlyIncome: Number(income) || 0,
          familySize: Number(family) || 1,
          unsecuredDebt: Number(unsecured) || 0,
          securedDebt: Number(secured) || 0,
          assetValue: Number(asset) || 0,
          hasStableJob: stableJob,
          hasLitigationInProgress: litigation,
        });
        setPathResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : '추천 실패');
      }
    });
  };

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div>
          <h3 className="text-sm font-semibold">🧮 변제계획 시뮬 + 경로 추천</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            법정 기준 월 변제액 자동 계산 + AI 경로 추천
          </p>
        </div>
        <span className="text-xs text-zinc-500">{expanded ? '접기 ▲' : '열기 ▼'}</span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <div className="grid grid-cols-2 gap-2">
            <InputField label="월 소득 (세후, 원)" value={income} onChange={setIncome} />
            <InputField label="가구원 수 (본인 포함)" value={family} onChange={setFamily} />
            <InputField label="무담보 채무 (원)" value={unsecured} onChange={setUnsecured} />
            <InputField label="담보 채무 (원, 선택)" value={secured} onChange={setSecured} />
            <InputField label="재산 청산가치 (원, 선택)" value={asset} onChange={setAsset} />
            <div>
              <label className="text-xs text-zinc-500 block mb-1">변제 기간</label>
              <select
                value={planYears}
                onChange={(e) => setPlanYears(Number(e.target.value) as 3 | 5)}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              >
                <option value={3}>3년 (기본)</option>
                <option value={5}>5년 (예외)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={stableJob}
                onChange={(e) => setStableJob(e.target.checked)}
              />
              안정적 소득
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={litigation}
                onChange={(e) => setLitigation(e.target.checked)}
              />
              진행 중 소송
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={runSim}
              className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              변제계획 계산
            </button>
            <button
              onClick={runRecommend}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {pending ? 'AI 분석 중...' : 'AI 경로 추천'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {simResult && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-md space-y-1.5 text-sm">
              <div className="font-medium">변제계획 계산 결과</div>
              <Row label="생계비 (법정)">{simResult.living_cost_monthly.toLocaleString()}원/월</Row>
              <Row label="월 변제액 (가처분)">
                <strong>{simResult.disposable_monthly.toLocaleString()}원</strong>
              </Row>
              <Row label={`총 변제액 (${simResult.plan_years}년)`}>
                <strong>{simResult.total_repayment.toLocaleString()}원</strong>
              </Row>
              <Row label="변제율">{simResult.repayment_ratio}%</Row>
              <Row label="청산가치 보장">
                {simResult.passes_liquidation_test ? (
                  <span className="text-emerald-600">✓ 통과</span>
                ) : (
                  <span className="text-red-600">✗ 위배</span>
                )}
              </Row>
              {simResult.notes.length > 0 && (
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                  {simResult.notes.map((n, i) => (
                    <p key={i} className="text-xs text-amber-700 dark:text-amber-400">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {pathResult && (
            <div className="space-y-2">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                <div className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
                  💡 추천 경로
                </div>
                <div className="text-sm font-semibold">
                  {PATH_LABEL[pathResult.recommended]}
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-400 mt-1">
                  {pathResult.reasoning}
                </p>
              </div>

              <div className="space-y-1.5">
                {pathResult.comparison.map((opt, i) => (
                  <div
                    key={i}
                    className="p-2.5 border border-zinc-200 dark:border-zinc-700 rounded"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {PATH_LABEL[opt.option] ?? opt.label}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${FIT_COLOR[opt.fit]}`}
                      >
                        {opt.fit === 'strong_fit'
                          ? '강력 적합'
                          : opt.fit === 'possible'
                            ? '가능'
                            : '부적합'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-emerald-700 dark:text-emerald-400 font-medium">
                          장점
                        </div>
                        <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                          {opt.pros.map((p, j) => (
                            <li key={j}>{p}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-red-700 dark:text-red-400 font-medium">단점</div>
                        <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                          {opt.cons.map((c, j) => (
                            <li key={j}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pathResult.cautions.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded">
                  <div className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                    ⚠ 주의사항
                  </div>
                  <ul className="text-xs text-amber-800 dark:text-amber-400 list-disc list-inside">
                    {pathResult.cautions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-500 block mb-1">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}
