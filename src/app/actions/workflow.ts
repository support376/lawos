'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { getTemplate } from '@/lib/ontology/templates';
import { DOCUMENTS } from '@/lib/ontology/documents';
import { ACTIONS } from '@/lib/ontology/actions';
import type { WorkflowDocs, DocStatus, StageHistoryEntry } from '@/lib/ontology/types';

async function getContext() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return { supabase, userId: user.id };
}

// ============ 사건 워크플로우 초기화 (throw 금지 — 항상 Result 반환) ============
export interface InitResult {
  ok: boolean;
  error: string | null;
  hint?: string;
}

export async function initializeWorkflow(caseId: string): Promise<InitResult> {
  let supabase;
  let userId: string;
  try {
    const ctx = await getContext();
    supabase = ctx.supabase;
    userId = ctx.userId;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '인증/워크스페이스 조회 실패',
    };
  }

  const { data: c, error } = await supabase
    .from('cases')
    .select('id, case_type')
    .eq('id', caseId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: `사건 조회 실패: ${error.message}` };
  }
  if (!c) return { ok: false, error: '사건을 찾을 수 없습니다' };
  if (!c.case_type) {
    return { ok: false, error: '사건 유형이 지정되지 않음' };
  }

  const template = getTemplate(c.case_type);
  if (!template) {
    return {
      ok: false,
      error: `템플릿이 없습니다: ${c.case_type}`,
      hint:
        '개인회생만 V1 템플릿 제공 중. 이혼/형사는 추후 추가 예정. 다른 분야 사건은 수동 관리 필요.',
    };
  }

  const firstStage = template.stages[0];
  const now = new Date().toISOString();

  const docs: WorkflowDocs = {};
  for (const docKey of template.document_keys) {
    docs[docKey] = { status: 'missing' };
  }

  const history: StageHistoryEntry[] = [
    { stage: firstStage.key, entered_at: now },
  ];

  const { error: updErr } = await supabase
    .from('cases')
    .update({
      workflow_stage: firstStage.key,
      workflow_docs: docs,
      workflow_history: history,
      workflow_template_version: template.version,
    })
    .eq('id', caseId);

  if (updErr) {
    console.error('[initializeWorkflow] update failed:', updErr);
    return {
      ok: false,
      error: `DB 업데이트 실패: ${updErr.message}`,
      hint:
        'workflow_stage / workflow_docs / workflow_history 컬럼이 아직 없습니다. Supabase SQL Editor에서 ensure_schema_v2.sql을 실행하세요.',
    };
  }

  // events 기록 (실패해도 워크플로우 자체는 성공)
  try {
    const { data: ctx } = await supabase
      .from('cases')
      .select('workspace_id, client_id')
      .eq('id', caseId)
      .maybeSingle();
    if (ctx) {
      await supabase.from('events').insert({
        workspace_id: ctx.workspace_id,
        source_type: 'milestone',
        raw_content: `워크플로우 시작: ${template.name} (${firstStage.label})`,
        occurred_at: now,
        client_id: ctx.client_id,
        case_id: caseId,
        processed: true,
        metadata: {
          action: 'workflow_initialized',
          template: c.case_type,
          by: userId,
        },
      });
    }
  } catch (e) {
    console.warn('[initializeWorkflow] events 기록 실패 (무시):', e);
  }

  revalidatePath(`/cases/${caseId}`);
  return { ok: true, error: null };
}

// ============ 서류 상태 업데이트 ============
export async function setDocStatus(
  caseId: string,
  docKey: string,
  status: DocStatus,
) {
  const { supabase } = await getContext();
  const { data: c } = await supabase
    .from('cases')
    .select('workflow_docs')
    .eq('id', caseId)
    .maybeSingle();
  const docs = (c?.workflow_docs ?? {}) as WorkflowDocs;
  const now = new Date().toISOString();

  const next = {
    ...docs[docKey],
    status,
    ...(status === 'requested' ? { requested_at: now } : {}),
    ...(status === 'received' ? { received_at: now } : {}),
  };

  await supabase
    .from('cases')
    .update({ workflow_docs: { ...docs, [docKey]: next } })
    .eq('id', caseId);

  revalidatePath(`/cases/${caseId}`);
}

// ============ Stage 전환 ============
export async function advanceStage(caseId: string, toStageKey: string) {
  const { supabase, userId } = await getContext();
  const { data: c } = await supabase
    .from('cases')
    .select('case_type, workflow_stage, workflow_history')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) throw new Error('사건 없음');
  if (!c.case_type) throw new Error('사건 유형 없음');

  const template = getTemplate(c.case_type);
  if (!template) throw new Error('템플릿 없음');

  const targetStage = template.stages.find((s) => s.key === toStageKey);
  if (!targetStage) throw new Error(`알 수 없는 스테이지: ${toStageKey}`);

  const history = [...((c.workflow_history ?? []) as StageHistoryEntry[])];
  const now = new Date().toISOString();
  const last = history[history.length - 1];
  if (last && !last.exited_at) last.exited_at = now;
  history.push({ stage: toStageKey, entered_at: now });

  await supabase
    .from('cases')
    .update({ workflow_stage: toStageKey, workflow_history: history })
    .eq('id', caseId);

  // 이력 이벤트
  const { data: caseFull } = await supabase
    .from('cases')
    .select('workspace_id, client_id')
    .eq('id', caseId)
    .maybeSingle();
  if (caseFull) {
    await supabase.from('events').insert({
      workspace_id: caseFull.workspace_id,
      source_type: 'milestone',
      raw_content: `스테이지 전환: ${targetStage.label}`,
      occurred_at: now,
      client_id: caseFull.client_id,
      case_id: caseId,
      processed: true,
      metadata: { action: 'advance_stage', to: toStageKey, by: userId },
    });
  }

  revalidatePath(`/cases/${caseId}`);
}

