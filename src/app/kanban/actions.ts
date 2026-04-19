'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { canMove } from '@/lib/transitions';
import { extractTicketsFromText, type ExtractionResult } from '@/lib/ai/extract';
import { generateEmailDraft } from '@/lib/ai/draft';
import { sendEmail } from '@/lib/email/resend';
import type { ColumnKey, TicketType, Priority, CaseType } from '@/lib/types';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const { data: board } = await supabase
    .from('kanban_boards')
    .select('id, workspace_id')
    .limit(1)
    .maybeSingle();
  if (!board) throw new Error('NO_BOARD');

  return { supabase, userId: user.id, boardId: board.id, workspaceId: board.workspace_id };
}

async function nextOrder(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  boardId: string,
  columnKey: ColumnKey,
) {
  const { data } = await supabase
    .from('tickets')
    .select('order')
    .eq('board_id', boardId)
    .eq('column_key', columnKey)
    .order('order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.order ?? 0) + 1;
}

// ============ CLIENTS ============
export async function createClientRecord(formData: FormData) {
  const { supabase, workspaceId } = await getContext();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('name required');

  const { data, error } = await supabase
    .from('clients')
    .insert({
      workspace_id: workspaceId,
      name,
      phone: (formData.get('phone') as string) || null,
      email: (formData.get('email') as string) || null,
      memo: (formData.get('memo') as string) || null,
    })
    .select('id, name')
    .single();

  if (error) throw error;
  revalidatePath('/kanban');
  return data;
}

// ============ CASES ============
export async function createCase(formData: FormData) {
  const { supabase, workspaceId } = await getContext();
  const client_id = String(formData.get('client_id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const case_type = (formData.get('case_type') as CaseType | null) || null;
  const case_number = (formData.get('case_number') as string) || null;
  const court = (formData.get('court') as string) || null;
  const opposing_party = (formData.get('opposing_party') as string) || null;
  const retainer_date = (formData.get('retainer_date') as string) || null;
  if (!client_id || !title) throw new Error('고객과 사건명은 필수입니다');

  // 민감 분야는 기본 assigned_only
  const visibility =
    case_type === 'divorce' || case_type === 'criminal'
      ? 'assigned_only'
      : 'workspace';

  // 전체 필드로 시도 → 실패 시 필수 필드만으로 재시도 (스키마 드리프트 내성)
  let data: { id: string; title: string; case_type: string | null } | null = null;
  let firstErr: string | null = null;

  const fullRes = await supabase
    .from('cases')
    .insert({
      workspace_id: workspaceId,
      client_id,
      title,
      case_type,
      case_number,
      court,
      opposing_party,
      retainer_date,
      stage: 'initial',
      visibility,
    })
    .select('id, title, case_type')
    .single();

  if (fullRes.error) {
    firstErr = fullRes.error.message;
    console.error('[createCase] 전체 insert 실패, 최소 필드로 재시도:', firstErr);
    const minimalRes = await supabase
      .from('cases')
      .insert({
        workspace_id: workspaceId,
        client_id,
        title,
        case_type,
        stage: 'initial',
      })
      .select('id, title, case_type')
      .single();
    if (minimalRes.error) {
      throw new Error(
        `사건 생성 실패. Supabase SQL Editor에서 ensure_schema_v2.sql 실행이 필요합니다.\n원본: ${minimalRes.error.message}`,
      );
    }
    data = minimalRes.data;
  } else {
    data = fullRes.data;
  }

  // 워크플로우 자동 초기화 — 실패해도 사건 생성은 유효
  if (case_type && data) {
    try {
      const { getTemplate } = await import('@/lib/ontology/templates');
      const template = getTemplate(case_type);
      if (template) {
        const firstStage = template.stages[0];
        const now = new Date().toISOString();
        const docs: Record<string, { status: string }> = {};
        for (const docKey of template.document_keys) {
          docs[docKey] = { status: 'missing' };
        }
        const wfRes = await supabase
          .from('cases')
          .update({
            workflow_stage: firstStage.key,
            workflow_docs: docs,
            workflow_history: [{ stage: firstStage.key, entered_at: now }],
            workflow_template_version: template.version,
          })
          .eq('id', data.id);
        if (wfRes.error) {
          console.warn(
            '[createCase] workflow 초기화 실패 (스키마 마이그레이션 필요):',
            wfRes.error.message,
          );
        }
      }
    } catch (e) {
      console.warn('[createCase] workflow 초기화 예외:', e);
    }
  }

  revalidatePath('/kanban');
  revalidatePath('/cases');
  revalidatePath('/clients');
  return data;
}

// ============ TICKETS ============
interface CreateTicketInput {
  title: string;
  description?: string | null;
  type: TicketType;
  priority?: Priority;
  due_date?: string | null;
  column_key: ColumnKey;
  client_id?: string | null;
  case_id?: string | null;
}

export async function createTicket(input: CreateTicketInput) {
  const { supabase, workspaceId, boardId, userId } = await getContext();

  // Spec §9.2: Triage는 수동 생성 불가
  if (input.column_key === 'triage') {
    throw new Error('Triage 컬럼엔 수동으로 티켓을 만들 수 없어요');
  }

  const order = await nextOrder(supabase, boardId, input.column_key);

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      workspace_id: workspaceId,
      board_id: boardId,
      column_key: input.column_key,
      order,
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      priority: input.priority ?? 2,
      due_date: input.due_date ?? null,
      client_id: input.client_id ?? null,
      case_id: input.case_id ?? null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) throw error;

  await supabase.from('ticket_activities').insert({
    ticket_id: data.id,
    actor_id: userId,
    action: 'created',
    to_value: { column_key: input.column_key, title: input.title },
  });

  revalidatePath('/kanban');
  return data;
}

interface UpdateTicketInput {
  id: string;
  title?: string;
  description?: string | null;
  priority?: Priority;
  due_date?: string | null;
  waiting_on?: 'client' | 'court' | 'opposing' | null;
}

export async function updateTicket(input: UpdateTicketInput) {
  const { supabase, userId } = await getContext();
  const { id, ...rest } = input;

  const { data: before } = await supabase
    .from('tickets')
    .select('title, description, priority, due_date, waiting_on')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('tickets').update(rest).eq('id', id);
  if (error) throw error;

  await supabase.from('ticket_activities').insert({
    ticket_id: id,
    actor_id: userId,
    action: 'edited',
    from_value: before ?? null,
    to_value: rest,
  });

  revalidatePath('/kanban');
}

export async function moveTicket(
  ticketId: string,
  toColumn: ColumnKey,
  options: { skipRevalidate?: boolean } = {},
) {
  const { supabase, boardId, userId } = await getContext();

  const { data: ticket, error: fetchErr } = await supabase
    .from('tickets')
    .select('column_key')
    .eq('id', ticketId)
    .maybeSingle();
  if (fetchErr || !ticket) throw fetchErr ?? new Error('ticket not found');

  const fromColumn = ticket.column_key as ColumnKey;
  if (!canMove(fromColumn, toColumn)) {
    throw new Error(`${fromColumn} → ${toColumn} 이동은 허용되지 않습니다`);
  }

  const order = await nextOrder(supabase, boardId, toColumn);
  const completed_at = toColumn === 'done' ? new Date().toISOString() : null;

  const { error } = await supabase
    .from('tickets')
    .update({ column_key: toColumn, order, completed_at })
    .eq('id', ticketId);
  if (error) throw error;

  await supabase.from('ticket_activities').insert({
    ticket_id: ticketId,
    actor_id: userId,
    action: 'moved',
    from_value: { column_key: fromColumn },
    to_value: { column_key: toColumn },
  });

  // DnD 낙관 UI에서 호출될 땐 refetch 스킵 (이미 클라에서 반영됨)
  if (!options.skipRevalidate) {
    revalidatePath('/kanban');
  }
}

export async function deleteTicket(ticketId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from('tickets').delete().eq('id', ticketId);
  if (error) throw error;
  revalidatePath('/kanban');
}

export async function approveTicket(ticketId: string) {
  return moveTicket(ticketId, 'todo');
}

export async function rejectTicket(ticketId: string) {
  const { supabase, userId } = await getContext();
  await supabase.from('ticket_activities').insert({
    ticket_id: ticketId,
    actor_id: userId,
    action: 'rejected',
  });
  return deleteTicket(ticketId);
}

// Spec §5.1 Review & Send 발송 승인 → side effect mock + Done 이동
export async function executeTicket(ticketId: string) {
  const { supabase, userId } = await getContext();

  const { data: ticket } = await supabase
    .from('tickets')
    .select('column_key, action_type, draft_payload')
    .eq('id', ticketId)
    .maybeSingle();

  if (!ticket) throw new Error('ticket not found');
  if (ticket.column_key !== 'review') {
    throw new Error('Review & Send 컬럼 티켓만 발송할 수 있어요');
  }

  // V1 mock: console.log. V1.5에서 Gmail/Calendar API 실제 호출
  console.log('[mock side effect]', ticket.action_type, ticket.draft_payload);

  await supabase.from('ticket_activities').insert({
    ticket_id: ticketId,
    actor_id: userId,
    action: 'executed',
    to_value: { action_type: ticket.action_type, mocked: true },
  });

  return moveTicket(ticketId, 'done');
}

// ============ SAMPLE DATA ============
export async function loadSampleData() {
  const { supabase, workspaceId, boardId, userId } = await getContext();

  // 이미 데이터가 있으면 skip
  const { count } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if ((count ?? 0) > 0) {
    revalidatePath('/kanban');
    return;
  }

  const { data: client, error: cErr } = await supabase
    .from('clients')
    .insert({
      workspace_id: workspaceId,
      name: '김민수',
      phone: '010-1234-5678',
      email: 'minsu.kim@example.com',
      memo: '개인회생 신청인. 최근 실직.',
    })
    .select('id')
    .single();
  if (cErr) throw cErr;

  const { data: caseRow, error: caErr } = await supabase
    .from('cases')
    .insert({
      workspace_id: workspaceId,
      client_id: client.id,
      title: '김민수 개인회생 신청',
      case_type: 'personal_rehab',
      stage: 'initial',
    })
    .select('id')
    .single();
  if (caErr) throw caErr;

  const today = new Date();
  const addDays = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };

  type SampleTicket = {
    title: string;
    type: TicketType;
    column_key: ColumnKey;
    priority: Priority;
    due_date?: string | null;
    description?: string;
    ai_suggested?: boolean;
    ai_reasoning?: string;
    ai_confidence?: number;
  };

  const tickets: SampleTicket[] = [
    {
      title: '소득증빙서류 요청',
      type: 'document_request',
      column_key: 'todo',
      priority: 2,
      due_date: addDays(3),
      description: '최근 6개월 급여명세서 + 근로소득원천징수영수증',
    },
    {
      title: '재산목록 작성 안내',
      type: 'promise',
      column_key: 'todo',
      priority: 2,
      due_date: addDays(5),
      description: '이번 주 안에 재산목록 양식 전달드리겠다고 약속',
    },
    {
      title: '신청서 초안 검토',
      type: 'follow_up',
      column_key: 'in_progress',
      priority: 1,
      due_date: addDays(1),
    },
    {
      title: '고객 안내 메일 초안 완료',
      type: 'promise',
      column_key: 'review',
      priority: 2,
      due_date: addDays(2),
      description: '진행상황 안내 이메일 초안. 검토 후 발송.',
    },
    {
      title: '카톡으로 상담 시간 약속 — AI 감지',
      type: 'promise',
      column_key: 'triage',
      priority: 2,
      ai_suggested: true,
      ai_reasoning: '카톡 대화에서 "다음 주 화요일 오후 2시 상담" 언급 감지',
      ai_confidence: 0.85,
    },
  ];

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    await supabase.from('tickets').insert({
      workspace_id: workspaceId,
      board_id: boardId,
      column_key: t.column_key,
      order: i + 1,
      title: t.title,
      description: t.description ?? null,
      type: t.type,
      priority: t.priority,
      due_date: t.due_date ?? null,
      client_id: client.id,
      case_id: caseRow.id,
      created_by: userId,
      ai_suggested: t.ai_suggested ?? false,
      ai_reasoning: t.ai_reasoning ?? null,
      ai_confidence: t.ai_confidence ?? null,
    });
  }

  revalidatePath('/kanban');
}

