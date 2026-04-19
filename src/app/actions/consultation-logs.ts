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

export interface ConsultationLog {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  case_id: string | null;
  consultant_user_id: string | null;
  consultation_date: string;
  section_personal: string | null;
  section_debt: string | null;
  section_assets: string | null;
  section_income: string | null;
  section_statement: string | null;
  section_engagement: string | null;
  status: 'draft' | 'finalized';
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getLeadConsultationLog(leadId: string): Promise<ConsultationLog | null> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('consultation_logs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ConsultationLog) ?? null;
}

export async function upsertConsultationLog(input: {
  leadId: string;
  consultation_date?: string;
  section_personal?: string | null;
  section_debt?: string | null;
  section_assets?: string | null;
  section_income?: string | null;
  section_statement?: string | null;
  section_engagement?: string | null;
  status?: 'draft' | 'finalized';
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();

    const { data: existing } = await supabase
      .from('consultation_logs')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('lead_id', input.leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.consultation_date !== undefined) payload.consultation_date = input.consultation_date;
    if (input.section_personal !== undefined) payload.section_personal = input.section_personal;
    if (input.section_debt !== undefined) payload.section_debt = input.section_debt;
    if (input.section_assets !== undefined) payload.section_assets = input.section_assets;
    if (input.section_income !== undefined) payload.section_income = input.section_income;
    if (input.section_statement !== undefined) payload.section_statement = input.section_statement;
    if (input.section_engagement !== undefined) payload.section_engagement = input.section_engagement;
    if (input.status !== undefined) {
      payload.status = input.status;
      if (input.status === 'finalized') payload.finalized_at = new Date().toISOString();
    }

    if (existing) {
      const { error } = await supabase
        .from('consultation_logs')
        .update(payload)
        .eq('id', existing.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath('/workflow');
      return { ok: true, id: existing.id };
    } else {
      const { data, error } = await supabase
        .from('consultation_logs')
        .insert({
          workspace_id: workspaceId,
          lead_id: input.leadId,
          consultant_user_id: userId,
          consultation_date: input.consultation_date ?? new Date().toISOString().slice(0, 10),
          ...payload,
        })
        .select('id')
        .single();
      if (error) return { ok: false, error: error.message };
      revalidatePath('/workflow');
      return { ok: true, id: data.id };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}