// ============ 서류 요청 Action 핸들러 ============
export async function runSendDocRequest(input: {
  caseId: string;
  docKeys: string[];
  deadline?: string | null;
}) {
  const { supabase, userId } = await getContext();
  const { data: c } = await supabase
    .from('cases')
    .select(`
      workspace_id, client_id, workflow_docs,
      client:clients(id, name, email)
    `)
    .eq('id', input.caseId)
    .maybeSingle();
  if (!c) throw new Error('사건 없음');

  const client = (c.client as unknown as { name: string; email: string | null } | null);
  if (!client?.email) {
    throw new Error('고객 이메일이 등록돼 있지 않음. 고객 정보에 이메일 추가 필요.');
  }

  const lines: string[] = [];
  lines.push(`${client.name}님 안녕하세요.`);
  lines.push('');
  lines.push('개인회생 신청 준비를 위해 다음 서류를 준비해주시기 바랍니다.');
  if (input.deadline) {
    lines.push(`\n⏰ 마감: ${input.deadline}`);
  }
  lines.push('');
  lines.push('## 필요 서류');
  for (const key of input.docKeys) {
    const doc = DOCUMENTS[key];
    if (!doc) continue;
    lines.push(`\n▸ ${doc.label}`);
    lines.push(`   발급처: ${doc.source}`);
    if (doc.obtain_instructions) {
      lines.push(`   ${doc.obtain_instructions}`);
    }
  }
  lines.push('');
  lines.push('준비되신 서류는 회신 메일이나 아래 절차로 보내주세요.');
  lines.push('(업로드 포털은 추후 제공 예정)');
  lines.push('');
  lines.push('감사합니다.');

  const body = lines.join('\n');

  // 이메일 발송 (sendEmail은 자동 fallback)
  const { sendEmail } = await import('@/lib/email/resend');
  const result = await sendEmail({
    to: client.email,
    subject: `[서류 준비 안내] ${input.docKeys.length}종 서류 요청`,
    text: body,
  });

  // workflow_docs 업데이트 (전부 requested)
  const docs = (c.workflow_docs ?? {}) as WorkflowDocs;
  const now = new Date().toISOString();
  const updatedDocs = { ...docs };
  for (const key of input.docKeys) {
    updatedDocs[key] = {
      ...docs[key],
      status: 'requested',
      requested_at: now,
    };
  }

  await supabase
    .from('cases')
    .update({ workflow_docs: updatedDocs })
    .eq('id', input.caseId);

  // 발송 이벤트 기록
  await supabase.from('events').insert({
    workspace_id: c.workspace_id,
    source_type: 'email',
    raw_content: body,
    occurred_at: now,
    client_id: c.client_id,
    case_id: input.caseId,
    processed: true,
    metadata: {
      direction: 'outbound',
      action: 'send_doc_request',
      docs: input.docKeys,
      mocked: result.mocked,
      resend_id: result.id,
      error: result.error,
      by: userId,
    },
  });

  revalidatePath(`/cases/${input.caseId}`);
  return { sent: !result.error, mocked: result.mocked, error: result.error };
}

// ============ 누락 서류 탐지 ============
export async function runDetectMissing(caseId: string) {
  const { supabase } = await getContext();
  const { data: c } = await supabase
    .from('cases')
    .select('case_type, workflow_docs')
    .eq('id', caseId)
    .maybeSingle();
  if (!c || !c.case_type) throw new Error('사건 없음');

  const template = getTemplate(c.case_type);
  if (!template) throw new Error('템플릿 없음');

  const docs = (c.workflow_docs ?? {}) as WorkflowDocs;
  const required = template.document_keys.filter(
    (k) => DOCUMENTS[k]?.required,
  );
  const missing = required.filter(
    (k) => (docs[k]?.status ?? 'missing') === 'missing',
  );
  const requested = required.filter((k) => docs[k]?.status === 'requested');
  const received = required.filter((k) => docs[k]?.status === 'received');

  return {
    total_required: required.length,
    missing: missing.map((k) => DOCUMENTS[k]),
    requested: requested.map((k) => DOCUMENTS[k]),
    received: received.map((k) => DOCUMENTS[k]),
  };
}

// ============ 파일 업로드를 문서 상태에 연결 ============
export async function linkAttachmentToDoc(input: {
  caseId: string;
  docKey: string;
  attachmentId: string;
}) {
  const { supabase } = await getContext();
  const { data: c } = await supabase
    .from('cases')
    .select('workflow_docs')
    .eq('id', input.caseId)
    .maybeSingle();
  const docs = (c?.workflow_docs ?? {}) as WorkflowDocs;
  const prev = docs[input.docKey] ?? { status: 'missing' };
  const attachments = prev.attachment_ids ?? [];

  const updated = {
    ...prev,
    status: 'received' as DocStatus,
    received_at: prev.received_at ?? new Date().toISOString(),
    attachment_ids: [...attachments, input.attachmentId],
  };

  await supabase
    .from('cases')
    .update({ workflow_docs: { ...docs, [input.docKey]: updated } })
    .eq('id', input.caseId);

  revalidatePath(`/cases/${input.caseId}`);
}
