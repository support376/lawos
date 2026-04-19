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

export type Asset = { label: string; value_krw: number; kind?: string };
export type RiskFlags = Record<string, boolean>;

export interface ClientIntelPatch {
  monthly_income_krw?: number | null;
  total_debt_krw?: number | null;
  dependents_count?: number | null;
  occupation?: string | null;
  assets?: Asset[];
  risk_flags?: RiskFlags;
  phone?: string | null;
  email?: string | null;
  memo?: string | null;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

export async function updateClientIntel(
  clientId: string,
  patch: ClientIntelPatch,
  caseIdForRevalidate?: string,
): Promise<ActionResult> {
  try {
    const { supabase, workspaceId } = await getContext();

    const payload: Record<string, unknown> = { intel_updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) payload[k] = v;
    }

    const { error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', clientId)
      .eq('workspace_id', workspaceId);

    if (error) {
      const hint =
        error.message.includes('column') || error.message.includes('schema cache')
          ? 'Supabase SQL Editor에서 supabase/ensure_schema_v2.sql 재실행 필요'
          : undefined;
      return { ok: false, error: error.message, hint };
    }

    // 이벤트 기록 (실패해도 무시)
    try {
      await supabase.from('events').insert({
        workspace_id: workspaceId,
        source_type: 'milestone',
        raw_content: `의뢰인 정보 업데이트 (${Object.keys(patch).length}개 필드)`,
        occurred_at: new Date().toISOString(),
        client_id: clientId,
        case_id: caseIdForRevalidate ?? null,
        processed: true,
        metadata: { action: 'client_intel_update', fields: Object.keys(patch) },
      });
    } catch {
      // ignore
    }

    if (caseIdForRevalidate) revalidatePath(`/cases/${caseIdForRevalidate}`);
    revalidatePath(`/clients/${clientId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '업데이트 실패' };
  }
}

export async function updateCaseIntel(
  caseId: string,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { data: cur } = await supabase
      .from('cases')
      .select('case_intel')
      .eq('id', caseId)
      .maybeSingle();
    const existing = (cur?.case_intel ?? {}) as Record<string, unknown>;
    const next = { ...existing, ...patch };
    const { error } = await supabase
      .from('cases')
      .update({ case_intel: next })
      .eq('id', caseId)
      .eq('workspace_id', workspaceId);
    if (error) {
      const hint =
        error.message.includes('column') || error.message.includes('schema cache')
          ? 'ensure_schema_v2.sql 재실행 필요 (case_intel JSONB 추가)'
          : undefined;
      return { ok: false, error: error.message, hint };
    }
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}

export async function updateCaseNotes(
  caseId: string,
  freeNotes: string,
): Promise<ActionResult> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { error } = await supabase
      .from('cases')
      .update({ free_notes: freeNotes })
      .eq('id', caseId)
      .eq('workspace_id', workspaceId);
    if (error) {
      const hint = error.message.includes('column') || error.message.includes('schema cache')
        ? 'ensure_schema_v2.sql 재실행 필요'
        : undefined;
      return { ok: false, error: error.message, hint };
    }
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}
