'use client';

import { useState, useTransition } from 'react';
import { format, parseISO } from 'date-fns';
import {
  TICKET_TYPE_LABEL,
  TICKET_TYPE_ICON,
  CASE_TYPE_LABEL,
  type TicketWithRelations,
  type ColumnKey,
  type Priority,
} from '@/lib/types';
import { allowedTargets } from '@/lib/transitions';
import {
  updateTicket,
  moveTicket,
  deleteTicket,
  getSourceEvent,
  generateDraftForTicket,
  updateDraftPayload,
  sendReviewedEmail,
} from '../actions';
import { AssigneeSelect, type TeamOption } from '@/components/AssigneeSelect';
import { AIBadge } from '@/components/AIBadge';

const COLUMN_LABEL: Record<ColumnKey, string> = {
  triage: 'Triage',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review & Send',
  done: 'Done',
};

interface SourceEvent {
  id: string;
  source_type: string;
  raw_content: string | null;
  created_at: string;
}

interface DraftPayload {
  subject?: string;
  body_text?: string;
  body_html?: string;
  to?: string[];
  needs_client_review?: boolean;
}

export function TicketDetailPanel({
  ticket,
  onClose,
  teamMembers = [],
}: {
  ticket: TicketWithRelations | null;
  onClose: () => void;
  teamMembers?: TeamOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceEvent, setSourceEvent] = useState<SourceEvent | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [draftEditing, setDraftEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ mocked: boolean; id: string | null; error: string | null } | null>(null);

  if (!ticket) return null;

  const targets = allowedTargets(ticket.column_key);

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateTicket({
        id: ticket.id,
        title: String(fd.get('title') ?? ticket.title),
        description: (fd.get('description') as string) || null,
        priority: Number(fd.get('priority') ?? ticket.priority) as Priority,
        due_date: (fd.get('due_date') as string) || null,
        waiting_on:
          (fd.get('waiting_on') as 'client' | 'court' | 'opposing' | '') || null || null,
      });
      setEditing(false);
    });
  };

  const onMove = (target: ColumnKey) => {
    startTransition(async () => {
      await moveTicket(ticket.id, target);
      onClose();
    });
  };

  const onDelete = () => {
    if (!confirm('이 티켓을 삭제할까요?')) return;
    startTransition(async () => {
      await deleteTicket(ticket.id);
      onClose();
    });
  };

  const onGenerateDraft = () => {
    setActionError(null);
    startTransition(async () => {
      try {
        await generateDraftForTicket(ticket.id);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : '초안 생성 실패');
      }
    });
  };

  const onSendEmail = () => {
    if (!confirm('지금 발송할까요?')) return;
    setActionError(null);
    startTransition(async () => {
      try {
        const r = await sendReviewedEmail(ticket.id);
        setSendResult(r);
        if (!r.error) {
          setTimeout(() => onClose(), 1500);
        }
      } catch (e) {
        setActionError(e instanceof Error ? e.message : '발송 실패');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/20 flex justify-end z-30"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-900 h-full overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-zinc-500">{COLUMN_LABEL[ticket.column_key]}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {!editing ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl font-semibold leading-snug">{ticket.title}</h2>
                <span className="text-2xl shrink-0">{TICKET_TYPE_ICON[ticket.type]}</span>
              </div>

              <div className="space-y-1.5 text-sm">
                <Row label="타입">{TICKET_TYPE_LABEL[ticket.type]}</Row>
                <Row label="우선순위">P{ticket.priority}</Row>
                {ticket.due_date && (
                  <Row label="마감일">{format(parseISO(ticket.due_date), 'yyyy-MM-dd')}</Row>
                )}
                {ticket.client && <Row label="고객">{ticket.client.name}</Row>}
                {ticket.case && (
                  <Row label="사건">
                    {ticket.case.title}{' '}
                    {ticket.case.case_type && (
                      <span className="text-xs text-zinc-500 ml-1">
                        ({CASE_TYPE_LABEL[ticket.case.case_type]})
                      </span>
                    )}
                  </Row>
                )}
                {ticket.waiting_on && (
                  <Row label="대기 중">
                    {ticket.waiting_on === 'client'
                      ? '고객 회신'
                      : ticket.waiting_on === 'court'
                        ? '법원 응답'
                        : '상대방'}
                  </Row>
                )}
                {teamMembers.length > 0 && (
                  <Row label="담당자">
                    <AssigneeSelect
                      value={ticket.assigned_to}
                      kind="ticket"
                      entityId={ticket.id}
                      members={teamMembers}
                    />
                  </Row>
                )}
              </div>

              {ticket.description && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">설명</div>
                  <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
                </div>
              )}

              {ticket.ai_suggested && (
                <AIBadge
                  confidence={ticket.ai_confidence as number | null | undefined}
                  reasoning={ticket.ai_reasoning as string | null | undefined}
                />
              )}

              {ticket.source_event_id && (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-md">
                  <button
                    onClick={() => {
                      if (!sourceOpen && !sourceEvent && ticket.source_event_id) {
                        setSourceLoading(true);
                        getSourceEvent(ticket.source_event_id).then((ev) => {
                          setSourceEvent(ev);
                          setSourceLoading(false);
                        });
                      }
                      setSourceOpen(!sourceOpen);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span>📄 원본 보기</span>
                    <span className="text-zinc-500">{sourceOpen ? '접기' : '펼치기'}</span>
                  </button>
                  {sourceOpen && (
                    <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                      {sourceLoading && <p className="text-xs text-zinc-500">불러오는 중...</p>}
                      {sourceEvent && (
                        <>
                          <div className="text-xs text-zinc-500 mb-2">
                            {sourceEvent.source_type} · {format(parseISO(sourceEvent.created_at), 'yyyy-MM-dd HH:mm')}
                          </div>
                          <pre className="text-xs whitespace-pre-wrap font-sans text-zinc-700 dark:text-zinc-300 max-h-64 overflow-y-auto">
                            {sourceEvent.raw_content}
                          </pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* In Progress: AI 초안 생성 */}
              {ticket.column_key === 'in_progress' && (
                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="text-xs text-zinc-500 mb-2">📮 이메일 자동화</div>
                  <button
                    onClick={onGenerateDraft}
                    disabled={pending}
                    className="w-full px-3 py-2 text-sm rounded-md bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
                  >
                    {pending ? '초안 생성 중...' : '✨ AI로 초안 작성 → Review & Send'}
                  </button>
                  {!ticket.client_id && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠ 고객이 지정돼야 초안 생성 가능
                    </p>
                  )}
                </div>
              )}

              {/* Review & Send: 초안 편집 + 발송 */}
              {ticket.column_key === 'review' && (
                <DraftReviewSection
                  ticketId={ticket.id}
                  draftPayload={ticket.draft_payload as DraftPayload | null}
                  clientEmail={ticket.client?.id ? undefined : undefined}
                  draftEditing={draftEditing}
                  onEditToggle={() => setDraftEditing((v) => !v)}
                  onSend={onSendEmail}
                  pending={pending}
                  sendResult={sendResult}
                />
              )}

              <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 mb-2">상태 이동</div>
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <button
                      key={t}
                      onClick={() => onMove(t)}
                      disabled={pending}
                      className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      → {COLUMN_LABEL[t]}
                    </button>
                  ))}
                  {targets.length === 0 && (
                    <span className="text-sm text-zinc-500">이동 불가 (종료 상태)</span>
                  )}
                </div>
                {actionError && (
                  <p className="text-sm text-red-600 mt-2">{actionError}</p>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
                >
                  편집
                </button>
                <button
                  onClick={onDelete}
                  disabled={pending}
                  className="px-3 py-2 text-sm rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={onSave} className="space-y-3">
              <input
                name="title"
                defaultValue={ticket.title}
                required
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              />
              <select
                name="priority"
                defaultValue={String(ticket.priority)}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              >
                <option value="1">P1 긴급</option>
                <option value="2">P2 높음</option>
                <option value="3">P3 보통</option>
                <option value="4">P4 낮음</option>
              </select>
              <input
                type="date"
                name="due_date"
                defaultValue={ticket.due_date ?? ''}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              />
              <select
                name="waiting_on"
                defaultValue={ticket.waiting_on ?? ''}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
              >
                <option value="">대기 없음</option>
                <option value="client">고객 회신 대기</option>
                <option value="court">법원 응답 대기</option>
                <option value="opposing">상대방 대기</option>
              </select>
              <textarea
                name="description"
                defaultValue={ticket.description ?? ''}
                rows={4}
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-md text-sm border border-zinc-300 dark:border-zinc-700"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-4 py-2 rounded-md text-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-zinc-500 w-20 shrink-0">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function DraftReviewSection({
  ticketId,
  draftPayload,
  draftEditing,
  onEditToggle,
  onSend,
  pending,
  sendResult,
}: {
  ticketId: string;
  draftPayload: DraftPayload | null;
  clientEmail?: string;
  draftEditing: boolean;
  onEditToggle: () => void;
  onSend: () => void;
  pending: boolean;
  sendResult: { mocked: boolean; id: string | null; error: string | null } | null;
}) {
  const [pendingSave, startSave] = useTransition();
  const [subject, setSubject] = useState(draftPayload?.subject ?? '');
  const [body, setBody] = useState(draftPayload?.body_text ?? '');
  const [toStr, setToStr] = useState((draftPayload?.to ?? []).join(', '));
  const [saveError, setSaveError] = useState<string | null>(null);

  const needsReview = draftPayload?.needs_client_review;
  const toAddresses = toStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const canSend = toAddresses.length > 0 && subject.trim() && body.trim();

  const onSaveDraft = () => {
    setSaveError(null);
    startSave(async () => {
      try {
        await updateDraftPayload(ticketId, {
          subject,
          body_text: body,
          to: toAddresses,
        });
        onEditToggle();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : '저장 실패');
      }
    });
  };

  if (!draftPayload?.subject) {
    return (
      <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">초안이 없습니다. "AI로 초안 작성"을 먼저 실행하세요.</p>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">📮 이메일 초안</div>
        {!draftEditing && (
          <button
            onClick={onEditToggle}
            className="text-xs underline text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            편집
          </button>
        )}
      </div>

      {needsReview && !draftEditing && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded text-xs text-amber-800 dark:text-amber-300">
          ⚠ AI가 "신중 검토 필요"로 표시함. 내용 확인 후 발송하세요.
        </div>
      )}

      {!draftEditing ? (
        <>
          <div>
            <div className="text-xs text-zinc-500">받는 사람</div>
            <div className="text-sm">
              {(draftPayload.to ?? []).join(', ') || (
                <span className="text-red-600">수신자 없음 (편집 필요)</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">제목</div>
            <div className="text-sm font-medium">{draftPayload.subject}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">본문</div>
            <pre className="text-sm whitespace-pre-wrap font-sans bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded max-h-64 overflow-y-auto">
              {draftPayload.body_text}
            </pre>
          </div>
          <button
            onClick={onSend}
            disabled={pending || !(draftPayload.to ?? []).length}
            className="w-full px-3 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {pending ? '발송 중...' : '📤 발송 & Done'}
          </button>
          {sendResult && (
            <div
              className={`text-xs p-2 rounded ${
                sendResult.error
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  : sendResult.mocked
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
              }`}
            >
              {sendResult.error
                ? `발송 실패: ${sendResult.error}`
                : sendResult.mocked
                  ? 'Mock 모드 발송 (RESEND_API_KEY 미설정). 이력은 기록됨.'
                  : `실발송 성공 (${sendResult.id})`}
            </div>
          )}
        </>
      ) : (
        <>
          <input
            value={toStr}
            onChange={(e) => setToStr(e.target.value)}
            placeholder="수신자 (쉼표로 구분)"
            className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="제목"
            className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
          />
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={onEditToggle}
              disabled={pendingSave}
              className="px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700"
            >
              취소
            </button>
            <button
              onClick={onSaveDraft}
              disabled={pendingSave || !canSend}
              className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pendingSave ? '저장 중...' : '저장'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
