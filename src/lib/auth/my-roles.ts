// 내 역할 조회 + 도메인×역할 권한 체크

import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/ontology/core/roles';

export type DomainKey = '*' | 'personal_rehab' | 'divorce' | 'criminal' | 'other';

export type PipelineView = 'consultant' | 'writer' | 'billing' | 'partner';

export interface MyRoleEntry {
  domain: DomainKey;
  role: Role;
}

export interface ViewOption {
  view: PipelineView;
  domain: DomainKey;
  label: string;
}

// 순수 데이터 (Client Component 전달 가능)
export interface MyRoleContext {
  userId: string;
  workspaceId: string;
  entries: MyRoleEntry[];
  isManagingPartner: boolean;
  accessibleDomains: DomainKey[];
  accessibleViews: ViewOption[];
}

export async function getMyRoleContext(): Promise<MyRoleContext | null> {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: m } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!m) return null;

  const { data: roles } = await supabase
    .from('workspace_member_roles')
    .select('domain, role')
    .eq('workspace_id', m.workspace_id)
    .eq('user_id', user.id);

  const entries = ((roles ?? []) as Array<{ domain: DomainKey; role: Role }>).map((r) => ({
    domain: r.domain,
    role: r.role,
  }));

  const isManagingPartner = entries.some((e) => e.role === 'managing_partner');
  const accessibleDomains = Array.from(new Set(entries.map((e) => e.domain)));

  const DOMAIN_LABEL: Record<DomainKey, string> = {
    '*': '전사',
    personal_rehab: '개인회생',
    divorce: '이혼',
    criminal: '형사',
    other: '기타',
  };

  const accessibleViews: ViewOption[] = [];
  const addIf = (view: PipelineView, domain: DomainKey, label: string) => {
    if (accessibleViews.some((v) => v.view === view && v.domain === domain)) return;
    accessibleViews.push({ view, domain, label });
  };

  for (const e of entries) {
    if (e.role === 'managing_partner') {
      addIf('partner', '*', '대표 · 전사');
      continue;
    }
    if (e.role === 'consultant') {
      addIf('consultant', e.domain, `상담팀 · ${DOMAIN_LABEL[e.domain]}`);
    }
    if (
      e.role === 'attorney' ||
      e.role === 'document_staff' ||
      e.role === 'analysis_staff' ||
      e.role === 'correction_staff'
    ) {
      addIf('writer', e.domain, `작성팀 · ${DOMAIN_LABEL[e.domain]}`);
    }
    if (e.role === 'billing_staff') {
      addIf('billing', e.domain, `재무팀 · ${DOMAIN_LABEL[e.domain]}`);
    }
  }

  return {
    userId: user.id,
    workspaceId: m.workspace_id,
    entries,
    isManagingPartner,
    accessibleDomains,
    accessibleViews,
  };
}

// 권한 체크 헬퍼 (순수 함수)
export function hasAnyRole(ctx: MyRoleContext, role: Role): boolean {
  return ctx.entries.some((e) => e.role === role);
}

export function hasRoleInDomain(
  ctx: MyRoleContext,
  domain: DomainKey,
  role: Role,
): boolean {
  return ctx.entries.some(
    (e) => e.role === role && (e.domain === domain || e.domain === '*'),
  );
}

export function canAccessView(
  ctx: MyRoleContext,
  view: PipelineView,
  domain: DomainKey,
): boolean {
  if (ctx.isManagingPartner) return true;
  return ctx.accessibleViews.some(
    (v) => v.view === view && (v.domain === domain || v.domain === '*'),
  );
}
