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

export interface DocTypeDef {
  id: string;
  domain: string;
  key: string;
  label: string;
  required: boolean;
  source: string | null;
  category: string | null;
  used_in_stages: string[];
}

export interface CaseDocStatus {
  doc_type_key: string;
  doc_id: string | null;
  uploaded: boolean;
  verified: boolean;
  attachment_id: string | null;
  updated_at: string | null;
}

export async function listCaseDocumentChecklist(
  caseId: string,
  domain: string,
): Promise<Array<DocTypeDef & CaseDocStatus>> {
  const { supabase, workspaceId } = await getContext();

  const [defsRes, docsRes] = await Promise.all([
    supabase
      .from('document_type_definitions')
      .select('*')
      .eq('domain', domain),
    supabase
      .from('rehab_documents')
      .select('id, doc_type, uploaded, verified, attachment_id, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('case_id', caseId),
  ]);

  const defs = (defsRes.data ?? []) as DocTypeDef[];
  const docs = (docsRes.data ?? []) as Array<{
    id: string; doc_type: string; uploaded: boolean; verified: boolean;
    attachment_id: string | null; updated_at: string;
  }>;
  const docMap = new Map(docs.map((d) => [d.doc_type, d]));

  return defs
    .sort((a, b) => {
      // required 우선, 그 다음 category
      if (a.required !== b.required) return a.required ? -1 : 1;
      return (a.category ?? '').localeCompare(b.category ?? '');
    })
    .map((def) => {
      const doc = docMap.get(def.key);
      return {
        ...def,
        doc_type_key: def.key,
        doc_id: doc?.id ?? null,
        uploaded: doc?.uploaded ?? false,
        verified: doc?.verified ?? false,
        attachment_id: doc?.attachment_id ?? null,
        updated_at: doc?.updated_at ?? null,
      };
    });
}

export async function setDocumentStatus(input: {
  caseId: string;
  docTypeKey: string;
  label: string;
  required: boolean;
  uploaded?: boolean;
  verified?: boolean;
  attachmentId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase, workspaceId } = await getContext();

    // 기존 row 있나
    const { data: existing } = await supabase
      .from('rehab_documents')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('case_id', input.caseId)
      .eq('doc_type', input.docTypeKey)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.uploaded !== undefined) patch.uploaded = input.uploaded;
    if (input.verified !== undefined) patch.verified = input.verified;
    if (input.attachmentId !== undefined) patch.attachment_id = input.attachmentId;

    if (existing) {
      const { error } = await supabase
        .from('rehab_documents')
        .update(patch)
        .eq('id', existing.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from('rehab_documents').insert({
        workspace_id: workspaceId,
        case_id: input.caseId,
        doc_type: input.docTypeKey,
        label: input.label,
        required: input.required,
        uploaded: input.uploaded ?? false,
        verified: input.verified ?? false,
        attachment_id: input.attachmentId ?? null,
      });
      if (error) return { ok: false, error: error.message };
    }
    revalidatePath('/workflow');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '저장 실패' };
  }
}