export async function clearAllData() {
  const { supabase, workspaceId } = await getContext();
  await supabase.from('tickets').delete().eq('workspace_id', workspaceId);
  await supabase.from('cases').delete().eq('workspace_id', workspaceId);
  await supabase.from('clients').delete().eq('workspace_id', workspaceId);
  revalidatePath('/kanban');
}

// ============ AI 추출: 텍스트 → Triage 티켓 ============
interface AnalyzeTextInput {
  text: string;
  clientId?: string | null;
  caseId?: string | null;
  sourceHint?: 'email' | 'kakao' | 'phone' | 'notes' | 'manual';
}

export interface AnalyzeTextResult {
  eventId: string;
  extraction: ExtractionResult;
  createdTicketIds: string[];
}

export async function analyzeText(
  input: AnalyzeTextInput,
): Promise<AnalyzeTextResult> {
  const { supabase, workspaceId, boardId, userId } = await getContext();

  const text = input.text.trim();
  if (!text) throw new Error('텍스트를 입력해주세요');
  if (text.length > 20000) throw new Error('텍스트가 너무 깁니다 (최대 2만자)');

  // 1) 고객명 조회 (선택)
  let clientName: string | null = null;
  if (input.clientId) {
    const { data } = await supabase
      .from('clients')
      .select('name')
      .eq('id', input.clientId)
      .maybeSingle();
    clientName = data?.name ?? null;
  }

  // 2) 원본 이벤트 저장 (스펙 §8.3과 같은 테이블)
  const { data: event, error: evErr } = await supabase
    .from('events')
    .insert({
      workspace_id: workspaceId,
      source_type: input.sourceHint ?? 'manual',
      raw_content: text,
      metadata: { submitted_via: 'paste_modal' },
      client_id: input.clientId ?? null,
      case_id: input.caseId ?? null,
      processed: false,
    })
    .select('id')
    .single();
  if (evErr || !event) throw evErr ?? new Error('event 저장 실패');

  // 3) LLM 추출
  const extraction = await extractTicketsFromText({
    text,
    clientName,
    sourceHint: input.sourceHint,
  });

  // 4) 각 항목을 Triage 티켓으로 삽입
  const createdTicketIds: string[] = [];
  let order = await nextOrder(supabase, boardId, 'triage');
  for (const item of extraction.items) {
    const { data: ticket, error: tErr } = await supabase
      .from('tickets')
      .insert({
        workspace_id: workspaceId,
        board_id: boardId,
        column_key: 'triage',
        order: order++,
        title: item.title,
        description: null,
        type: item.type,
        priority: item.priority,
        due_date: item.due_date,
        waiting_on: item.waiting_on,
        client_id: input.clientId ?? null,
        case_id: input.caseId ?? null,
        source_event_id: event.id,
        ai_suggested: true,
        ai_reasoning: item.reasoning,
        ai_confidence: item.confidence,
        created_by: userId,
      })
      .select('id')
      .single();

    if (tErr) {
      console.error('ticket insert failed', tErr, item);
      continue;
    }
    createdTicketIds.push(ticket.id);

    await supabase.from('ticket_activities').insert({
      ticket_id: ticket.id,
      actor_id: userId,
      action: 'created',
      to_value: {
        column_key: 'triage',
        title: item.title,
        ai_suggested: true,
      },
    });
  }

  // 5) 이벤트 processed 플래그 업데이트
  await supabase
    .from('events')
    .update({ processed: createdTicketIds.length > 0 })
    .eq('id', event.id);

  revalidatePath('/kanban');

  return {
    eventId: event.id,
    extraction,
    createdTicketIds,
  };
}

