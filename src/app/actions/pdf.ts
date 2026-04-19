'use server';

import { revalidatePath } from 'next/cache';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import {
  EngagementLetterDoc,
  type EngagementLetterData,
} from '@/lib/pdf/engagement-letter';
import {
  CreditorNoticeDoc,
  DEFAULT_REHAB_NOTICE_BODY,
  type CreditorNoticeData,
} from '@/lib/pdf/creditor-notice';

const BUCKET = 'attachments';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) throw new Error('NO_WORKSPACE');

  return { supabase, userId: user.id, workspaceId: membership.workspace_id };
}

async function savePdfToStorage(
  buffer: Buffer,
  workspaceId: string,
  caseId: string,
  filename: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
) {
  const path = `${workspaceId}/case/${caseId}/${crypto.randomUUID()}-${filename}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf' });
  if (upErr) throw upErr;

  const { data, error: insErr } = await supabase
    .from('attachments')
    .insert({
      workspace_id: workspaceId,
      storage_path: path,
      original_name: filename,
      mime_type: 'application/pdf',
      size_bytes: buffer.length,
      case_id: caseId,
      uploaded_by: userId,
    })
    .select('id')
    .single();

  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw insErr;
  }

  return { attachmentId: data.id, path };
}

// ============ 수임계약서 생성 ============
export async function generateEngagementLetter(input: {
  caseId: string;
  retainerFee?: string | null;
  scope?: string | null;
  clientAddress?: string | null;
  lawFirmName?: string | null;
}) {
  const { supabase, workspaceId, userId } = await getContext();

  const { data: caseRow } = await supabase
    .from('cases')
    .select(`
      id, title, case_type,
      client:clients(id, name, email)
    `)
    .eq('id', input.caseId)
    .maybeSingle();
  if (!caseRow) throw new Error('사건 없음');

  const c = caseRow as unknown as {
    id: string;
    title: string;
    case_type: string | null;
    client: { name: string } | null;
  };
  if (!c.client) throw new Error('고객이 지정되지 않은 사건');

  const { data: me } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();
  const lawyerName = me?.name ?? '변호사';

  const caseTypeLabel: Record<string, string> = {
    personal_rehab: '개인회생',
    divorce: '이혼',
    criminal: '형사',
    other: '기타 민사',
  };

  const data: EngagementLetterData = {
    clientName: c.client.name,
    clientAddress: input.clientAddress ?? undefined,
    lawFirmName: input.lawFirmName ?? `${lawyerName} 법률사무소`,
    lawyerName,
    caseTitle: c.title,
    caseType: caseTypeLabel[c.case_type ?? 'other'] ?? c.case_type ?? '법률사건',
    retainerFee: input.retainerFee ?? undefined,
    scope:
      input.scope ??
      `${caseTypeLabel[c.case_type ?? 'other'] ?? c.case_type} 관련 사건의 신청서 작성, 법원 제출, 변론 및 관련 사무 일체`,
    date: new Date().toISOString().slice(0, 10),
  };

  const buffer = await renderToBuffer(EngagementLetterDoc(data));
  const result = await savePdfToStorage(
    Buffer.from(buffer as unknown as ArrayBuffer),
    workspaceId,
    input.caseId,
    `수임계약서_${c.client.name}_${data.date}.pdf`,
    userId,
    supabase,
  );

  // 이벤트 기록
  await supabase.from('events').insert({
    workspace_id: workspaceId,
    source_type: 'milestone',
    raw_content: `수임계약서 생성: ${data.date}`,
    occurred_at: new Date().toISOString(),
    case_id: input.caseId,
    processed: true,
    metadata: { attachment_id: result.attachmentId, action: 'engagement_letter' },
  });

  revalidatePath(`/cases/${input.caseId}`);
  return result;
}

// ============ 내용증명 (채권자 통보) ============
export async function generateCreditorNotice(input: {
  caseId: string;
  recipientName: string;      // 채권자명
  recipientAddress?: string | null;
  bodyOverride?: string | null;
  senderAddress?: string | null;
  lawFirmName?: string | null;
}) {
  const { supabase, workspaceId, userId } = await getContext();

  const { data: caseRow } = await supabase
    .from('cases')
    .select(`
      id, title,
      client:clients(id, name)
    `)
    .eq('id', input.caseId)
    .maybeSingle();
  if (!caseRow) throw new Error('사건 없음');

  const c = caseRow as unknown as {
    id: string;
    title: string;
    client: { name: string } | null;
  };
  if (!c.client) throw new Error('고객이 지정되지 않은 사건');

  const { data: me } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .maybeSingle();
  const lawyerName = me?.name ?? '변호사';

  const data: CreditorNoticeData = {
    senderName: c.client.name,
    senderAddress: input.senderAddress ?? undefined,
    lawyerName,
    lawFirmName: input.lawFirmName ?? `${lawyerName} 법률사무소`,
    recipientName: input.recipientName,
    recipientAddress: input.recipientAddress ?? undefined,
    debtorName: c.client.name,
    body: input.bodyOverride ?? DEFAULT_REHAB_NOTICE_BODY(c.client.name),
    date: new Date().toISOString().slice(0, 10),
  };

  const buffer = await renderToBuffer(CreditorNoticeDoc(data));
  const result = await savePdfToStorage(
    Buffer.from(buffer as unknown as ArrayBuffer),
    workspaceId,
    input.caseId,
    `내용증명_${input.recipientName}_${data.date}.pdf`,
    userId,
    supabase,
  );

  await supabase.from('events').insert({
    workspace_id: workspaceId,
    source_type: 'milestone',
    raw_content: `내용증명 생성: ${input.recipientName}`,
    occurred_at: new Date().toISOString(),
    case_id: input.caseId,
    processed: true,
    metadata: {
      attachment_id: result.attachmentId,
      recipient: input.recipientName,
      action: 'creditor_notice',
    },
  });

  revalidatePath(`/cases/${input.caseId}`);
  return result;
}
