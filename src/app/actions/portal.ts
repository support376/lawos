'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';

const TOKEN_VALIDITY_DAYS = 14;

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

function generateToken(): string {
  // URL-safe random 32 bytes
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 48);
}

export async function createPortalLink(caseId: string): Promise<{
  token: string;
  url: string;
  expiresAt: string;
}> {
  const { supabase, userId, workspaceId } = await getContext();

  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, client_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) throw new Error('사건 없음');

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  );

  const { error } = await supabase.from('client_portal_tokens').insert({
    token,
    workspace_id: workspaceId,
    case_id: caseId,
    client_id: caseRow.client_id,
    created_by: userId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;

  const origin =
    (await headers()).get('origin') ?? 'https://lawos-rho.vercel.app';
  const url = `${origin}/portal/${token}`;

  revalidatePath(`/cases/${caseId}`);
  return { token, url, expiresAt: expiresAt.toISOString() };
}

export async function sendPortalLinkEmail(caseId: string): Promise<{
  sent: boolean;
  url: string;
  mocked?: boolean;
  error?: string;
}> {
  const { supabase } = await getContext();
  const { data: caseRow } = await supabase
    .from('cases')
    .select(`
      id, title,
      client:clients(id, name, email)
    `)
    .eq('id', caseId)
    .maybeSingle();
  if (!caseRow) throw new Error('사건 없음');

  const c = caseRow as unknown as {
    id: string;
    title: string;
    client: { name: string; email: string | null } | null;
  };
  if (!c.client?.email) throw new Error('고객 이메일이 없습니다');

  const link = await createPortalLink(caseId);

  const body = `${c.client.name}님 안녕하세요.

${c.title} 관련하여 필요한 서류를 아래 링크에서 업로드해주시기 바랍니다.

▸ 안전 업로드 링크
${link.url}

※ 링크는 ${TOKEN_VALIDITY_DAYS}일간 유효합니다.
※ 로그인 없이 사용 가능합니다.
※ 업로드한 파일은 즉시 변호사에게 전달됩니다.

감사합니다.`;

  const result = await sendEmail({
    to: c.client.email,
    subject: `[서류 업로드 안내] ${c.title}`,
    text: body,
  });

  return {
    sent: !result.error,
    url: link.url,
    mocked: result.mocked,
    error: result.error ?? undefined,
  };
}

export async function revokePortalLink(tokenId: string) {
  const { supabase } = await getContext();
  await supabase
    .from('client_portal_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId);
}

// ============ 포털 업로드 (퍼블릭 엔드포인트에서 호출) ============
// Note: admin client로 RLS 우회, 토큰 검증 후 삽입
export async function uploadViaPortal(input: {
  token: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string; // 이미 업로드된 스토리지 경로
}) {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: tok } = await admin
    .from('client_portal_tokens')
    .select('id, workspace_id, case_id, client_id, expires_at, revoked_at')
    .eq('token', input.token)
    .maybeSingle();
  if (!tok) throw new Error('유효하지 않은 링크');
  if (tok.revoked_at) throw new Error('해지된 링크');
  if (new Date(tok.expires_at) < new Date()) throw new Error('만료된 링크');

  await admin.from('attachments').insert({
    workspace_id: tok.workspace_id,
    storage_path: input.storagePath,
    original_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    case_id: tok.case_id,
    client_id: tok.client_id,
    uploaded_by: null,
  });

  await admin
    .from('client_portal_tokens')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: (tok as unknown as { access_count?: number }).access_count
        ? undefined
        : 1,
    })
    .eq('id', tok.id);

  // 이벤트 기록
  await admin.from('events').insert({
    workspace_id: tok.workspace_id,
    source_type: 'import',
    raw_content: `고객 포털에서 업로드: ${input.fileName}`,
    occurred_at: new Date().toISOString(),
    client_id: tok.client_id,
    case_id: tok.case_id,
    processed: true,
    metadata: { via: 'portal', file: input.fileName },
  });

  return { caseId: tok.case_id, clientId: tok.client_id };
}
