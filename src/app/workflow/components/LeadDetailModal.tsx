'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadStatus, LeadLostReason, CommChannel, CommDirection } from '@/lib/ontology/core/objects';
import { LEAD_STATUS_LABEL, COMM_CHANNEL_LABEL } from '@/lib/ontology/core/objects';
import { updateLeadStatus, convertLeadToCase } from '@/app/actions/leads';
import { logCommunication, listCommunications } from '@/app/actions/communications';
import type { Communication } from '@/lib/ontology/core/objects';

// 하단 퀵 전환에선 'converted' 제외 — 수임 확정은 [실행] 탭에서 Case·계약까지 생성해야 함
const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'qualified', 'lost', 'cold'];

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
type PaymentGate = 'hard' | 'soft';
type Mode = 'precise' | 'none';

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
  const [contractMode, setContractMode] = useState<Mode>('precise');
  const [paymentGate, setPaymentGate] = useState<PaymentGate>('hard');

  // 계약서 섹션별 입력
  type Row = { due_date: string; amount_krw: string; note?: string };
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const [retainers, setRetainers] = useState<Row[]>([
    { due_date: today, amount_krw: '1000000' },
  ]);
  const [mids, setMids] = useState<Row[]>([
    { due_date: addDays(30), amount_krw: '1000000' },
    { due_date: addDays(60), amount_krw: '1000000' },
  ]);
  const [successes, setSuccesses] = useState<Row[]>([]);

  const makeHandlers = (
    rows: Row[],
    setRows: React.Dispatch<React.SetStateAction<Row[]>>,
    defaultOffsetDays: number,
  ) => ({
    add: () => {
      const last = rows[rows.length - 1];
      const next = last ? addDays(30) : addDays(defaultOffsetDays);
      setRows([...rows, { due_date: next, amount_krw: '1000000' }]);
    },
    remove: (i: number) => setRows(rows.filter((_, idx) => idx !== i)),
    update: (i: number, patch: Partial<Row>) =>
      setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))),
  });

  const retainerH = makeHandlers(retainers, setRetainers, 0);
  const midH = makeHandlers(mids, setMids, 30);
  const successH = makeHandlers(successes, setSuccesses, 365);

  const sumRows = (rows: Row[]) => rows.reduce((s, r) => s + (Number(r.amount_krw) || 0), 0);
  const retainerSum = sumRows(retainers);
  const midSum = sumRows(mids);
  const successSum = sumRows(successes);
  const preciseTotal = retainerSum + midSum + successSum;

  const runConvert = () => {
    setConvErr(null);
    startConvert(async () => {
      const caseType = (lead.case_type_hint === 'undetermined' ? 'other' : lead.case_type_hint) as
        | 'personal_rehab' | 'divorce' | 'criminal' | 'other';

      // 계약 payload 빌드 — 3섹션을 flat installments로 합침
      let contract: Parameters<typeof convertLeadToCase>[0]['contract'];
      if (contractMode === 'precise') {
        type RowK = { due_date: string; amount_krw: string; kind: PaymentKind };
        const flat: RowK[] = [
          ...retainers.map((r) => ({ ...r, kind: 'retainer' as PaymentKind })),
          ...mids.map((r) => ({ ...r, kind: 'installment' as PaymentKind })),
          ...successes.map((r) => ({ ...r, kind: 'success_fee' as PaymentKind })),
        ];
        if (flat.length === 0) return setConvErr('최소 1개 회차 필요');
        const invalid = flat.find((i) => !i.due_date || !(Number(i.amount_krw) > 0));
        if (invalid) return setConvErr('회차 날짜·금액 확인');
        // 날짜 순 정렬
        flat.sort((a, b) => a.due_date.localeCompare(b.due_date));
        contract = {
          total_amount_krw: preciseTotal,
          plan_type: flat.length === 1 ? 'lump_sum' : 'installment',
          installment_count: flat.length,
          first_due_date: flat[0].due_date,
          payment_gate: paymentGate,
          gate_blocks_stages: paymentGate === 'hard' ? ['filing', 'opening_decision'] : [],
          installments: flat.map((inst, idx) => ({
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
          <div className="space-y-1">
            <button
              onClick={() => setConverting(true)}
              disabled={lead.status === 'converted' && !!lead.case_id}
              className="text-xs px-3 py-1.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              → 수임 확정
            </button>
            {lead.status === 'converted' && lead.case_id && (
              <p className="text-[10px] text-zinc-500">
                이미 수임 확정됨. Case 상세에서 계약 추가·수정 가능.
              </p>
            )}
            {lead.status === 'converted' && !lead.case_id && (
              <p className="text-[10px] text-amber-600">
                ⚠ 상태는 converted인데 Case 연결 안 됨 — 재시도로 생성 가능
              </p>
            )}
          </div>
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
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                  💰 수임료 계약 (회차별)
                </label>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setContractMode('precise')} className={`text-[10px] px-2 py-1 rounded ${contractMode === 'precise' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>
                    회차별 입력
                  </button>
                  <button type="button" onClick={() => setContractMode('none')} className={`text-[10px] px-2 py-1 rounded ${contractMode === 'none' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'border border-zinc-300 dark:border-zinc-700'}`}>
                    계약 생략
                  </button>
                </div>
              </div>

              {contractMode === 'precise' && (
                <div className="space-y-4">
                  <p className="text-[10px] text-zinc-500">
                    계약서 형식에 맞춰 <strong>계약금 · 분납 · 성공보수</strong>를 나눠서 입력.
                    비어있는 섹션은 계약서에도 포함 안 됨.
                  </p>

                  <ContractSection
                    title="계약금 (착수금)"
                    hint="수임 즉시 받는 금액. 보통 1회."
                    tone="emerald"
                    rows={retainers}
                    onAdd={retainerH.add}
                    onRemove={retainerH.remove}
                    onUpdate={retainerH.update}
                    sum={retainerSum}
                    minRequired={0}
                  />

                  <ContractSection
                    title="분납 (중도금)"
                    hint="정기적으로 분납. 각 회차 마감일 명시."
                    tone="blue"
                    rows={mids}
                    onAdd={midH.add}
                    onRemove={midH.remove}
                    onUpdate={midH.update}
                    sum={midSum}
                    minRequired={0}
                  />

                  <ContractSection
                    title="성공보수"
                    hint="면책·승소 등 조건부. 예상 지급일 입력 (추후 조정 가능)."
                    tone="amber"
                    rows={successes}
                    onAdd={successH.add}
                    onRemove={successH.remove}
                    onUpdate={successH.update}
                    sum={successSum}
                    minRequired={0}
                  />

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500">
                      계약금 <span className="tabular-nums font-medium">{retainerSum.toLocaleString()}</span> +
                      분납 <span className="tabular-nums font-medium">{midSum.toLocaleString()}</span> +
                      성공보수 <span className="tabular-nums font-medium">{successSum.toLocaleString()}</span>
                    </div>
                    <div className="text-sm">
                      총 <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                        {preciseTotal.toLocaleString()}원
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Field label="결제 Gate (계약서에는 포함 안 됨, 내부 관리용)">
                      <select
                        value={paymentGate}
                        onChange={(e) => setPaymentGate(e.target.value as PaymentGate)}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
                      >
                        <option value="hard">Hard (미납시 신청·개시 Stage 차단)</option>
                        <option value="soft">Soft (경고만)</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}

              {contractMode === 'none' && (
                <p className="text-xs text-zinc-500 italic p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded">
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

function ContractSection({
  title,
  hint,
  tone,
  rows,
  onAdd,
  onRemove,
  onUpdate,
  sum,
}: {
  title: string;
  hint: string;
  tone: 'emerald' | 'blue' | 'amber';
  rows: Array<{ due_date: string; amount_krw: string }>;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, patch: Partial<{ due_date: string; amount_krw: string }>) => void;
  sum: number;
  minRequired: number;
}) {
  const headerColor = {
    emerald: 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20',
    blue: 'text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20',
    amber: 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20',
  }[tone];

  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
      <div className={`px-3 py-2 text-xs font-semibold border-b ${headerColor}`}>
        <div className="flex items-center justify-between">
          <span>{title} ({rows.length}회)</span>
          <span className="tabular-nums">{sum.toLocaleString()}원</span>
        </div>
        <p className="text-[10px] opacity-80 font-normal mt-0.5">{hint}</p>
      </div>
      <div className="p-3 space-y-2">
        {rows.length === 0 ? (
          <p className="text-[10px] text-zinc-500 italic text-center py-2">항목 없음 — 계약서에서 제외</p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs font-medium w-8 shrink-0 text-center text-zinc-500">#{i + 1}</span>
              <input
                type="date"
                value={row.due_date}
                onChange={(e) => onUpdate(i, { due_date: e.target.value })}
                className="w-36 shrink-0 px-2 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent"
              />
              <input
                type="number"
                value={row.amount_krw}
                onChange={(e) => onUpdate(i, { amount_krw: e.target.value })}
                placeholder="0"
                className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent tabular-nums text-right"
              />
              <span className="text-xs text-zinc-500 shrink-0 w-6">원</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-xs px-2 py-1.5 rounded border border-red-300 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                ✕ 삭제
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={onAdd}
          className="text-xs px-3 py-1.5 rounded border border-dashed border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 w-full"
        >
          + 항목 추가
        </button>
      </div>
    </div>
  );
}
