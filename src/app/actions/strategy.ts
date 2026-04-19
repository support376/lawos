'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import {
  TACTIC_TO_TICKETS,
  TACTIC_ADOPTION_LABEL,
} from '@/lib/ontology/tactic-tickets';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  const { data: m } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!m) throw new Error('NO_WORKSPACE');
  return { supabase, userId: user.id, workspaceId: m.workspace_id };
}

export interface AdoptResult {
  ok: boolean;
  error?: string;
  ticketIds: string[];
  tacticLabel: string;
}

// 전략 채택 → 관련 칸반 티켓 자동 생성 → case_tactics_adopted 기록
export async function adoptStrategy(input: {
  caseId: string;
  tacticKey: string;
}): Promise<AdoptResult> {
  try {
    const { supabase, userId, workspaceId } = await getContext();

    const { data: c } = await supabase
      .from('cases')
      .select(`
        id, client_id, workspace_id,
        board_id:workspace_id
      `)
      .eq('id', input.caseId)
      .maybeSingle();
    if (!c) {
      return { ok: false, error: '사건 없음', ticketIds: [], tacticLabel: '' };
    }

    // 워크스페이스의 칸반 보드 찾기
    const { data: board } = await supabase
      .from('kanban_boards')
      .select('id')
      .eq('workspace_id', workspaceId)
      .limit(1)
      .maybeSingle();
    if (!board) {
      return { ok: false, error: '칸반 보드 없음', ticketIds: [], tacticLabel: '' };
    }

    const templates = TACTIC_TO_TICKETS[input.tacticKey] ?? [];
    const tacticLabel = TACTIC_ADOPTION_LABEL[input.tacticKey] ?? input.tacticKey;

    // Triage 컬럼 최대 order 확인
    const { data: lastOrder } = await supabase
      .from('tickets')
      .select('order')
      .eq('board_id', board.id)
      .eq('column_key', 'triage')
      .order('order', { ascending: false })
      .limit(1)
      .maybeSingle();
    let order = (lastOrder?.order ?? 0) + 1;

    const ticketIds: string[] = [];
    const today = new Date();

    for (const tmpl of templates) {
      const dueDate =
        tmpl.due_in_days != null
          ? new Date(today.getTime() + tmpl.due_in_days * 86400000)
              .toISOString()
              .slice(0, 10)
          : null;

      const { data: t, error } = await supabase
        .from('tickets')
        .insert({
          workspace_id: workspaceId,
          board_id: board.id,
          column_key: 'triage',
          order: order++,
          title: tmpl.title,
          description: tmpl.description ?? null,
          type: tmpl.type,
          priority: tmpl.priority,
          due_date: dueDate,
          waiting_on: tmpl.waiting_on ?? null,
          client_id: c.client_id,
          case_id: input.caseId,
          ai_suggested: true,
          ai_confidence: 1.0, // 규칙기반 자동생성 — 환각 리스크 없음
          ai_reasoning: `전략 "${tacticLabel}" 채택으로 자동 생성 (규칙기반)`,
          created_by: userId,
        })
        .select('id')
        .single();
      if (!error && t) ticketIds.push(t.id);
    }

    // case_tactics_adopted 기록 (테이블 있으면)
    try {
      await supabase.from('case_tactics_adopted').insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        tactic_key: input.tacticKey,
        status: 'planned',
        adopted_by: userId,
        notes: `자동 티켓 ${ticketIds.length}개 생성`,
      });
    } catch (e) {
      console.warn('[adoptStrategy] tactics_adopted insert 실패 (무시):', e);
    }

    // 이벤트 기록
    await supabase.from('events').insert({
      workspace_id: workspaceId,
      source_type: 'milestone',
      raw_content: `전략 채택: ${tacticLabel} (티켓 ${ticketIds.length}개 자동 생성)`,
      occurred_at: new Date().toISOString(),
      case_id: input.caseId,
      client_id: c.client_id,
      processed: true,
      metadata: {
        action: 'strategy_adopted',
        tactic_key: input.tacticKey,
        ticket_ids: ticketIds,
      },
    });

    revalidatePath(`/cases/${input.caseId}`);
    revalidatePath('/kanban');

    return { ok: true, ticketIds, tacticLabel };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '전략 채택 실패',
      ticketIds: [],
      tacticLabel: '',
    };
  }
}
