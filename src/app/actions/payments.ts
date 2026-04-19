'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type {
  PaymentContract,
  PaymentSchedule,
  PaymentPlanType,
  PaymentGate,
  PaymentKind,
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

// 계약 + 회차 자동 생성 (create_payment_contract action)
export async function createPaymentContract(input: {
  caseId: string;
  total_amount_krw: number;
  plan_type: PaymentPlanType;
  installment_count: number;
  first_due_date: string;                                  // YYYY-MM-DD
  cycle_days?: number;                                     // installment인 경우
  payment_gate?: PaymentGate;
  gate_blocks_stages?: string[];
  auto_dunning_enabled?: boolean;
  dunning_schedule_days?: number[];
  retainer_ratio?: number;                                 // 0~1, 착수금 비율. 기본 1/N
  notes?: string;
}): Promise<{ ok: boolean; contractId?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();
    const n = Math.max(1, input.installment_count);

    // 계약 생성
    const { data: contract, error: cErr } = await supabase
      .from('payment_contracts')
      .insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        total_amount_krw: input.total_amount_krw,
        plan_type: input.plan_type,
        installment_count: n,
        first_due_date: input.first_due_date,
        cycle_days: input.cycle_days ?? 30,
        payment_gate: input.payment_gate ?? 'hard',
        auto_dunning_enabled: input.auto_dunning_enabled ?? true,
        dunning_schedule_days: input.dunning_schedule_days ?? [1, 3, 7, 14],
        signed_at: new Date().toISOString(),
        signed_by_user_id: userId,
        notes: input.notes ?? null,
      })
      .select('id')
      .single();
    if (cErr || !contract) return { ok: false, error: cErr?.message };

    // 회차 생성
    const retainerRatio = input.retainer_ratio ?? 1 / n;
    const retainerAmount = Math.round(input.total_amount_krw * retainerRatio);
    const remaining = input.total_amount_krw - retainerAmount;
    const perInstallment = n > 1 ? Math.round(remaining / (n - 1)) : 0;

    const schedules: Array<Record<string, unknown>> = [];
    const firstDue = new Date(input.first_due_date);
    const cycleDays = input.cycle_days ?? 30;

    for (let i = 1; i <= n; i++) {
      const dueDate = new Date(firstDue);
      dueDate.setDate(dueDate.getDate() + cycleDays * (i - 1));
      const kind: PaymentKind = i === 1 ? 'retainer' : 'installment';
      const amount =
        i === 1
          ? retainerAmount
          : i === n
            ? remaining - perInstallment * (n - 2)
            : perInstallment;
      schedules.push({
        workspace_id: workspaceId,
        case_id: input.caseId,
        contract_id: contract.id,
        installment_no: i,
        kind,
        amount_krw: amount,
        due_date: dueDate.toISOString().slice(0, 10),
        status: 'scheduled',
        gate_blocks_stages: input.gate_blocks_stages ?? [],
      });
    }
    const { error: sErr } = await supabase.from('payment_schedules').insert(schedules);
    if (sErr) return { ok: false, error: sErr.message };

    revalidatePath('/workflow');
    return { ok: true, contractId: contract.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '계약 생성 실패' };
  }
}

export async function confirmPayment(input: {
  scheduleId: string;
  paid_amount_krw: number;
  paid_date?: string;
  payment_method?: 'bank_transfer' | 'card' | 'cash' | 'check';
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { data: cur } = await supabase
      .from('payment_schedules')
      .select('amount_krw, paid_amount_krw')
      .eq('id', input.scheduleId)
      .maybeSingle();
    if (!cur) return { ok: false, error: '회차 없음' };

    const newPaid = (cur.paid_amount_krw ?? 0) + input.paid_amount_krw;
    const status = newPaid >= cur.amount_krw ? 'paid' : 'partial';

    const { error } = await supabase
      .from('payment_schedules')
      .update({
        paid_amount_krw: newPaid,
        paid_date: status === 'paid' ? (input.paid_date ?? new Date().toISOString().slice(0, 10)) : null,
        status,
        payment_method: input.payment_method ?? null,
        next_dunning_at: status === 'paid' ? null : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.scheduleId)
      .eq('workspace_id', workspaceId);
    if (error) return { ok: false, error: error.message };

    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '확인 실패' };
  }
}

export async function markDunningSent(input: {
  scheduleId: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { data: cur } = await supabase
      .from('payment_schedules')
      .select('dunning_count, last_dunning_at')
      .eq('id', input.scheduleId)
      .maybeSingle();
    if (!cur) return { ok: false, error: '회차 없음' };
    const { error } = await supabase
      .from('payment_schedules')
      .update({
        dunning_count: (cur.dunning_count ?? 0) + 1,
        last_dunning_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.scheduleId)
      .eq('workspace_id', workspaceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '기록 실패' };
  }
}

export async function listCaseSchedules(caseId: string): Promise<PaymentSchedule[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('case_id', caseId)
    .order('installment_no');
  return (data ?? []) as PaymentSchedule[];
}

export async function listOverdueSchedules(): Promise<PaymentSchedule[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('payment_schedules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .in('status', ['overdue', 'partial'])
    .order('due_date', { ascending: true });
  return (data ?? []) as PaymentSchedule[];
}

export async function listCaseContracts(caseId: string): Promise<PaymentContract[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('payment_contracts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  return (data ?? []) as PaymentContract[];
}
