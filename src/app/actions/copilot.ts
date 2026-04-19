'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { extractTicketsFromText, type ExtractedItem } from '@/lib/ai/extract';
import type { TicketType, Priority, CaseType } from '@/lib/types';

// ============ 고객 컨텍스트 (녹음 중 패널 + LLM 프롬프트) ============

export interface ClientContext {
  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    memo: string | null;
  };
  activeCases: Array<{
    id: string;
    title: string;
    case_type: CaseType | null;
    case_number: string | null;
    court: string | null;
    opposing_party: string | null;
    retainer_date: string | null;
    status: string;
  }>;
  activeTickets: Array<{
    id: string;
    title: string;
    type: TicketType;
    priority: Priority;
    due_date: string | null;
    waiting_on: 'client' | 'court' | 'opposing' | null;
    column_key: string;
    case_id: string | null;
  }>;
  recentEvents: Array<{
    id: string;
    summary: string;
    date: string;
    source_type: string;
  }>;
}

export async function getClientContext(clientId: string): Promise<ClientContext | null> {
  const supabase = await createSupabaseClient();

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, phone, email, memo')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return null;

  const [casesRes, ticketsRes, eventsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id, title, case_type, case_number, court, opposing_party, retainer_date, status')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('tickets')
      .select('id, title, type, priority, due_date, waiting_on, column_key, case_id')
      .eq('client_id', clientId)
      .neq('column_key', 'done')
      .order('priority', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('events')
      .select('id, raw_content, occurred_at, created_at, source_type')
      .eq('client_id', clientId)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  return {
    client: client as ClientContext['client'],
    activeCases: (casesRes.data ?? []) as ClientContext['activeCases'],
    activeTickets: (ticketsRes.data ?? []) as ClientContext['activeTickets'],
    recentEvents: ((eventsRes.data ?? []) as Array<{
      id: string;
      raw_content: string | null;
      occurred_at: string | null;
      created_at: string;
      source_type: string;
    }>).map((ev) => ({
      id: ev.id,
      summary: (ev.raw_content ?? '').slice(0, 140),
      date: ev.occurred_at ?? ev.created_at,
      source_type: ev.source_type,
    })),
  };
}

// ============ 빠른 고객 생성 (코파일럿 setup용) ============
export async function createClientQuick(input: {
  name: string;
  phone?: string | null;
  caseType?: CaseType | null;
  caseTitle?: string | null;
}): Promise<{ clientId: string; caseId: string | null }> {
  const { supabase, workspaceId } = await getContext();
  const name = input.name.trim();
  if (!name) throw new Error('이름 필수');

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      workspace_id: workspaceId,
      name,
      phone: input.phone?.trim() || null,
    })
    .select('id')
    .single();
  if (error) throw error;

  let caseId: string | null = null;
  if (input.caseType) {
    const title = input.caseTitle?.trim() || `${name} ${input.caseType === 'personal_rehab' ? '개인회생' : input.caseType === 'divorce' ? '이혼' : input.caseType === 'criminal' ? '형사' : '기타'}`;
    // 민감 사건은 기본 assigned_only
    const visibility =
      input.caseType === 'divorce' || input.caseType === 'criminal'
        ? 'assigned_only'
        : 'workspace';
    const { data: caseRow } = await supabase
      .from('cases')
      .insert({
        workspace_id: workspaceId,
        client_id: client.id,
        title,
        case_type: input.caseType,
        stage: 'initial',
        status: 'active',
        visibility,
      })
      .select('id')
      .single();
    caseId = caseRow?.id ?? null;
  }

  revalidatePath('/kanban');
  revalidatePath('/clients');
  revalidatePath('/cases');

  return { clientId: client.id, caseId };
}

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

// Step 1: 전사본 저장 + LLM 추출 (티켓은 아직 안 만듦)
// 절대 throw 하지 않음. 실패 이유가 있으면 결과에 담아 반환.
export interface CopilotDraft {
  ok: boolean;
  eventId: string | null;
  transcript: string;
  items: ExtractedItem[];
  summary: string | null;
  error: string | null;
  stage: 'ok' | 'auth' | 'event_insert' | 'llm' | 'unknown';
}

