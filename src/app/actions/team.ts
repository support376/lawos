'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) throw new Error('NO_WORKSPACE');

  return {
    supabase,
    userId: user.id,
    userEmail: user.email,
    workspaceId: membership.workspace_id,
    role: membership.role as 'owner' | 'admin' | 'member',
  };
}

async function requireAdmin() {
  const ctx = await getContext();
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw new Error('권한 없음 (owner/admin만 가능)');
  }
  return ctx;
}

// ============ 팀 멤버 조회 ============
export async function listTeamMembers() {
  const { supabase, workspaceId } = await getContext();
  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      role,
      user:users(id, name, email, auth_provider)
    `)
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return (data ?? []) as unknown as Array<{
    role: 'owner' | 'admin' | 'member';
    user: { id: string; name: string | null; email: string; auth_provider: string | null };
  }>;
}

export async function listPendingInvites() {
  const { supabase, workspaceId } = await getContext();
  const { data } = await supabase
    .from('workspace_invites')
    .select(`
      id, email, role, invited_at,
      invited_by_user:users!workspace_invites_invited_by_fkey(id, name, email)
    `)
    .eq('workspace_id', workspaceId)
    .is('accepted_at', null)
    .order('invited_at', { ascending: false });
  return (data ?? []) as unknown as Array<{
    id: string;
    email: string;
    role: string;
    invited_at: string;
    invited_by_user: { id: string; name: string | null; email: string } | null;
  }>;
}

// ============ 초대 ============
export async function inviteMember(input: {
  email: string;
  role: 'admin' | 'member';
}) {
  const { supabase, workspaceId, userId } = await requireAdmin();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('올바른 이메일 형식이 아닙니다');
  }

  // 이미 가입 + 멤버인지 확인
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existingUser) {
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', existingUser.id)
      .maybeSingle();
    if (existingMember) {
      throw new Error('이미 워크스페이스 멤버입니다');
    }
    // 기존 가입자 → 바로 멤버로 추가
    const { error: addErr } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: existingUser.id,
        role: input.role,
      });
    if (addErr) throw addErr;
    revalidatePath('/settings/team');
    return { kind: 'added' as const };
  }

  // 초대 기록 upsert
  const { error: inviteErr } = await supabase
    .from('workspace_invites')
    .upsert(
      {
        workspace_id: workspaceId,
        email,
        role: input.role,
        invited_by: userId,
        accepted_at: null,
        invited_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,email' },
    );
  if (inviteErr) throw inviteErr;

  // Supabase Admin API로 초대 메일 발송
  const admin = createAdminClient();
  const origin = (await headers()).get('origin') ?? 'https://lawos-rho.vercel.app';
  const { error: mailErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/kanban`,
  });

  // 메일 발송 실패해도 초대 레코드는 유지 (수동 링크 공유 가능)
  const mailSent = !mailErr;

  revalidatePath('/settings/team');
  return { kind: 'invited' as const, mailSent, mailError: mailErr?.message };
}

export async function cancelInvite(inviteId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('id', inviteId);
  if (error) throw error;
  revalidatePath('/settings/team');
}

export async function resendInvite(inviteId: string) {
  const { supabase, workspaceId } = await requireAdmin();
  const { data: inv } = await supabase
    .from('workspace_invites')
    .select('email')
    .eq('id', inviteId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!inv) throw new Error('초대 없음');

  const admin = createAdminClient();
  const origin = (await headers()).get('origin') ?? 'https://lawos-rho.vercel.app';
  const { error } = await admin.auth.admin.inviteUserByEmail(inv.email, {
    redirectTo: `${origin}/auth/callback?next=/kanban`,
  });

  await supabase
    .from('workspace_invites')
    .update({ invited_at: new Date().toISOString() })
    .eq('id', inviteId);

  revalidatePath('/settings/team');
  return { mailSent: !error, mailError: error?.message };
}

// ============ 멤버 관리 ============
export async function removeMember(targetUserId: string) {
  const { supabase, workspaceId, userId } = await requireAdmin();

  // owner는 자기 자신 제거 못함
  const { data: target } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (!target) throw new Error('해당 멤버가 없습니다');
  if (target.role === 'owner') throw new Error('owner는 제거할 수 없습니다');
  if (targetUserId === userId) throw new Error('본인은 제거할 수 없습니다');

  const { error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);
  if (error) throw error;
  revalidatePath('/settings/team');
}

export async function updateMemberRole(
  targetUserId: string,
  role: 'admin' | 'member',
) {
  const { supabase, workspaceId } = await requireAdmin();

  const { data: target } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (!target) throw new Error('해당 멤버가 없습니다');
  if (target.role === 'owner') throw new Error('owner 역할은 변경할 수 없습니다');

  const { error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);
  if (error) throw error;
  revalidatePath('/settings/team');
}

// ============ 티켓/사건 담당자 ============
export async function assignTicket(ticketId: string, assignToUserId: string | null) {
  const { supabase, workspaceId } = await getContext();

  // assignee가 같은 워크스페이스 멤버인지 확인
  if (assignToUserId) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', assignToUserId)
      .maybeSingle();
    if (!member) throw new Error('워크스페이스 멤버만 담당 가능');
  }

  const { error } = await supabase
    .from('tickets')
    .update({ assigned_to: assignToUserId })
    .eq('id', ticketId);
  if (error) throw error;
  revalidatePath('/kanban');
  revalidatePath('/today');
}

export async function updateCaseVisibility(
  caseId: string,
  visibility: 'workspace' | 'assigned_only' | 'owner_only',
) {
  const { supabase } = await getContext();
  const { error } = await supabase
    .from('cases')
    .update({ visibility })
    .eq('id', caseId);
  if (error) throw error;
  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
}

export async function assignCase(caseId: string, assignToUserId: string | null) {
  const { supabase, workspaceId } = await getContext();

  if (assignToUserId) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', assignToUserId)
      .maybeSingle();
    if (!member) throw new Error('워크스페이스 멤버만 담당 가능');
  }

  const { error } = await supabase
    .from('cases')
    .update({ assigned_to: assignToUserId })
    .eq('id', caseId);
  if (error) throw error;
  revalidatePath('/cases');
  revalidatePath(`/cases/${caseId}`);
  revalidatePath('/clients');
}
