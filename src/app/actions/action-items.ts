'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type { ActionRecord, ActionStatus, SubjectType } from '@/lib/ontology/core/objects';
import type { Role } from '@/lib/ontology/core/roles';

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

export async function createActionItem(input: {
  subject_type: SubjectType;
  subject_id: string;
  action_type: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  team_role?: Role | null;
  due_date?: string | null;
  priority?: 1 | 2 | 3 | 4;
  payload?: Record<string, unknown>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();
    const { data, error } = await supabase
      .from('actions')
      .insert({
        workspace_id: workspaceId,
        subject_type: input.subject_type,
        subject_id: input.subject_id,
        action_type: input.action_type,
        title: input.title,
        description: input.description ?? null,
        assigned_to: input.assigned_to ?? null,
        team_role: input.team_role ?? null,
        due_date: input.due_date ?? null,
        status: 'pending',
        priority: input.priority ?? 3,
        payload: input.payload ?? {},
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

export async function updateActionStatus(input: {
  id: string;
  status: ActionStatus;
  blocking_reason?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, userId, workspaceId } = await getContext();
    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date().toISOString(),
    };
    if (input.status === 'done') {
      patch.completed_by = userId;
      patch.completed_at = new Date().toISOString();
    }
    if (input.status === 'blocked' && input.blocking_reason) {
      patch.blocking_reason = input.blocking_reason;
    }
    const { error } = await supabase
      .from('actions')
      .update(patch)
      .eq('id', input.id)
      .eq('workspace_id', workspaceId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '수정 실패' };
  }
}

export async function listCaseActions(caseId: string): Promise<ActionRecord[]> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('actions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('subject_type', 'case')
    .eq('subject_id', caseId)
    .order('created_at', { ascending: false });
  return (data ?? []) as ActionRecord[];
}

export async function listWorkspaceMembers(): Promise<Array<{ id: string; name: string | null; email: string }>> {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('workspace_members')
    .select('user:users(id, name, email)')
    .eq('workspace_id', workspaceId);
  return ((data ?? []) as unknown as Array<{
    user: { id: string; name: string | null; email: string };
  }>).map((r) => r.user);
}
