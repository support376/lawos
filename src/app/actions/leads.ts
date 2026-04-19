'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type {
  Lead,
  LeadStatus,
  LeadSource,
  LeadLostReason,
  LeadUrgency,
} from '@/lib/ontology/core/objects';

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

export async function createLead(input: {
  name: string;
  contact?: string | null;
  source?: LeadSource | null;
  assigned_consultant_id?: string | null;
  case_type_hint?: string | null;
  urgency?: LeadUrgency;
  notes?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();
    const { data, error } = await supabase
      .from('leads')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        contact: input.contact ?? null,
        source: input.source ?? null,
        assigned_consultant_id: input.assigned_consultant_id ?? userId,
        case_type_hint: input.case_type_hint ?? null,
        urgency: input.urgency ?? 'normal',
        notes: input.notes ?? null,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '생성 실패' };
  }
}

export async function updateLeadStatus(input: {
  leadId: string;
  status: LeadStatus;
  lost_reason?: LeadLostReason | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date().toISOString(),
    };
    if (input.status === 'lost' && input.lost_reason) {
      patch.lost_reason = input.lost_reason;
    }
    if (input.status === 'contacted') {
      patch.last_contact_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', input.leadId)
      .eq('workspace_id', workspaceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '수정 실패' };
  }
}

// Lead → Case 전환 (convert_to_case action)
export async function convertLeadToCase(input: {
  leadId: string;
  caseTitle: string;
  caseType: 'personal_rehab' | 'divorce' | 'criminal' | 'other';
  clientId?: string | null;                    // 기존 고객 연결 시
  createClientIfMissing?: boolean;
}): Promise<{ ok: boolean; caseId?: string; clientId?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();

    // Lead 조회
    const { data: lead, error: lErr } = await supabase
      .from('leads')
      .select('*')
      .eq('id', input.leadId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (lErr || !lead) return { ok: false, error: 'Lead 조회 실패' };

    // 고객 준비
    let finalClientId = input.clientId;
    if (!finalClientId && input.createClientIfMissing !== false) {
      const { data: client, error: cErr } = await supabase
        .from('clients')
        .insert({
          workspace_id: workspaceId,
          name: lead.name,
          phone: lead.contact,
        })
        .select('id')
        .single();
      if (cErr || !client) return { ok: false, error: `고객 생성 실패: ${cErr?.message}` };
      finalClientId = client.id;
    }
    if (!finalClientId) return { ok: false, error: '고객 id 필요' };

    // Case 생성
    const { data: newCase, error: caseErr } = await supabase
      .from('cases')
      .insert({
        workspace_id: workspaceId,
        client_id: finalClientId,
        title: input.caseTitle,
        case_type: input.caseType,
        status: 'active',
        stage: 'initial',
        assigned_to: userId,
      })
      .select('id')
      .single();
    if (caseErr || !newCase) return { ok: false, error: `사건 생성 실패: ${caseErr?.message}` };

    // Lead 상태 업데이트
    await supabase
      .from('leads')
      .update({
        status: 'converted',
        converted_at: new Date().toISOString(),
        case_id: newCase.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.leadId);

    revalidatePath('/workflow');
    revalidatePath('/cases');
    revalidatePath('/clients');
    return { ok: true, caseId: newCase.id, clientId: finalClientId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '전환 실패' };
  }
}

export async function reassignConsultant(input: {
  leadId: string;
  newConsultantId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase
      .from('leads')
      .update({
        assigned_consultant_id: input.newConsultantId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.leadId)
      .eq('workspace_id', workspaceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '재배정 실패' };
  }
}

export async function listLeads(filter?: {
  status?: LeadStatus[];
  assigned_to_me?: boolean;
  limit?: number;
}): Promise<Lead[]> {
  const { supabase, userId, workspaceId } = await getContext();
  let q = supabase.from('leads').select('*').eq('workspace_id', workspaceId);
  if (filter?.status) q = q.in('status', filter.status);
  if (filter?.assigned_to_me) q = q.eq('assigned_consultant_id', userId);
  q = q.order('created_at', { ascending: false }).limit(filter?.limit ?? 200);
  const { data } = await q;
  return (data ?? []) as Lead[];
}