export async function analyzeTranscriptDraft(input: {
  transcript: string;
  clientId?: string | null;
  caseId?: string | null;
  sourceHint?: 'phone' | 'kakao' | 'email' | 'notes' | 'copilot' | 'manual';
  customInstructions?: string | null;
  presetLabel?: string | null;
  sessionNotes?: string | null;
  caseTypeHint?: CaseType | null;
}): Promise<CopilotDraft> {
  const transcript = input.transcript.trim();
  if (!transcript) {
    return {
      ok: false,
      eventId: null,
      transcript: '',
      items: [],
      summary: null,
      error: '전사 내용이 비어있습니다',
      stage: 'unknown',
    };
  }

  let supabase;
  let workspaceId: string;
  try {
    const ctx = await getContext();
    supabase = ctx.supabase;
    workspaceId = ctx.workspaceId;
  } catch (e) {
    return {
      ok: false,
      eventId: null,
      transcript,
      items: [],
      summary: null,
      error: e instanceof Error ? e.message : '인증/워크스페이스 조회 실패',
      stage: 'auth',
    };
  }

  // 고객 컨텍스트 로드 (실패해도 계속 진행)
  let clientName: string | null = null;
  let contextBlock: string | null = null;
  if (input.clientId) {
    try {
      const ctx = await getClientContext(input.clientId);
      if (ctx) {
        clientName = ctx.client.name;
        contextBlock = formatContextForPrompt(ctx);
      }
    } catch (e) {
      console.error('[copilot] getClientContext failed', e);
    }
  }

  // 원본 이벤트 저장
  const { data: event, error: evErr } = await supabase
    .from('events')
    .insert({
      workspace_id: workspaceId,
      source_type: input.sourceHint ?? 'copilot',
      raw_content: transcript,
      metadata: {
        submitted_via: 'copilot',
        preset: input.presetLabel ?? null,
        custom_instructions: input.customInstructions ?? null,
        session_notes: input.sessionNotes ?? null,
        case_type_hint: input.caseTypeHint ?? null,
      },
      occurred_at: new Date().toISOString(),
      client_id: input.clientId ?? null,
      case_id: input.caseId ?? null,
      processed: false,
    })
    .select('id')
    .single();

  if (evErr || !event) {
    console.error('[copilot] event insert failed', evErr);
    return {
      ok: false,
      eventId: null,
      transcript,
      items: [],
      summary: null,
      error: evErr?.message ?? '이벤트 저장 실패',
      stage: 'event_insert',
    };
  }

  // LLM 추출 — 실패해도 event는 살아있으니 수동 편집 가능
  const caseTypeBlock = input.caseTypeHint
    ? `## 이 상담의 분야\n${
        input.caseTypeHint === 'personal_rehab'
          ? '개인회생 (채무/변제계획/채권자목록/재산관계 중심)'
          : input.caseTypeHint === 'divorce'
            ? '이혼 (재산분할/위자료/양육/친권/면접교섭 중심)'
            : input.caseTypeHint === 'criminal'
              ? '형사 (고소/고발/수사/공소/변론 중심)'
              : '기타 일반 민사/행정 사건'
      }\n`
    : null;

  const notesBlock = input.sessionNotes?.trim()
    ? `## 변호사 실시간 메모 (상담 중 적은 노트)\n${input.sessionNotes.trim()}\n`
    : null;

  const mergedInstructions = [
    input.customInstructions?.trim(),
    caseTypeBlock,
    notesBlock,
    contextBlock,
  ]
    .filter(Boolean)
    .join('\n\n') || null;

  try {
    const extraction = await extractTicketsFromText({
      text: transcript,
      clientName,
      sourceHint: input.sourceHint ?? 'copilot',
      customInstructions: mergedInstructions,
    });

    return {
      ok: true,
      eventId: event.id,
      transcript,
      items: extraction.items,
      summary: extraction.summary,
      error: null,
      stage: 'ok',
    };
  } catch (e) {
    console.error('[copilot] LLM extract failed', e);
    return {
      ok: false,
      eventId: event.id,
      transcript,
      items: [],
      summary: null,
      error: `AI 분석 실패: ${e instanceof Error ? e.message : String(e)}`,
      stage: 'llm',
    };
  }
}

