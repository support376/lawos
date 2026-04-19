'use server';

import { revalidatePath } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import {
  detectPreferentialPayments,
  type PreferentialResult,
} from '@/lib/ai/preferential';

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

export interface AnalyzePrefResult extends PreferentialResult {
  ok: boolean;
  error?: string;
}

export async function analyzePreferentialPayments(input: {
  caseId: string;
  bankText: string;
}): Promise<AnalyzePrefResult> {
  try {
    const { supabase, workspaceId, userId } = await getContext();
    const result = await detectPreferentialPayments(input.bankText);

    // 분석 이력을 이벤트로 저장 (사건 타임라인에 표시)
    await supabase.from('events').insert({
      workspace_id: workspaceId,
      source_type: 'milestone',
      raw_content: `편파변제 분석: 의심거래 ${result.suspicious_payments.length}건 / 총 ${result.total_suspicious_krw.toLocaleString()}원`,
      occurred_at: new Date().toISOString(),
      case_id: input.caseId,
      processed: true,
      metadata: {
        action: 'preferential_analysis',
        by: userId,
        suspicious_count: result.suspicious_payments.length,
        total_krw: result.total_suspicious_krw,
      },
    });

    revalidatePath(`/cases/${input.caseId}`);

    return { ok: true, ...result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '분석 실패',
      suspicious_payments: [],
      summary: '',
      total_suspicious_krw: 0,
      recommendations: [],
    };
  }
}
