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

export async function createClientRecord(formData: FormData): Promise<{ id: string; name: string }> {
  const { supabase, workspaceId } = await getContext();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('이름 필수');
  const phone = (formData.get('phone') as string | null) || null;
  const email = (formData.get('email') as string | null) || null;

  const { data, error } = await supabase
    .from('clients')
    .insert({ workspace_id: workspaceId, name, phone, email })
    .select('id, name')
    .single();
  if (error) throw error;
  revalidatePath('/clients');
  return data;
}

export async function createCase(formData: FormData): Promise<{ id: string; title: string }> {
  const { supabase, workspaceId, userId } = await getContext();
  const client_id = String(formData.get('client_id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const case_type = (formData.get('case_type') as string | null) || null;
  const case_number = (formData.get('case_number') as string | null) || null;
  const court = (formData.get('court') as string | null) || null;
  const opposing_party = (formData.get('opposing_party') as string | null) || null;
  const retainer_date = (formData.get('retainer_date') as string | null) || null;

  if (!client_id || !title) throw new Error('고객과 사건명 필수');

  const { data, error } = await supabase
    .from('cases')
    .insert({
      workspace_id: workspaceId,
      client_id,
      title,
      case_type,
      case_number,
      court,
      opposing_party,
      retainer_date,
      status: 'active',
      stage: 'initial',
      assigned_to: userId,
    })
    .select('id, title')
    .single();
  if (error) throw error;

  revalidatePath('/cases');
  revalidatePath('/clients');
  return data;
}