function formatContextForPrompt(ctx: ClientContext): string {
  const lines: string[] = [];
  lines.push(`## 이 고객의 현재 상황 (참고용 — 이미 아는 내용이므로 중복 추출 금지)`);
  lines.push('');

  if (ctx.activeCases.length > 0) {
    lines.push('### 진행 중 사건');
    for (const c of ctx.activeCases) {
      const parts = [c.title];
      if (c.case_type) {
        parts.push(
          c.case_type === 'personal_rehab'
            ? '(개인회생)'
            : c.case_type === 'divorce'
              ? '(이혼)'
              : c.case_type === 'criminal'
                ? '(형사)'
                : '(기타)',
        );
      }
      if (c.case_number) parts.push(`#${c.case_number}`);
      if (c.court) parts.push(`/ ${c.court}`);
      if (c.opposing_party) parts.push(`vs ${c.opposing_party}`);
      lines.push(`- ${parts.join(' ')}`);
    }
    lines.push('');
  }

  if (ctx.activeTickets.length > 0) {
    lines.push('### 현재 활성 할일 (이미 등록된 것 — 대화에서 "완료됨" 확인되면 별도 티켓 만들지 말고 무시)');
    for (const t of ctx.activeTickets.slice(0, 15)) {
      const parts = [`[${t.column_key}]`, t.title];
      if (t.due_date) parts.push(`(마감 ${t.due_date})`);
      if (t.waiting_on) {
        parts.push(`(대기: ${t.waiting_on === 'client' ? '고객' : t.waiting_on === 'court' ? '법원' : '상대'})`);
      }
      lines.push(`- ${parts.join(' ')}`);
    }
    lines.push('');
  }

  if (ctx.recentEvents.length > 0) {
    lines.push('### 최근 이력');
    for (const ev of ctx.recentEvents.slice(0, 5)) {
      const date = ev.date.slice(0, 10);
      lines.push(`- ${date}: ${ev.summary}`);
    }
    lines.push('');
  }

  lines.push('## 추출 원칙');
  lines.push('- 위 **현재 상황**에 이미 있는 할일은 다시 만들지 마세요 (중복 방지).');
  lines.push('- 대화에서 "기존 약속 이행 확인", "새 약속", "추가 서류 필요" 같은 **변화**만 추출.');
  lines.push('- 기존 티켓의 상태 변화(완료/대기 해제 등)는 추출하지 말고 summary에 한 줄로만 언급.');

  return lines.join('\n');
}

// Step 2: 편집된 항목으로 티켓 생성 + 옵션으로 milestone 저장
export interface CopilotItem {
  enabled: boolean;
  title: string;
  type: TicketType;
  priority: Priority;
  due_date: string | null;
  waiting_on: 'client' | 'court' | 'opposing' | null;
  description: string | null;
  ai_confidence?: number | null;   // LLM이 반환한 확신도 0..1
  ai_reasoning?: string | null;    // LLM 근거 문장
}

export async function commitCopilotResult(input: {
  eventId: string;
  clientId?: string | null;
  caseId?: string | null;
  items: CopilotItem[];
  saveAsMilestone: boolean;
  milestoneSummary?: string | null; // milestone용 요약
}): Promise<{ ok: boolean; ticketIds: string[]; milestoneCreated: boolean; error?: string }> {
  let supabase, workspaceId: string, boardId: string, userId: string;
  try {
    const ctx = await getContext();
    supabase = ctx.supabase;
    workspaceId = ctx.workspaceId;
    boardId = ctx.boardId;
    userId = ctx.userId;
  } catch (e) {
    return {
      ok: false,
      ticketIds: [],
      milestoneCreated: false,
      error: e instanceof Error ? e.message : '인증 실패',
    };
  }

  // order 시작점 — Triage 맨 뒤에 추가
  const { data: lastOrder } = await supabase
    .from('tickets')
    .select('order')
    .eq('board_id', boardId)
    .eq('column_key', 'triage')
    .order('order', { ascending: false })
    .limit(1)
    .maybeSingle();
  let order = (lastOrder?.order ?? 0) + 1;

  const ticketIds: string[] = [];

  for (const it of input.items) {
    if (!it.enabled) continue;
    if (!it.title.trim()) continue;

    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert({
        workspace_id: workspaceId,
        board_id: boardId,
        column_key: 'triage',
        order: order++,
        title: it.title,
        description: it.description,
        type: it.type,
        priority: it.priority,
        due_date: it.due_date,
        waiting_on: it.waiting_on,
        client_id: input.clientId ?? null,
        case_id: input.caseId ?? null,
        source_event_id: input.eventId,
        ai_suggested: true,
        ai_reasoning: it.ai_reasoning ?? null,
        ai_confidence: it.ai_confidence ?? null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('ticket insert failed', error);
      continue;
    }
    ticketIds.push(ticket.id);

    await supabase.from('ticket_activities').insert({
      ticket_id: ticket.id,
      actor_id: userId,
      action: 'created',
      to_value: { via: 'copilot', title: it.title },
    });
  }

  // 사건 이력(milestone)으로 저장 옵션
  let milestoneCreated = false;
  if (input.saveAsMilestone && input.caseId) {
    const summary = input.milestoneSummary?.trim() || '상담 진행';
    const { error } = await supabase.from('events').insert({
      workspace_id: workspaceId,
      source_type: 'milestone',
      raw_content: summary,
      occurred_at: new Date().toISOString(),
      client_id: input.clientId ?? null,
      case_id: input.caseId,
      processed: true,
      metadata: { origin_event_id: input.eventId },
    });
    milestoneCreated = !error;
  }

  // 원본 이벤트 processed=true로 갱신
  await supabase
    .from('events')
    .update({ processed: ticketIds.length > 0 })
    .eq('id', input.eventId);

  revalidatePath('/kanban');
  if (input.caseId) revalidatePath(`/cases/${input.caseId}`);

  return { ok: true, ticketIds, milestoneCreated };
}
