'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

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

export interface CaseFinancialHold {
  id: string;
  workspace_id: string;
  case_id: string;
  active: boolean;
  reason: string;
  held_by: string | null;
  held_at: string;
  released_by: string | null;
  released_at: string | null;
  notes: string | null;
}

export async function placeFinanceHold(input: {
  caseId: string;
  reason: string;
  notes?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();

    // 기존 active hold 있는지 확인
    const { data: existing } = await supabase
      .from('case_financial_holds')
      .select('id')
      .eq('case_id', input.caseId)
      .eq('active', true)
      .maybeSingle();
    if (existing) return { ok: false, error: '이미 활성화된 Hold가 있습니다' };

    const { data, error } = await supabase
      .from('case_financial_holds')
      .insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        active: true,
        reason: input.reason,
        held_by: userId,
        notes: input.notes ?? null,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Hold 실패' };
  }
}

export async function releaseFinanceHold(input: {
  holdId: string;
  notes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();
    const { error } = await supabase
      .from('case_financial_holds')
      .update({
        active: false,
        released_by: userId,
        released_at: new Date().toISOString(),
        notes: input.notes ?? undefined,
      })
      .eq('id', input.holdId)
      .eq('workspace_id', workspaceId)
      .eq('active', true);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '해제 실패' };
  }
}

export async function getActiveHold(caseId: string): Promise<CaseFinancialHold | null> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('case_financial_holds')
    .select('*')
    .eq('case_id', caseId)
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('held_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CaseFinancialHold) ?? null;
}

export async function listActiveHolds(): Promise<CaseFinancialHold[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('case_financial_holds')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('active', true);
  return (data ?? []) as CaseFinancialHold[];
}

// Stage 전이 차단 체크 (advance_stage 수행 전 호출)
export async function checkStageBlock(caseId: string): Promise<{
  blocked: boolean;
  reason: string | null;
}> {
  const { supabase, workspaceId } = await getContext();

  // 1) Finance Hold
  const { data: hold } = await supabase
    .from('case_financial_holds')
    .select('reason')
    .eq('case_id', caseId)
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (hold) return { blocked: true, reason: `재무 Hold: ${hold.reason}` };

  // 2) payment_schedule.gate_blocks_stages 와 현재 Stage
  const { data: details } = await supabase
    .from('rehab_case_details')
    .select('current_stage_key')
    .eq('case_id', caseId)
    .maybeSingle();

  const { data: schedules } = await supabase
    .from('payment_schedules')
    .select('installment_no, status, gate_blocks_stages')
    .eq('case_id', caseId)
    .eq('workspace_id', workspaceId)
    .in('status', ['overdue', 'scheduled']);

  const currentStage = details?.current_stage_key ?? null;
  for (const s of (schedules ?? []) as Array<{
    installment_no: number;
    status: string;
    gate_blocks_stages: string[] | null;
  }>) {
    if (s.status !== 'overdue') continue;
    const blocks = s.gate_blocks_stages ?? [];
    if (blocks.length === 0) continue;
    if (currentStage && blocks.includes(currentStage)) {
      return {
        blocked: true,
        reason: `${s.installment_no}회차 연체 → ${currentStage} Stage 차단`,
      };
    }
  }

  return { blocked: false, reason: null };
}
