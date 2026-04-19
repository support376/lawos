'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

const BUCKET = 'attachments';
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

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

export interface AttachmentTarget {
  ticketId?: string;
  caseId?: string;
  eventId?: string;
  clientId?: string;
}

// FormData로 받아서 Storage 업로드 + metadata 저장 + AI 자동분류 (caseId 있을 때)
export async function uploadAttachment(formData: FormData) {
  const { supabase, userId, workspaceId } = await getContext();

  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('파일이 없습니다');
  if (file.size === 0) throw new Error('빈 파일입니다');
  if (file.size > MAX_SIZE) throw new Error('파일이 너무 큽니다 (최대 20MB)');

  const ticketId = (formData.get('ticketId') as string | null) || null;
  const caseId = (formData.get('caseId') as string | null) || null;
  const eventId = (formData.get('eventId') as string | null) || null;
  const clientId = (formData.get('clientId') as string | null) || null;

  const targets = [ticketId, caseId, eventId, clientId].filter(Boolean);
  if (targets.length !== 1) throw new Error('첨부 대상이 정확히 1개여야 합니다');

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const uuid = crypto.randomUUID();
  const parent =
    ticketId ? `ticket/${ticketId}` :
    caseId ? `case/${caseId}` :
    eventId ? `event/${eventId}` :
    `client/${clientId}`;
  const path = `${workspaceId}/${parent}/${uuid}.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (upErr) throw upErr;

  const { data: attachmentRow, error: insErr } = await supabase
    .from('attachments')
    .insert({
      workspace_id: workspaceId,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      ticket_id: ticketId,
      case_id: caseId,
      event_id: eventId,
      client_id: clientId,
      uploaded_by: userId,
    })
    .select('id')
    .single();

  if (insErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw insErr;
  }

  // case 첨부면 AI 자동분류 시도
  if (caseId && attachmentRow) {
    try {
      const { classifyUploadedDoc } = await import('@/lib/ai/classify');
      const result = await classifyUploadedDoc({
        fileName: file.name,
        mimeType: file.type,
      });
      if (result.matched_doc_key && result.confidence >= 0.7) {
        // workflow_docs 상태 업데이트
        const { data: caseRow } = await supabase
          .from('cases')
          .select('workflow_docs')
          .eq('id', caseId)
          .maybeSingle();
        const docs = (caseRow?.workflow_docs ?? {}) as Record<
          string,
          { status?: string; attachment_ids?: string[]; received_at?: string }
        >;
        const prev = docs[result.matched_doc_key] ?? {};
        docs[result.matched_doc_key] = {
          ...prev,
          status: 'received',
          received_at: prev.received_at ?? new Date().toISOString(),
          attachment_ids: [
            ...(prev.attachment_ids ?? []),
            attachmentRow.id,
          ],
        };
        await supabase
          .from('cases')
          .update({ workflow_docs: docs })
          .eq('id', caseId);
      }
    } catch (e) {
      console.warn('[upload] AI 분류 실패:', e);
    }
  }

  revalidatePath('/kanban');
  if (caseId) revalidatePath(`/cases/${caseId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function listAttachments(target: AttachmentTarget) {
  const { supabase } = await getContext();
  let q = supabase
    .from('attachments')
    .select('id, storage_path, original_name, mime_type, size_bytes, created_at, uploaded_by')
    .order('created_at', { ascending: false });

  if (target.ticketId) q = q.eq('ticket_id', target.ticketId);
  else if (target.caseId) q = q.eq('case_id', target.caseId);
  else if (target.eventId) q = q.eq('event_id', target.eventId);
  else if (target.clientId) q = q.eq('client_id', target.clientId);
  else return [];

  const { data } = await q;
  return data ?? [];
}

// 서명된 다운로드 URL 생성 (1시간 유효)
export async function getAttachmentUrl(attachmentId: string) {
  const { supabase } = await getContext();
  const { data: a } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!a) throw new Error('파일 없음');

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(a.storage_path, 3600);
  if (error) throw error;
  return signed.signedUrl;
}

export async function deleteAttachment(attachmentId: string) {
  const { supabase } = await getContext();
  const { data: a } = await supabase
    .from('attachments')
    .select('storage_path, ticket_id, case_id, client_id')
    .eq('id', attachmentId)
    .maybeSingle();
  if (!a) throw new Error('파일 없음');

  await supabase.storage.from(BUCKET).remove([a.storage_path]);
  await supabase.from('attachments').delete().eq('id', attachmentId);

  revalidatePath('/kanban');
  if (a.case_id) revalidatePath(`/cases/${a.case_id}`);
  if (a.client_id) revalidatePath(`/clients/${a.client_id}`);
}
