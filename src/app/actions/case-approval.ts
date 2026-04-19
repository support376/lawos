'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/ontology/core/roles';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';

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

export async function approveAndAssignCase(input: {
  confirmActionId: string;
  caseId: string;
  primaryAttorneyId: string;
  documentStaffId?: string | null;
  analysisStaffId?: string | null;
  toStage: StageKey;
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();

    // 1. case.assigned_to 업데이트
    const { error: caseErr } = await supabase
      .from('cases')
      .update({ assigned_to: input.primaryAttorneyId })
      .eq('id', input.caseId)
      .eq('workspace_id', workspaceId);
    if (caseErr) return { ok: false, error: `사건 할당 실패: ${caseErr.message}` };

    // 2. case_team_assignments 갱신 (upsert)
    const assignments: Array<{ team_role: Role; user_id: string }> = [
      { team_role: 'attorney', user_id: input.primaryAttorneyId },
    ];
    if (input.documentStaffId) {
      assignments.push({ team_role: 'document_staff', user_id: input.documentStaffId });
    }
    if (input.analysisStaffId) {
      assignments.push({ team_role: 'analysis_staff', user_id: input.analysisStaffId });
    }
    for (const a of assignments) {
      const { data: existing } = await supabase
        .from('case_team_assignments')
        .select('id')
        .eq('case_id', input.caseId)
        .eq('team_role', a.team_role)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('case_team_assignments')
          .update({ assigned_user_id: a.user_id, assigned_at: new Date().toISOString(), assigned_by: userId })
          .eq('id', existing.id);
      } else {
        await supabase.from('case_team_assignments').insert({
          workspace_id: workspaceId,
          case_id: input.caseId,
          team_role: a.team_role,
          assigned_user_id: a.user_id,
          assigned_by: userId,
        });
      }
    }

    // 3. Stage 전이 (rehab_case_details + stage_history)
    const { data: openHist } = await supabase
      .from('rehab_stage_history')
      .select('id')
      .eq('case_id', input.caseId)
      .is('exit_date', null)
      .order('entry_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openHist) {
      await supabase
        .from('rehab_stage_history')
        .update({ exit_date: new Date().toISOString() })
        .eq('id', openHist.id);
    }
    const stageMeta = STAGES[input.toStage];
    await supabase.from('rehab_stage_history').insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      stage_key: input.toStage,
      responsible_actor: stageMeta?.primary_actor ?? null,
      required_actions: input.note ? [input.note] : [],
    });
    const { data: details } = await supabase
      .from('rehab_case_details')
      .select('id')
      .eq('case_id', input.caseId)
      .maybeSingle();
    if (details) {
      await supabase
        .from('rehab_case_details')
        .update({ current_stage_key: input.toStage, updated_at: new Date().toISOString() })
        .eq('id', details.id);
    } else {
      await supabase.from('rehab_case_details').insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        current_stage_key: input.toStage,
      });
    }

    // 4. confirm_new_case Action = done
    await supabase
      .from('actions')
      .update({
        status: 'done',
        completed_by: userId,
        completed_at: new Date().toISOString(),
      })
      .eq('id', input.confirmActionId)
      .eq('workspace_id', workspaceId);

    // 5. 후속 Action 자동 배포
    const followUps: Array<Record<string, unknown>> = [];
    // 주 변호사에게
    followUps.push({
      workspace_id: workspaceId,
      subject_type: 'case',
      subject_id: input.caseId,
      action_type: 'initial_writer_task',
      title: '✍️ 신규 사건 검토 — 채무자 프로필 입력',
      description: '수임 직후 첫 업무. 채무자 인적·재무·위험 플래그 입력으로 전략 평가 활성화.',
      assigned_to: input.primaryAttorneyId,
      team_role: 'attorney',
      due_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      status: 'pending',
      priority: 2,
      auto_generated: true,
      created_by: userId,
    });
    // 서류팀에게
    if (input.documentStaffId) {
      followUps.push({
        workspace_id: workspaceId,
        subject_type: 'case',
        subject_id: input.caseId,
        action_type: 'initial_document_request',
        title: '📄 필수 서류 20종 안내 발송',
        description: '의뢰인에게 필수 서류 목록 카톡/이메일 안내. 수집 시작.',
        assigned_to: input.documentStaffId,
        team_role: 'document_staff',
        due_date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        status: 'pending',
        priority: 2,
        auto_generated: true,
        created_by: userId,
      });
    }
    if (followUps.length > 0) {
      await supabase.from('actions').insert(followUps);
    }

    revalidatePath('/workflow');
    revalidatePath('/workbench');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '승인 실패' };
  }
}

export async function listPendingConfirms(): Promise<Array<{
  id: string;
  title: string;
  case_id: string;
  case_title: string;
  client_name: string;
  created_at: string;
  due_date: string | null;
  priority: number;
  payload: Record<string, unknown>;
}>> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('actions')
    .select(`
      id, title, subject_id, created_at, due_date, priority, payload,
      case:cases!actions_subject_id_fkey(id, title, client:clients(name))
    `)
    .eq('workspace_id', workspaceId)
    .eq('action_type', 'confirm_new_case')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return ((data ?? []) as unknown as Array<{
    id: string; title: string; subject_id: string; created_at: string; due_date: string | null; priority: number;
    payload: Record<string, unknown>;
    case: { id: string; title: string; client: { name: string } | null } | null;
  }>).map((r) => ({
    id: r.id,
    title: r.title,
    case_id: r.subject_id,
    case_title: r.case?.title ?? '—',
    client_name: r.case?.client?.name ?? '—',
    created_at: r.created_at,
    due_date: r.due_date,
    priority: r.priority,
    payload: r.payload,
  }));
}
