'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type {
  Communication,
  CommChannel,
  CommDirection,
  CommunicationSubject,
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

export async function logCommunication(input: {
  subject_type: CommunicationSubject;
  subject_id: string;
  channel: CommChannel;
  direction: CommDirection;
  content: string;
  summary?: string | null;
  duration_seconds?: number | null;
  occurred_at?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();
    const { data, error } = await supabase
      .from('communications')
      .insert({
        workspace_id: workspaceId,
        subject_type: input.subject_type,
        subject_id: input.subject_id,
        channel: input.channel,
        direction: input.direction,
        content: input.content,
        summary: input.summary ?? null,
        duration_seconds: input.duration_seconds ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        logged_by: userId,
      })
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };

    // Lead의 last_contact_at 갱신
    if (input.subject_type === 'lead') {
      await supabase
        .from('leads')
        .update({ last_contact_at: new Date().toISOString(), status: 'contacted' })
        .eq('id', input.subject_id)
        .eq('workspace_id', workspaceId)
        .eq('status', 'new');
      await supabase
        .from('leads')
        .update({ last_contact_at: new Date().toISOString() })
        .eq('id', input.subject_id)
        .eq('workspace_id', workspaceId)
        .neq('status', 'new');
    }

    revalidatePath('/workflow');
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '기록 실패' };
  }
}

export async function listCommunications(input: {
  subject_type: CommunicationSubject;
  subject_id: string;
  limit?: number;
}): Promise<Communication[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('communications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('subject_type', input.subject_type)
    .eq('subject_id', input.subject_id)
    .order('occurred_at', { ascending: false })
    .limit(input.limit ?? 50);
  return (data ?? []) as Communication[];
}