// ============ AI 초안 생성 + Review & Send로 이동 ============
export async function generateDraftForTicket(ticketId: string) {
  const { supabase, userId } = await getContext();

  // 티켓 + 관계 풀 로드
  const { data: ticket, error } = await supabase
    .from('tickets')
    .select(`
      id, column_key, title, description, type, due_date, source_event_id,
      client:clients(id, name, email),
      case:cases(id, title, case_type)
    `)
    .eq('id', ticketId)
    .maybeSingle();
  if (error || !ticket) throw error ?? new Error('티켓 없음');

  // 변호사(본인) 이름
  const { data: me } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();
  const lawyerName = me?.name ?? (me?.email ? me.email.split('@')[0] : '변호사');

  // 원본 이벤트 (있으면)
  let originalContext: string | null = null;
  if (ticket.source_event_id) {
    const { data: ev } = await supabase
      .from('events')
      .select('raw_content')
      .eq('id', ticket.source_event_id)
      .maybeSingle();
    originalContext = ev?.raw_content ?? null;
  }

  const tRel = ticket as unknown as {
    id: string;
    title: string;
    description: string | null;
    type: 'promise' | 'document_request' | 'follow_up';
    due_date: string | null;
    client: { id: string; name: string; email: string | null } | null;
    case: { id: string; title: string; case_type: string | null } | null;
  };

  if (!tRel.client) {
    throw new Error('이 티켓에 고객이 지정되지 않음. 먼저 고객을 지정하세요.');
  }

  const draft = await generateEmailDraft({
    ticketTitle: tRel.title,
    ticketType: tRel.type,
    ticketDueDate: tRel.due_date,
    ticketDescription: tRel.description,
    clientName: tRel.client.name,
    clientEmail: tRel.client.email,
    caseType: tRel.case?.case_type ?? null,
    caseTitle: tRel.case?.title ?? null,
    lawyerName,
    originalContext,
  });

  // Review & Send로 이동 + draft_payload 저장
  const newOrder = await nextOrder(supabase, (await getContext()).boardId, 'review');
  const { error: updErr } = await supabase
    .from('tickets')
    .update({
      column_key: 'review',
      order: newOrder,
      draft_payload: {
        subject: draft.subject,
        body_text: draft.body_text,
        body_html: draft.body_html,
        to: tRel.client.email ? [tRel.client.email] : [],
        needs_client_review: draft.needs_client_review,
      },
      action_type: 'send_email',
    })
    .eq('id', ticketId);
  if (updErr) throw updErr;

  await supabase.from('ticket_activities').insert({
    ticket_id: ticketId,
    actor_id: userId,
    action: 'edited',
    to_value: { generated_draft: true, subject: draft.subject },
  });

  revalidatePath('/kanban');
  return draft;
}

