'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { extractBulkImport, type BulkImportResult } from '@/lib/ai/bulk-import';

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

// Step 1: 분석 (parse만, 저장 안 함)
export async function parseBulkText(text: string): Promise<BulkImportResult> {
  if (!text.trim()) throw new Error('텍스트를 입력해주세요');
  if (text.length > 50000) throw new Error('텍스트가 너무 깁니다 (최대 5만자)');
  return extractBulkImport({ text });
}

// Step 2: 커밋 (프리뷰 확인 후 실제 DB 저장)
export async function commitBulkImport(result: BulkImportResult) {
  const { supabase, workspaceId, boardId, userId } = await getContext();

  const stats = { clients: 0, cases: 0, history: 0, tickets: 0 };

  // 각 클라이언트 처리 (이미 존재하면 재사용)
  for (const bc of result.clients) {
    let clientId: string;
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', bc.name)
      .maybeSingle();

    if (existing) {
      clientId = existing.id;
      // 필드 업데이트 (기존 값 비어있을 때만)
      await supabase
        .from('clients')
        .update({
          phone: bc.phone ?? null,
          email: bc.email ?? null,
          memo: bc.memo ?? null,
        })
        .eq('id', clientId)
        .is('phone', null);
    } else {
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert({
          workspace_id: workspaceId,
          name: bc.name,
          phone: bc.phone,
          email: bc.email,
          memo: bc.memo,
        })
        .select('id')
        .single();
      if (error) throw error;
      clientId = newClient.id;
      stats.clients++;
    }

    for (const bcs of bc.cases) {
      const { data: newCase, error: caseErr } = await supabase
        .from('cases')
        .insert({
          workspace_id: workspaceId,
          client_id: clientId,
          title: bcs.title,
          case_type: bcs.case_type,
          stage: bcs.status === 'closed' ? 'closed' : 'in_progress',
          status: bcs.status === 'closed' ? 'archived' : 'active',
          case_number: bcs.case_number,
          court: bcs.court,
          opposing_party: bcs.opposing_party,
          retainer_date: bcs.retainer_date,
          closed_date: bcs.closed_date,
          outcome: bcs.outcome,
        })
        .select('id')
        .single();
      if (caseErr) throw caseErr;
      stats.cases++;

      // 이력 (milestone 이벤트)
      for (const h of bcs.history) {
        const { error: hErr } = await supabase.from('events').insert({
          workspace_id: workspaceId,
          source_type: 'milestone',
          raw_content: h.summary,
          occurred_at: h.date ? `${h.date}T00:00:00+09:00` : null,
          client_id: clientId,
          case_id: newCase.id,
          processed: true,
        });
        if (!hErr) stats.history++;
      }

      // 활성 할일 (To Do 컬럼에)
      let order = 1;
      for (const t of bcs.tickets) {
        const { data: ticket, error: tErr } = await supabase
          .from('tickets')
          .insert({
            workspace_id: workspaceId,
            board_id: boardId,
            column_key: 'todo',
            order: order++,
            title: t.title,
            description: t.description,
            type: t.type,
            priority: t.priority,
            due_date: t.due_date,
            waiting_on: t.waiting_on,
            client_id: clientId,
            case_id: newCase.id,
            created_by: userId,
          })
          .select('id')
          .single();
        if (!tErr) {
          stats.tickets++;
          await supabase.from('ticket_activities').insert({
            ticket_id: ticket.id,
            actor_id: userId,
            action: 'created',
            to_value: { via: 'bulk_import', title: t.title },
          });
        }
      }
    }
  }

  revalidatePath('/kanban');
  revalidatePath('/clients');
  revalidatePath('/cases');
  revalidatePath('/today');

  return stats;
}

// ============ 사건 종결/재개 ============
export async function closeCase(caseId: string, outcome?: string | null) {
  const { supabase } = await getContext();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('cases')
    .update({
      status: 'archived',
      stage: 'closed',
      closed_date: today,
      outcome: outcome ?? null,
    })
    .eq('id', caseId);
  if (error) throw error;

  // 타임라인에 종결 기록 추가
  const { data: caseRow } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', caseId)
    .maybeSingle();
  if (caseRow) {
    await supabase.from('events').insert({
      workspace_id: caseRow.workspace_id,
      source_type: 'milestone',
      raw_content: outcome ? `사건 종결: ${outcome}` : '사건 종결',
      occurred_at: new Date().toISOString(),
      client_id: caseRow.client_id,
      case_id: caseId,
      processed: true,
    });
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/cases');
  revalidatePath('/clients');
}

export async function reopenCase(caseId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase
    .from('cases')
    .update({
      status: 'active',
      stage: 'in_progress',
      closed_date: null,
      outcome: null,
    })
    .eq('id', caseId);
  if (error) throw error;

  const { data: caseRow } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', caseId)
    .maybeSingle();
  if (caseRow) {
    await supabase.from('events').insert({
      workspace_id: caseRow.workspace_id,
      source_type: 'milestone',
      raw_content: '사건 재개',
      occurred_at: new Date().toISOString(),
      client_id: caseRow.client_id,
      case_id: caseId,
      processed: true,
    });
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/cases');
}

// ============ 마일스톤 추가 ============
export async function addMilestone(input: {
  caseId: string;
  date: string; // YYYY-MM-DD
  summary: string;
}) {
  const { supabase } = await getContext();

  const { data: caseRow } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!caseRow) throw new Error('사건 없음');

  await supabase.from('events').insert({
    workspace_id: caseRow.workspace_id,
    source_type: 'milestone',
    raw_content: input.summary,
    occurred_at: `${input.date}T00:00:00+09:00`,
    client_id: caseRow.client_id,
    case_id: input.caseId,
    processed: true,
  });

  revalidatePath(`/cases/${input.caseId}`);
}
