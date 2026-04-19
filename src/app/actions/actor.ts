'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { getDomain } from '@/lib/ontology/registry';

async function getContext() {
  const supabase = await createSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  const { data: m } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!m) throw new Error('NO_WORKSPACE');
  return { supabase, userId: user.id, workspaceId: m.workspace_id };
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

/**
 * 도메인의 autoCreate=true single actor들을 사건에 자동 생성 (idempotent).
 * 개인회생: court / 이혼: spouse, family_court
 */
export async function ensureDomainActors(
  caseId: string,
  caseType: string | null,
  initialHints?: { courtName?: string | null },
): Promise<ActionResult> {
  const domain = getDomain(caseType);
  if (!domain) return { ok: true };

  try {
    const { supabase, workspaceId, userId } = await getContext();

    const { data: existing } = await supabase
      .from('case_counterparties')
      .select('role')
      .eq('case_id', caseId);
    const existingRoles = new Set((existing ?? []).map((r) => r.role));

    for (const actor of domain.actors) {
      if (!actor.autoCreate) continue;
      if (actor.cardinality !== 'single') continue;
      if (existingRoles.has(actor.role)) continue;

      const profile: Record<string, unknown> = {};
      if (actor.role === 'court' && initialHints?.courtName) {
        profile['court_name'] = initialHints.courtName;
      }
      if (actor.role === 'family_court' && initialHints?.courtName) {
        profile['court_name'] = initialHints.courtName;
      }

      await supabase.from('case_counterparties').insert({
        workspace_id: workspaceId,
        case_id: caseId,
        name: actor.label,
        role: actor.role,
        weight: actor.weight,
        profile,
        consent_recorded: true,
        consent_scope: 'domain auto-create (공적 역할)',
        consent_recorded_by: userId,
        consent_recorded_at: new Date().toISOString(),
        created_by: userId,
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'actor 자동 생성 실패' };
  }
}

/** Actor 인텔 (profile JSONB) 업데이트 */
export async function upsertActorIntel(input: {
  actorId: string;
  patch: Record<string, unknown>;
  caseId: string;
}): Promise<ActionResult> {
  try {
    const { supabase, workspaceId } = await getContext();
    const { data: cur } = await supabase
      .from('case_counterparties')
      .select('profile')
      .eq('id', input.actorId)
      .maybeSingle();
    const merged = { ...((cur?.profile as Record<string, unknown>) ?? {}), ...input.patch };
    const { error } = await supabase
      .from('case_counterparties')
      .update({ profile: merged, updated_at: new Date().toISOString() })
      .eq('id', input.actorId)
      .eq('workspace_id', workspaceId);
    if (error) {
      const hint = error.message.includes('column') || error.message.includes('schema cache')
        ? 'ensure_schema_v2.sql 재실행 필요'
        : undefined;
      return { ok: false, error: error.message, hint };
    }
    revalidatePath(`/cases/${input.caseId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '업데이트 실패' };
  }
}

/** 새 Actor 생성 (multiple cardinality: creditor, affair_partner 등) */
export async function createActor(input: {
  caseId: string;
  role: string;
  name: string;
  weight: 'primary' | 'secondary' | 'background';
  profile?: Record<string, unknown>;
  consentScope?: string;
}): Promise<ActionResult & { actorId?: string }> {
  try {
    const { supabase, workspaceId, userId } = await getContext();
    const name = input.name.trim();
    if (!name) return { ok: false, error: '이름 필수' };

    const { data, error } = await supabase
      .from('case_counterparties')
      .insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        name,
        role: input.role,
        weight: input.weight,
        profile: input.profile ?? {},
        consent_recorded: !!input.consentScope,
        consent_scope: input.consentScope ?? null,
        consent_recorded_by: input.consentScope ? userId : null,
        consent_recorded_at: input.consentScope ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/cases/${input.caseId}`);
    return { ok: true, actorId: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '생성 실패' };
  }
}
