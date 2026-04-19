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

export interface WeaknessEntry {
  label: string;
  source_type?: 'public_record' | 'interview' | 'detective' | 'news' | 'sns_public' | 'client_provided' | 'other';
  legality?: 'clear_legal' | 'requires_judgment';
  notes?: string;
  added_at?: string;
  added_by?: string;
}

export interface CounterpartyProfileJson {
  weaknesses?: WeaknessEntry[];
  personality_tags?: string[];
  resources?: Record<string, unknown>;
  relationships?: Array<{ role: string; name: string; relevance?: string }>;
}

// ============ 상대방 생성 (의뢰인 동의 필수) ============
export async function createCounterparty(input: {
  caseId: string;
  name: string;
  role?: string | null;
  description?: string | null;
  consentScope: string;      // 예: "공개정보 + 합법 탐정조사 범위"
}) {
  const { supabase, workspaceId, userId } = await getContext();
  const name = input.name.trim();
  if (!name) throw new Error('이름 필수');
  if (!input.consentScope.trim()) {
    throw new Error(
      '의뢰인 동의 범위 명시 필수 (개인정보보호법 §15/17, 변호사법 §26 준수).',
    );
  }

  const { data, error } = await supabase
    .from('case_counterparties')
    .insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      name,
      role: input.role,
      description: input.description,
      profile: { weaknesses: [], personality_tags: [] },
      consent_recorded: true,
      consent_recorded_at: new Date().toISOString(),
      consent_recorded_by: userId,
      consent_scope: input.consentScope,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error) throw error;

  // 이력
  await supabase.from('events').insert({
    workspace_id: workspaceId,
    source_type: 'milestone',
    raw_content: `상대방 프로필 생성: ${name} (${input.role ?? '역할 미지정'})`,
    occurred_at: new Date().toISOString(),
    case_id: input.caseId,
    processed: true,
    metadata: {
      action: 'counterparty_created',
      counterparty_id: data.id,
      consent_scope: input.consentScope,
    },
  });

  revalidatePath(`/cases/${input.caseId}`);
  return data;
}

export async function updateCounterpartyProfile(
  counterpartyId: string,
  patch: {
    name?: string;
    role?: string | null;
    description?: string | null;
    profile?: CounterpartyProfileJson;
  },
) {
  const { supabase } = await getContext();
  const { error } = await supabase
    .from('case_counterparties')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', counterpartyId);
  if (error) throw error;

  const { data } = await supabase
    .from('case_counterparties')
    .select('case_id')
    .eq('id', counterpartyId)
    .maybeSingle();
  if (data) revalidatePath(`/cases/${data.case_id}`);
}

export async function addWeakness(input: {
  counterpartyId: string;
  weakness: WeaknessEntry;
}) {
  const { supabase, userId } = await getContext();

  // 불법 출처 차단
  const illegalSources = ['wiretap', 'hacking', 'stalking', 'bribery'];
  if (
    input.weakness.source_type &&
    illegalSources.includes(input.weakness.source_type)
  ) {
    throw new Error('불법 출처는 시스템에 기록 불가 (가드레일 차단)');
  }

  const { data: cur } = await supabase
    .from('case_counterparties')
    .select('profile, case_id, workspace_id')
    .eq('id', input.counterpartyId)
    .maybeSingle();
  if (!cur) throw new Error('상대방 없음');

  const profile = (cur.profile ?? { weaknesses: [] }) as CounterpartyProfileJson;
  const entry: WeaknessEntry = {
    ...input.weakness,
    added_at: new Date().toISOString(),
    added_by: userId,
  };
  profile.weaknesses = [...(profile.weaknesses ?? []), entry];

  await supabase
    .from('case_counterparties')
    .update({ profile, updated_at: new Date().toISOString() })
    .eq('id', input.counterpartyId);

  revalidatePath(`/cases/${cur.case_id}`);
}

// ============ 전술 채택 ============
export async function adoptTactic(input: {
  caseId: string;
  tacticKey: string;
  counterpartyId?: string | null;
  notes?: string | null;
}) {
  const { supabase, userId, workspaceId } = await getContext();

  const { data, error } = await supabase
    .from('case_tactics_adopted')
    .insert({
      workspace_id: workspaceId,
      case_id: input.caseId,
      tactic_key: input.tacticKey,
      counterparty_id: input.counterpartyId ?? null,
      adopted_by: userId,
      notes: input.notes ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  // 이력
  const { TACTICS } = await import('@/lib/ontology/tactics');
  const t = TACTICS[input.tacticKey];
  await supabase.from('events').insert({
    workspace_id: workspaceId,
    source_type: 'milestone',
    raw_content: `전술 채택: ${t?.name ?? input.tacticKey}`,
    occurred_at: new Date().toISOString(),
    case_id: input.caseId,
    processed: true,
    metadata: {
      action: 'tactic_adopted',
      tactic_key: input.tacticKey,
      tactic_name: t?.name,
      adopted_id: data.id,
    },
  });

  revalidatePath(`/cases/${input.caseId}`);
  return data;
}

export async function updateAdoptedTactic(input: {
  adoptedId: string;
  status?: 'planned' | 'executing' | 'completed' | 'abandoned';
  outcome?: string | null;
  notes?: string | null;
}) {
  const { supabase } = await getContext();
  const patch: Record<string, unknown> = {};
  if (input.status) {
    patch.status = input.status;
    if (input.status === 'completed') patch.completed_at = new Date().toISOString();
  }
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { error } = await supabase
    .from('case_tactics_adopted')
    .update(patch)
    .eq('id', input.adoptedId);
  if (error) throw error;

  const { data } = await supabase
    .from('case_tactics_adopted')
    .select('case_id')
    .eq('id', input.adoptedId)
    .maybeSingle();
  if (data) revalidatePath(`/cases/${data.case_id}`);
}
