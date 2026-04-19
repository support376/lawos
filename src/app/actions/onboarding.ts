'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return { supabase, userId: user.id };
}

export async function closeCase(caseId: string, outcome?: string | null) {
  const { supabase } = await getContext();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('cases')
    .update({
      status: 'archived',
      stage: 'closed',
      closed_date: today,
      outcome: outcome ?? null,
    })
    .eq('id', caseId);
  if (error) throw error;

  const { data: caseRow } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', caseId)
    .maybeSingle();
  if (caseRow) {
    await supabase.from('events').insert({
      workspace_id: caseRow.workspace_id,
      source_type: 'milestone',
      raw_content: outcome ? `사건 종결: ${outcome}` : '사건 종결',
      occurred_at: new Date().toISOString(),
      client_id: caseRow.client_id,
      case_id: caseId,
      processed: true,
    });
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/cases');
  revalidatePath('/clients');
}

export async function reopenCase(caseId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase
    .from('cases')
    .update({
      status: 'active',
      stage: 'in_progress',
      closed_date: null,
      outcome: null,
    })
    .eq('id', caseId);
  if (error) throw error;

  const { data: caseRow } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', caseId)
    .maybeSingle();
  if (caseRow) {
    await supabase.from('events').insert({
      workspace_id: caseRow.workspace_id,
      source_type: 'milestone',
      raw_content: '사건 재개',
      occurred_at: new Date().toISOString(),
      client_id: caseRow.client_id,
      case_id: caseId,
      processed: true,
    });
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/cases');
}

export async function addMilestone(input: {
  caseId: string;
  date: string;
  summary: string;
}) {
  const { supabase } = await getContext();

  const { data: caseRow } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!caseRow) throw new Error('사건 없음');

  await supabase.from('events').insert({
    workspace_id: caseRow.workspace_id,
    source_type: 'milestone',
    raw_content: input.summary,
    occurred_at: `${input.date}T00:00:00+09:00`,
    client_id: caseRow.client_id,
    case_id: input.caseId,
    processed: true,
  });

  revalidatePath(`/cases/${input.caseId}`);
}
