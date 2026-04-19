'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadStatus, LeadLostReason, CommChannel, CommDirection } from '@/lib/ontology/core/objects';
import { LEAD_STATUS_LABEL, COMM_CHANNEL_LABEL } from '@/lib/ontology/core/objects';
import { updateLeadStatus, convertLeadToCase } from '@/app/actions/leads';
import { logCommunication, listCommunications } from '@/app/actions/communications';
import type { Communication } from '@/lib/ontology/core/objects';

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost', 'cold'];

export function LeadDetailModal({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'log' | 'action'>('info');

  const [comms, setComms] = useState<Communication[]>([]);
  useEffect(() => {
    listCommunications({ subject_type: 'lead', subject_id: lead.id })
      .then(setComms)
      .catch(() => setComms([]));
  }, [lead.id]);

  const changeStatus = (status: LeadStatus, lost_reason?: LeadLostReason) => {
    setError(null);
    startTransition(async () => {
      const r = await updateLeadStatus({ leadId: lead.id, status, lost_reason });
      if (!r.ok) setError(r.error ?? '실패');
      else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-xl"
      >
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{lead.name}</h2>
            <div className="text-xs text-zinc-500">
              {lead.contact ?? '—'} · {LEAD_STATUS_LABEL[lead.status]} · {lead.case_type_hint}
            </div>
          </div>
          <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>

        <div className="border-b border-zinc-200 dark:border-zinc-800 flex">
          {(['info', 'log', 'action'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs ${
                tab === t
                  ? 'border-b-2 border-zinc-900 dark:border-zinc-100 font-medium'
                  : 'text-zinc-500'
              }`}
            >
              {t === 'info' ? '정보' : t === 'log' ? `접촉 이력 (${comms.length})` : '실행'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-sm">
          {tab === 'info' && (
            <div className="space-y-2">
              <InfoRow label="이름" value={lead.name} />
              <InfoRow label="연락처" value={lead.contact ?? '—'} />
              <InfoRow label="유입채널" value={lead.source ?? '—'} />
              <InfoRow label="긴급도" value={lead.urgency} />
              <InfoRow label="도메인 힌트" value={lead.case_type_hint ?? 'undetermined'} />
              <InfoRow label="최초 접촉" value={lead.first_contact_at?.slice(0, 10) ?? '—'} />
              <InfoRow label="최근 접촉" value={lead.last_contact_at?.slice(0, 10) ?? '—'} />
              {lead.notes && (
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500 mb-1">메모</div>
                  <p className="text-xs whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'log' && <ConsultationLog leadId={lead.id} comms={comms} onLogged={(c) => setComms([c, ...comms])} />}

          {tab === 'action' && (
            <ActionPanel
              lead={lead}
              onStatusChange={changeStatus}
              pending={pending}
            />
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        <div className="px-5 py-2.5 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2 text-xs">
          {STATUS_OPTIONS.filter((s) => s !== lead.status).map((s) => (
            <button
              key={s}
              onClick={() => {
                if (s === 'lost') {
                  const reason = prompt('이탈 사유 (fee_mismatch/competitor/cooled_off/ineligible/no_response/other):', 'cooled_off');
                  if (reason) changeStatus('lost', reason as LeadLostReason);
                } else {
                  changeStatus(s);
                }
              }}
              disabled={pending}
              className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              → {LEAD_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-zinc-500 w-24 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ConsultationLog({
  leadId,
  comms,
  onLogged,
}: {
  leadId: string;
  comms: Communication[];
  onLogged: (c: Communication) => void;
}) {
  const [channel, setChannel] = useState<CommChannel>('call');
  const [direction, setDirection] = useState<CommDirection>('inbound');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    if (!content.trim()) return setErr('내용 필수');
    startTransition(async () => {
      const r = await logCommunication({
        subject_type: 'lead',
        subject_id: leadId,
        channel,
        direction,
        content,
        summary: summary || null,
      });
      if (!r.ok) return setErr(r.error ?? '실패');
      if (r.id) {
        onLogged({
          id: r.id,
          workspace_id: '',
          subject_type: 'lead',
          subject_id: leadId,
          channel,
          direction,
          occurred_at: new Date().toISOString(),
          summary: summary || null,
          content,
          duration_seconds: null,
          attachment_ids: [],
          logged_by: null,
          auto_captured: false,
          sentiment: null,
          created_at: new Date().toISOString(),
        });
      }
      setContent('');
      setSummary('');
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as CommChannel)}
            className="px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          >
            {Object.entries(COMM_CHANNEL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as CommDirection)}
            className="px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
          >
            <option value="inbound">수신</option>
            <option value="outbound">발신</option>
          </select>
        </div>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="한 줄 요약"
          className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="대화 내용"
          rows={3}
          className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          onClick={submit}
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
        >
          {pending ? '기록중...' : '+ 접촉 기록'}
        </button>
      </div>

      <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        {comms.length === 0 ? (
          <p className="text-xs text-zinc-500">이력 없음</p>
        ) : (
          comms.map((c) => (
            <div key={c.id} className="text-xs border-l-2 border-zinc-200 dark:border-zinc-700 pl-3 py-1">
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span>{COMM_CHANNEL_LABEL[c.channel]}</span>
                <span>·</span>
                <span>{c.direction === 'inbound' ? '수신' : '발신'}</span>
                <span>·</span>
                <span>{new Date(c.occurred_at).toLocaleString('ko-KR')}</span>
              </div>
              {c.summary && <div className="font-medium mt-0.5">{c.summary}</div>}
              {c.content && <p className="whitespace-pre-wrap mt-0.5 text-zinc-600 dark:text-zinc-400">{c.content}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type PaymentKind = 'retainer' | 'installment' | 'success_fee' | 'court_fee' | 'misc';
type PlanType = 'lump_sum' | 'installment' | 'conditional';
type PaymentGate = 'hard' | 'soft';
type Mode = 'simple' | 'precise' | 'none';

function ActionPanel({
  lead,
  onStatusChange,
  pending,
}: {
  lead: Lead;
  onStatusChange: (status: LeadStatus, lost_reason?: LeadLostReason) => void;
  pending: boolean;
}) {
  const router = useRouter();
  const [converting, setConverting] = useState(false);
  const [caseTitle, setCaseTitle] = useState(`${lead.name} ${lead.case_type_hint}`);
  const [convPending, startConvert] = useTransition();
  const [convErr, setConvErr] = useState<string | null>(null);

  // 계약 입력
  const [contractMode, setContractMode] = useState<Mode>('simple');
  const [totalAmount, setTotalAmount] = useState('3000000');
  const [planType, setPlanType] = useState<PlanType>('installment');
  const [count, setCount] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [cycleDays, setCycleDays] = useState(30);
  const [retainerRatio, setRetainerRatio] = useState(0.33);
  const [paymentGate, setPaymentGate] = useState<PaymentGate>('hard');

  // 정밀 모드 회차 리스트
  const [installments, setInstallments] = useState<Array<{
    due_date: string;
    amount_krw: string;
    kind: PaymentKind;
  }>>([
    { due_date: new Date().toISOString().slice(0, 10), amount_krw: '1000000', kind: 'retainer' },
    { due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), amount_krw: '1000000', kind: 'installment' },
    { due_date: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10), amount_krw: '1000000', kind: 'installment' },
  ]);

  const addInstallment = () => {
    const last = installments[installments.length - 1];
    const nextDate = last
      ? new Date(new Date(last.due_date).getTime() + 30 * 86400000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    setInstallments([...installments, { due_date: nextDate, amount_krw: '1000000', kind: 'installment' }]);
  };
  const removeInstallment = (i: number) => setInstallments(installments.filter((_, idx) => idx !== i));
  const updateInstallment = (i: number, patch: Partial<(typeof installments)[number]>) =>
    setInstallments(installments.map((inst, idx) => (idx === i ? { ...inst, ...patch } : inst)));

  const preciseTotal = installments.reduce((sum, i) => sum + (Number(i.amount_krw) || 0), 0);

  const runConvert = () => {
    setConvErr(null);
    startConvert(async () => {
      const caseType = (lead.case_type_hint === 'undetermined' ? 'other' : lead.case_type_hint) as
        | 'personal_rehab' | 'divorce' | 'criminal' | 'other';

      // 계약 payload 빌드
      let contract: Parameters<typeof convertLeadToCase>[0]['contract'];
      if (contractMode === 'simple') {
        const n = Number(totalAmount);
        if (!Number.isFinite(n) || n <= 0) return setConvErr('총액 오류');
        contract = {
          total_amount_krw: n,
          plan_type: planType,
          installment_count: planType === 'lump_sum' ? 1 : count,
          first_due_date: firstDueDate,
          cycle_days: cycleDays,
          retainer_ratio: retainerRatio,
          payment_gate: paymentGate,
          gate_blocks_stages: paymentGate === 'hard' ? ['filing', 'opening_decision'] : [],
        };
      } else if (contractMode === 'precise') {
        if (installments.length === 0) return setConvErr('최소 1개 회차 필요');
        const invalid = installments.find((i) => !i.due_date || !(Number(i.amount_krw) > 0));
        if (invalid) return setConvErr('회차 날짜·금액 확인');
        contract = {
          total_amount_krw: preciseTotal,
          plan_type: installments.length === 1 ? 'lump_sum' : 'installment',
          installment_count: installments.length,
          first_due_date: installments[0].due_date,
          payment_gate: paymentGate,
          gate_blocks_stages: paymentGate === 'hard' ? ['filing', 'opening_decision'] : [],
          installments: installments.map((inst, idx) => ({
            installment_no: idx + 1,
            due_date: inst.due_date,
            amount_krw: Number(inst.amount_krw),
            kind: inst.kind,
          })),
        };
      }

      const r = await convertLeadToCase({
        leadId: lead.id,
        caseTitle: caseTitle.trim() || `${lead.name} 사건`,
        caseType,
        contract,
      });
      if (!r.ok) return setConvErr(r.error ?? '전환 실패');
      if (r.caseId) router.push(`/workflow?case=${r.caseId}`);
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold mb-2">빠른 상태 전환</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => onStatusChange('qualified')}
            disabled={pending}
            className="px-3 py-1.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950/20 disabled:opacity-50"
          >
            ✓ 적격 확인
          </button>
          <button
            onClick={() => {
              const reason = prompt('이탈 사유:', 'cooled_off');
              if (reason) onStatusChange('lost', reason as LeadLostReason);
            }}
            disabled={pending}
            className="px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:bg-red-950/20 disabled:opacity-50"
          >
            ✗ 이탈 처리
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <div className="text-xs font-semibold mb-2">수임 확정</div>
        <p className="text-[10px] text-zinc-500 mb-2">
          Case · 고객 자동 생성 + Lead = converted. 수임료 계약을 여기서 바로 찍으면 재무팀에 즉시 노출.
        </p>
        {!converting ? (
          <button
            onClick={() => setConverting(true)}
            disabled={lead.status === 'converted'}
            className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            → 수임 확정
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-0.5">사건명</label>
              <input
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                placeholder="사건명"
                className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              />
            </div>

            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <label className="text-[10px] font-semibold text-zinc-500 block mb-1.5 uppercase tracking-wide">
                💰 수임료 계약
              </label>
              <div className="flex gap-1 mb-2">
                <button type="button" onClick={() => setContractMode('simple')} className={`text-[10px] px-2 py-1 rounded ${contractMode === 'simple' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>간단 (총액·주기)</button>
                <button type="button" onClick={() => setContractMode('precise')} className={`text-[10px] px-2 py-1 rounded ${contractMode === 'precise' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>정밀 (회차별 날짜)</button>
                <button type="button" onClick={() => setContractMode('none')} className={`text-[10px] px-2 py-1 rounded ${contractMode === 'none' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>계약 생략</button>
              </div>

              {contractMode === 'simple' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="총 계약금액 (원)">
                      <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="inp-sm" />
                    </Field>
                    <Field label="방식">
                      <select value={planType} onChange={(e) => setPlanType(e.target.value as PlanType)} className="inp-sm">
                        <option value="lump_sum">일시</option>
                        <option value="installment">분할</option>
                        <option value="conditional">조건부</option>
                      </select>
                    </Field>
                    {planType === 'installment' && (
                      <>
                        <Field label="회차 수">
                          <input type="number" min={2} max={24} value={count} onChange={(e) => setCount(Number(e.target.value))} className="inp-sm" />
                        </Field>
                        <Field label="주기 (일)">
                          <input type="number" value={cycleDays} onChange={(e) => setCycleDays(Number(e.target.value))} className="inp-sm" />
                        </Field>
                        <Field label="착수금 비율 (0~1)">
                          <input type="number" step="0.05" min={0} max={1} value={retainerRatio} onChange={(e) => setRetainerRatio(Number(e.target.value))} className="inp-sm" />
                        </Field>
                      </>
                    )}
                    <Field label="첫 납입일">
                      <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} className="inp-sm" />
                    </Field>
                  </div>
                </div>
              )}

              {contractMode === 'precise' && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-zinc-500">
                    각 회차 날짜·금액·유형 직접 지정. 실무 상담에서 의뢰인에게 말한 스케줄 그대로 입력.
                  </p>
                  {installments.map((inst, i) => (
                    <div key={i} className="flex gap-1 items-center">
                      <span className="text-[10px] text-zinc-500 w-6 shrink-0">{i + 1}회</span>
                      <input type="date" value={inst.due_date} onChange={(e) => updateInstallment(i, { due_date: e.target.value })} className="flex-1 inp-sm" />
                      <input type="number" value={inst.amount_krw} onChange={(e) => updateInstallment(i, { amount_krw: e.target.value })} placeholder="금액" className="flex-1 inp-sm" />
                      <select value={inst.kind} onChange={(e) => updateInstallment(i, { kind: e.target.value as PaymentKind })} className="inp-sm w-20 shrink-0">
                        <option value="retainer">착수</option>
                        <option value="installment">중도</option>
                        <option value="success_fee">성공</option>
                        <option value="court_fee">법원</option>
                        <option value="misc">기타</option>
                      </select>
                      <button type="button" onClick={() => removeInstallment(i)} disabled={installments.length <= 1} className="text-xs text-red-600 disabled:opacity-40 w-4">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={addInstallment} className="text-[10px] px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700">+ 회차 추가</button>
                  <div className="text-[10px] text-zinc-500 text-right">
                    총 {installments.length}회 · 합계 <span className="font-semibold tabular-nums">{preciseTotal.toLocaleString()}원</span>
                  </div>
                </div>
              )}

              {contractMode !== 'none' && (
                <div className="pt-2 mt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <Field label="결제 Gate">
                    <select value={paymentGate} onChange={(e) => setPaymentGate(e.target.value as PaymentGate)} className="inp-sm">
                      <option value="hard">Hard (미납시 신청·개시 Stage 차단)</option>
                      <option value="soft">Soft (경고만)</option>
                    </select>
                  </Field>
                </div>
              )}

              {contractMode === 'none' && (
                <p className="text-[10px] text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-800/30 rounded">
                  계약 없이 Case만 생성. 재무팀이 나중에 Case 상세에서 등록.
                </p>
              )}
            </div>

            {convErr && <p className="text-xs text-red-600">{convErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => setConverting(false)} className="px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-zinc-700">취소</button>
              <button onClick={runConvert} disabled={convPending} className="flex-1 px-4 py-1.5 text-xs rounded bg-emerald-600 text-white disabled:opacity-50">
                {convPending ? '전환중...' : contractMode === 'none' ? '확정 · 사건만 생성' : '확정 · 사건 + 계약 생성'}
              </button>
            </div>

            <style jsx>{`
              :global(.inp-sm) {
                width: 100%;
                padding: 4px 8px;
                font-size: 12px;
                border: 1px solid rgb(212 212 216);
                border-radius: 4px;
                background: transparent;
              }
              :global(.dark .inp-sm) {
                border-color: rgb(63 63 70);
              }
            `}</style>
          </div>
        )}
      </div>
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
