'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type {
  Debtor,
  Asset,
  Debt,
  Income,
  Dependent,
  StageKey,
  RehabCaseFullView,
  RehabCase,
  RepaymentPlan,
  RehabDocument,
  StageHistoryEntry,
  Interaction,
  CourtOrder,
  RepaymentEvent,
  RehabActor,
} from '@/lib/ontology/domains/personal_rehab/entities';
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

// =========================================================================
// Debtor upsert (풀 프로필 한 번에 저장)
// =========================================================================

export type DebtorPatch = Partial<Omit<Debtor, 'id' | 'case_id'>>;

export async function upsertRehabDebtor(input: {
  caseId: string;
  patch: DebtorPatch;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();

    // flatten nested objects into flat columns
    const flat: Record<string, unknown> = { ...input.patch };
    if (input.patch.eligibility) {
      Object.assign(flat, input.patch.eligibility);
      delete flat.eligibility;
    }
    if (input.patch.risks) {
      Object.assign(flat, input.patch.risks);
      delete flat.risks;
    }
    if (input.patch.shortening) {
      Object.assign(flat, input.patch.shortening);
      delete flat.shortening;
    }
    flat['updated_at'] = new Date().toISOString();

    const { data: existing } = await supabase
      .from('rehab_debtors')
      .select('id')
      .eq('case_id', input.caseId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('rehab_debtors')
        .update(flat)
        .eq('id', existing.id)
        .eq('workspace_id', workspaceId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from('rehab_debtors').insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        name: (flat.name as string) ?? '미지정',
        ...flat,
      });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

// =========================================================================
// Stage 전이
// =========================================================================

export async function advanceStage(input: {
  caseId: string;
  toStage: StageKey;
  note?: string;
  force?: boolean;                          // 대표만 사용 (Hold 무시)
}): Promise<{ ok: boolean; error?: string; blocked_reason?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();

    // Hold / Gate 체크
    if (!input.force) {
      const { checkStageBlock } = await import('./finance-holds');
      const check = await checkStageBlock(input.caseId);
      if (check.blocked) {
        return { ok: false, error: '전이 차단', blocked_reason: check.reason ?? '' };
      }
    }

    // 기존 history 중 exit_date 없는 것 마감
    const { data: open } = await supabase
      .from('rehab_stage_history')
      .select('id')
      .eq('case_id', input.caseId)
      .is('exit_date', null)
      .order('entry_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (open) {
      await supabase
        .from('rehab_stage_history')
        .update({ exit_date: new Date().toISOString() })
        .eq('id', open.id);
    }

    // 새 stage 진입
    const meta = STAGES[input.toStage];
    const { error: insErr } = await supabase.from('rehab_stage_history').insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      stage_key: input.toStage,
      responsible_actor: meta?.primary_actor ?? null,
      required_actions: input.note ? [input.note] : [],
    });
    if (insErr) return { ok: false, error: insErr.message };

    // rehab_case_details.current_stage_key 갱신 (upsert)
    const { data: existing } = await supabase
      .from('rehab_case_details')
      .select('id')
      .eq('case_id', input.caseId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('rehab_case_details')
        .update({ current_stage_key: input.toStage, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase.from('rehab_case_details').insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        current_stage_key: input.toStage,
      });
    }

    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

// =========================================================================
// Debt / Asset / Income / Dependent — CRUD 기본
// =========================================================================

export async function addRehabDebt(input: {
  caseId: string;
  data: Omit<Debt, 'id' | 'case_id' | 'collateral_asset_id'>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase.from('rehab_debts').insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      ...input.data,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

export async function addRehabAsset(input: {
  caseId: string;
  data: Omit<Asset, 'id' | 'case_id'>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase.from('rehab_assets').insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      ...input.data,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

export async function addRehabIncome(input: {
  caseId: string;
  data: Omit<Income, 'id' | 'case_id'>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase.from('rehab_incomes').insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      ...input.data,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

export async function addRehabDependent(input: {
  caseId: string;
  data: Omit<Dependent, 'id' | 'case_id'>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase.from('rehab_dependents').insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      ...input.data,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

export async function deleteRehabRow(input: {
  table: 'rehab_debts' | 'rehab_assets' | 'rehab_incomes' | 'rehab_dependents';
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase
      .from(input.table)
      .delete()
      .eq('id', input.id)
      .eq('workspace_id', workspaceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '삭제 실패' };
  }
}

// =========================================================================
// 풀 뷰 (Case 상세 페이지용)
// =========================================================================

export async function fetchRehabCaseFullView(caseId: string): Promise<
  | (RehabCaseFullView & { client_name: string })
  | null
> {
  const { supabase } = await getContext();

  const [
    caseRow,
    details,
    debtor,
    debts,
    assets,
    incomes,
    dependents,
    documents,
    plans,
    stageHistory,
    interactions,
    orders,
    events,
    actors,
  ] = await Promise.all([
    supabase
      .from('cases')
      .select('id, case_type, court, case_number, client:clients(id, name)')
      .eq('id', caseId)
      .maybeSingle(),
    supabase.from('rehab_case_details').select('*').eq('case_id', caseId).maybeSingle(),
    supabase.from('rehab_debtors').select('*').eq('case_id', caseId).maybeSingle(),
    supabase.from('rehab_debts').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('rehab_assets').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('rehab_incomes').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('rehab_dependents').select('*').eq('case_id', caseId).order('created_at'),
    supabase.from('rehab_documents').select('*').eq('case_id', caseId).order('label'),
    supabase.from('rehab_repayment_plans').select('*').eq('case_id', caseId).order('version', { ascending: false }),
    supabase.from('rehab_stage_history').select('*').eq('case_id', caseId).order('entry_date', { ascending: false }),
    supabase.from('rehab_interactions').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
    supabase.from('rehab_court_orders').select('*').eq('case_id', caseId).order('issued_date', { ascending: false }),
    supabase.from('rehab_repayment_events').select('*').eq('case_id', caseId).order('event_date', { ascending: false }),
    supabase.from('rehab_actors').select('*').eq('case_id', caseId).order('actor_type'),
  ]);

  if (!caseRow.data) return null;
  const c = caseRow.data as unknown as {
    id: string;
    case_type: string | null;
    court: string | null;
    case_number: string | null;
    client: { id: string; name: string } | null;
  };

  const d = details.data as Record<string, unknown> | null;
  const rehabCase: RehabCase = {
    id: c.id,
    case_type: (d?.rehab_case_type as RehabCase['case_type']) ?? 'personal_rehab',
    court: c.court,
    case_number: c.case_number,
    trustee_name: (d?.trustee_name as string) ?? null,
    filing_date: (d?.filing_date as string) ?? null,
    opening_date: (d?.opening_date as string) ?? null,
    approval_date: (d?.approval_date as string) ?? null,
    discharge_date: (d?.discharge_date as string) ?? null,
    current_stage_key: (d?.current_stage_key as StageKey) ?? 'consultation',
  };

  return {
    case: rehabCase,
    debtor: debtor.data as Debtor | null as Debtor, // nullable downstream
    debts: (debts.data ?? []) as Debt[],
    assets: (assets.data ?? []) as Asset[],
    incomes: (incomes.data ?? []) as Income[],
    dependents: (dependents.data ?? []) as Dependent[],
    documents: (documents.data ?? []) as RehabDocument[],
    repayment_plans: (plans.data ?? []) as RepaymentPlan[],
    stage_history: (stageHistory.data ?? []) as StageHistoryEntry[],
    interactions: (interactions.data ?? []) as Interaction[],
    court_orders: (orders.data ?? []) as CourtOrder[],
    repayment_events: (events.data ?? []) as RepaymentEvent[],
    actors: (actors.data ?? []) as RehabActor[],
    client_name: c.client?.name ?? '미지정',
  };
}
