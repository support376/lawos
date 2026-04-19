import { NextResponse, type NextRequest } from 'next/server';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';
import { DOCUMENTS } from '@/lib/ontology/documents';

// 매일 오전: 서류 요청 3일 이상 경과 & 미수령인 사건에 대해 자동 리마인더 이메일.

const REMIND_AFTER_DAYS = 3;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // 워크플로우 활성인 사건들 조회
  const { data: cases } = await admin
    .from('cases')
    .select(`
      id, workspace_id, workflow_docs,
      client:clients(id, name, email)
    `)
    .eq('status', 'active')
    .not('workflow_stage', 'is', null);

  const today = new Date();
  const remindersSent: Array<{
    caseId: string;
    clientEmail: string;
    docCount: number;
    error?: string;
  }> = [];

  for (const c of (cases ?? []) as unknown as Array<{
    id: string;
    workspace_id: string;
    workflow_docs: Record<
      string,
      { status?: string; requested_at?: string }
    > | null;
    client: { id: string; name: string; email: string | null } | null;
  }>) {
    if (!c.client?.email) continue;
    if (!c.workflow_docs) continue;

    // 요청했는데 3일+ 미수령 서류 추출
    const overdue: Array<{ key: string; label: string; daysOverdue: number }> = [];
    for (const [docKey, state] of Object.entries(c.workflow_docs)) {
      if (state?.status !== 'requested') continue;
      if (!state.requested_at) continue;
      const days = differenceInCalendarDays(today, parseISO(state.requested_at));
      if (days >= REMIND_AFTER_DAYS) {
        const doc = DOCUMENTS[docKey];
        if (doc) {
          overdue.push({
            key: docKey,
            label: doc.label,
            daysOverdue: days,
          });
        }
      }
    }

    if (overdue.length === 0) continue;

    // 리마인더 이메일
    const lines: string[] = [];
    lines.push(`${c.client.name}님 안녕하세요.`);
    lines.push('');
    lines.push('지난번 요청드린 서류 중 아직 전달받지 못한 것이 있어 재안내 드립니다.');
    lines.push('');
    lines.push('## 미수령 서류');
    for (const o of overdue) {
      lines.push(`▸ ${o.label} (요청 ${o.daysOverdue}일 경과)`);
      const doc = DOCUMENTS[o.key];
      if (doc?.obtain_instructions) {
        lines.push(`  ${doc.obtain_instructions}`);
      }
    }
    lines.push('');
    lines.push(
      '개인회생 신청 일정에 차질이 없도록 가능한 빨리 전달 부탁드립니다.',
    );
    lines.push('');
    lines.push('감사합니다.');

    const result = await sendEmail({
      to: c.client.email,
      subject: `[서류 재요청] 미수령 ${overdue.length}종 안내`,
      text: lines.join('\n'),
    });

    // 이벤트 로그
    await admin.from('events').insert({
      workspace_id: c.workspace_id,
      source_type: 'email',
      raw_content: lines.join('\n'),
      occurred_at: new Date().toISOString(),
      client_id: c.client.id,
      case_id: c.id,
      processed: true,
      metadata: {
        direction: 'outbound',
        action: 'doc_reminder',
        docs: overdue.map((o) => o.key),
        mocked: result.mocked,
        error: result.error,
      },
    });

    remindersSent.push({
      caseId: c.id,
      clientEmail: c.client.email,
      docCount: overdue.length,
      error: result.error ?? undefined,
    });
  }

  return NextResponse.json({
    date: today.toISOString().slice(0, 10),
    processed: remindersSent.length,
    sent: remindersSent,
  });
}
