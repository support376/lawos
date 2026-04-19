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
  // 선택: 계약도 함께 생성
  contract?: {
    total_amount_krw: number;
    plan_type: 'lump_sum' | 'installment' | 'conditional';
    installment_count: number;
    first_due_date: string;
    cycle_days?: number;
    retainer_ratio?: number;
    payment_gate?: 'hard' | 'soft';
    gate_blocks_stages?: string[];
    notes?: string;
    installments?: Array<{
      installment_no: number;
      kind: 'retainer' | 'installment' | 'success_fee' | 'court_fee' | 'misc';
      amount_krw: number;
      due_date: string;
    }>;
  };
}): Promise<{ ok: boolean; caseId?: string; clientId?: string; contractId?: string; error?: string }> {
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

    // 계약 생성 (선택)
    let contractId: string | undefined;
    if (input.contract) {
      const { createPaymentContract } = await import('./payments');
      const r = await createPaymentContract({
        caseId: newCase.id,
        total_amount_krw: input.contract.total_amount_krw,
        plan_type: input.contract.plan_type,
        installment_count: input.contract.installment_count,
        first_due_date: input.contract.first_due_date,
        cycle_days: input.contract.cycle_days,
        retainer_ratio: input.contract.retainer_ratio,
        payment_gate: input.contract.payment_gate,
        gate_blocks_stages: input.contract.gate_blocks_stages,
        notes: input.contract.notes,
        installments: input.contract.installments,
      });
      if (r.ok) contractId = r.contractId;
    }

    // 상담일지를 Case로 자동 연결 (Lead 전환 시 상담일지는 Case 자산이 됨)
    try {
      await supabase
        .from('consultation_logs')
        .update({ case_id: newCase.id, updated_at: new Date().toISOString() })
        .eq('lead_id', input.leadId)
        .eq('workspace_id', workspaceId);
    } catch (e) {
      console.warn('[convertLeadToCase] consultation_log case_id 연결 실패:', e);
    }

    // 🔔 수임 컨펌 Action 자동 생성 — 대표변호사 한 명에게 자동 할당
    try {
      const { data: mp } = await supabase
        .from('workspace_member_roles')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .eq('role', 'managing_partner')
        .limit(1)
        .maybeSingle();
      const assignTo = mp?.user_id ?? userId;
      const clientName = lead.name;
      const retainerInfo = input.contract
        ? ` · 계약 ${Math.round(input.contract.total_amount_krw / 10000)}만원 (${input.contract.installment_count}회)`
        : ' · 계약 없음';
      await supabase.from('actions').insert({
        workspace_id: workspaceId,
        subject_type: 'case',
        subject_id: newCase.id,
        action_type: 'confirm_new_case',
        title: `🔔 수임 컨펌: ${clientName}${retainerInfo}`,
        description: `상담원이 '${clientName}' 리드를 수임 확정했습니다. 담당 변호사·서류팀 지정 후 승인해 주세요.`,
        assigned_to: assignTo,
        team_role: 'managing_partner',
        due_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        status: 'pending',
        priority: 1,
        auto_generated: true,
        created_by: userId,
        payload: {
          lead_id: input.leadId,
          client_id: finalClientId,
          contract_id: contractId ?? null,
          case_type: input.caseType,
        },
      });
    } catch (e) {
      console.warn('[convertLeadToCase] confirm_new_case action 생성 실패:', e);
    }

    revalidatePath('/workflow');
    revalidatePath('/workbench');
    revalidatePath('/dashboard');
    revalidatePath('/cases');
    revalidatePath('/clients');
    return { ok: true, caseId: newCase.id, clientId: finalClientId, contractId };
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