// ============ draft 수정 (Review & Send에서 편집) ============
export async function updateDraftPayload(
  ticketId: string,
  payload: {
    subject: string;
    body_text: string;
    to: string[];
  },
) {
  const { supabase } = await getContext();
  const { data: ticket } = await supabase
    .from('tickets')
    .select('draft_payload')
    .eq('id', ticketId)
    .maybeSingle();
  const prev = (ticket?.draft_payload ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from('tickets')
    .update({
      draft_payload: { ...prev, ...payload },
    })
    .eq('id', ticketId);
  if (error) throw error;
  revalidatePath('/kanban');
}

// ============ 실제 발송: Review & Send → Done ============
// 기존 executeTicket을 대체 / 확장
export async function sendReviewedEmail(ticketId: string) {
  const { supabase, userId } = await getContext();

  const { data: ticket } = await supabase
    .from('tickets')
    .select('column_key, draft_payload, action_type, client_id, case_id, workspace_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket) throw new Error('티켓 없음');
  if (ticket.column_key !== 'review') throw new Error('Review & Send 컬럼 티켓만 발송 가능');

  const payload = ticket.draft_payload as
    | { subject?: string; body_text?: string; body_html?: string; to?: string[] }
    | null;
  if (!payload?.subject || !payload?.body_text) {
    throw new Error('초안이 없습니다');
  }
  if (!payload.to || payload.to.length === 0) {
    throw new Error('수신자 이메일이 지정되지 않았습니다');
  }

  // 발신자 이메일 (변호사 본인)
  const { data: me } = await supabase
    .from('users')
    .select('email, name')
    .eq('id', userId)
    .maybeSingle();
  const fromName = me?.name ?? '변호사';
  const fromEmailRaw = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const from = `${fromName} <${fromEmailRaw.replace(/^.*<([^>]+)>$/, '$1')}>`;

  const result = await sendEmail({
    to: payload.to,
    subject: payload.subject,
    text: payload.body_text,
    html: payload.body_html,
    from,
    replyTo: me?.email ?? undefined,
  });

  // 이벤트 로그 (email 발송)
  await supabase.from('events').insert({
    workspace_id: ticket.workspace_id,
    source_type: 'email',
    raw_content: `[발송] ${payload.subject}\n\n${payload.body_text}`,
    occurred_at: new Date().toISOString(),
    client_id: ticket.client_id,
    case_id: ticket.case_id,
    processed: true,
    metadata: {
      direction: 'outbound',
      to: payload.to,
      mocked: result.mocked,
      resend_id: result.id,
      error: result.error,
    },
  });

  await supabase.from('ticket_activities').insert({
    ticket_id: ticketId,
    actor_id: userId,
    action: 'sent',
    to_value: { mocked: result.mocked, resend_id: result.id, error: result.error },
  });

  // Done으로 이동
  if (!result.error) {
    await moveTicket(ticketId, 'done');
  }

  return result;
}

// 티켓의 원본 이벤트 조회 (상세 패널에서 사용)
export async function getSourceEvent(eventId: string) {
  const { supabase } = await getContext();
  const { data } = await supabase
    .from('events')
    .select('id, source_type, raw_content, created_at')
    .eq('id', eventId)
    .maybeSingle();
  return data;
}
