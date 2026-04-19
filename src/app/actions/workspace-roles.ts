'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/ontology/core/roles';
import type { DomainKey } from '@/lib/auth/my-roles';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  const { data: m } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!m) throw new Error('NO_WORKSPACE');
  return { supabase, userId: user.id, workspaceId: m.workspace_id, wsRole: m.role };
}

async function assertCanManageRoles(ctx: Awaited<ReturnType<typeof getContext>>) {
  // owner / admin (기존 ws-level) + managing_partner (신규 도메인 레벨)
  if (ctx.wsRole === 'owner' || ctx.wsRole === 'admin') return;
  const { data } = await ctx.supabase
    .from('workspace_member_roles')
    .select('role')
    .eq('workspace_id', ctx.workspaceId)
    .eq('user_id', ctx.userId)
    .eq('role', 'managing_partner')
    .maybeSingle();
  if (!data) throw new Error('역할 관리 권한 없음');
}

export interface WorkspaceRoleEntry {
  user_id: string;
  domain: DomainKey;
  role: Role;
  granted_at: string;
}

export async function listAllRoles(): Promise<WorkspaceRoleEntry[]> {
  const ctx = await getContext();
  const { data } = await ctx.supabase
    .from('workspace_member_roles')
    .select('user_id, domain, role, granted_at')
    .eq('workspace_id', ctx.workspaceId);
  return (data ?? []) as WorkspaceRoleEntry[];
}

export async function grantRole(input: {
  userId: string;
  domain: DomainKey;
  role: Role;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await getContext();
    await assertCanManageRoles(ctx);
    const { error } = await ctx.supabase.from('workspace_member_roles').insert({
      workspace_id: ctx.workspaceId,
      user_id: input.userId,
      domain: input.domain,
      role: input.role,
      granted_by: ctx.userId,
    });
    if (error && !error.message.includes('duplicate')) return { ok: false, error: error.message };
    revalidatePath('/settings/team');
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '부여 실패' };
  }
}

export async function revokeRole(input: {
  userId: string;
  domain: DomainKey;
  role: Role;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await getContext();
    await assertCanManageRoles(ctx);

    // Safety: 마지막 managing_partner 제거 방지
    if (input.role === 'managing_partner') {
      const { data: mp } = await ctx.supabase
        .from('workspace_member_roles')
        .select('user_id')
        .eq('workspace_id', ctx.workspaceId)
        .eq('role', 'managing_partner');
      const count = (mp ?? []).length;
      if (count <= 1) {
        return { ok: false, error: '마지막 대표변호사는 제거할 수 없습니다' };
      }
    }

    const { error } = await ctx.supabase
      .from('workspace_member_roles')
      .delete()
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', input.userId)
      .eq('domain', input.domain)
      .eq('role', input.role);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/settings/team');
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '해제 실패' };
  }
}

// 초기 설정 헬퍼: 본인이 아무 role도 없으면 managing_partner 부여 (부트스트랩)
export async function bootstrapSelfAsManagingPartner(): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await getContext();
    const { data: any_role } = await ctx.supabase
      .from('workspace_member_roles')
      .select('role')
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', ctx.userId)
      .limit(1);
    if ((any_role ?? []).length > 0) {
      return { ok: false, error: '이미 역할이 부여되어 있습니다' };
    }
    // 워크스페이스에 아무 managing_partner도 없으면 본인에게 부여 (owner만)
    if (ctx.wsRole !== 'owner') {
      return { ok: false, error: '소유자만 부트스트랩 가능' };
    }
    const { error } = await ctx.supabase.from('workspace_member_roles').insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      domain: '*',
      role: 'managing_partner',
      granted_by: ctx.userId,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath('/settings/team');
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '부트스트랩 실패' };
  }
}
