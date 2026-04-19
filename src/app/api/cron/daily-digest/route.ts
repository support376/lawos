import { NextResponse, type NextRequest } from 'next/server';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';

// Vercel Cron이 호출. vercel.json의 crons 설정에 따라 매일 오전 9시 KST 호출.
// Cron 인증: Vercel이 보내는 `Authorization: Bearer <CRON_SECRET>` 헤더 체크.

export async function GET(request: NextRequest) {
  // 인증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // 모든 워크스페이스 owner 조회
  const { data: owners } = await admin
    .from('workspace_members')
    .select(`
      workspace_id, user_id,
      workspace:workspaces(id, name),
      user:users(id, email, name)
    `)
    .eq('role', 'owner');

  const results: Array<{
    email: string;
    sent: boolean;
    error?: string;
  }> = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);

  for (const row of (owners ?? []) as unknown as Array<{
    workspace_id: string;
    user_id: string;
    workspace: { id: string; name: string } | null;
    user: { id: string; email: string; name: string | null } | null;
  }>) {
    if (!row.user?.email) continue;

    // 워크스페이스 단위로 오늘 할일 집계
    const { data: tickets } = await admin
      .from('tickets')
      .select('id, title, due_date, type, priority, column_key, client:clients(name)')
      .eq('workspace_id', row.workspace_id)
      .neq('column_key', 'done')
      .not('due_date', 'is', null);

    const overdue: typeof tickets = [];
    const dueToday: typeof tickets = [];
    const dueTomorrow: typeof tickets = [];

    for (const t of tickets ?? []) {
      if (!t.due_date) continue;
      const diff = differenceInCalendarDays(parseISO(t.due_date), today);
      if (diff < 0) overdue.push(t);
      else if (diff === 0) dueToday.push(t);
      else if (diff === 1) dueTomorrow.push(t);
    }

    const { count: triageCount } = await admin
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', row.workspace_id)
      .eq('column_key', 'triage');

    if (
      overdue.length === 0 &&
      dueToday.length === 0 &&
      dueTomorrow.length === 0 &&
      (triageCount ?? 0) === 0
    ) {
      continue; // 보낼 내용 없음
    }

    const name = row.user.name ?? row.user.email.split('@')[0];
    const body = buildDigestText({
      name,
      date: format(today, 'yyyy년 M월 d일 (EEE)'),
      overdue: (overdue ?? []).map((t) => ({
        title: t.title,
        dueDate: t.due_date!,
        client: (t.client as unknown as { name?: string } | null)?.name ?? null,
      })),
      dueToday: (dueToday ?? []).map((t) => ({
        title: t.title,
        client: (t.client as unknown as { name?: string } | null)?.name ?? null,
      })),
      dueTomorrow: (dueTomorrow ?? []).map((t) => ({
        title: t.title,
        client: (t.client as unknown as { name?: string } | null)?.name ?? null,
      })),
      triageCount: triageCount ?? 0,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://lawos-rho.vercel.app'}/dashboard`,
    });

    const result = await sendEmail({
      to: row.user.email,
      subject: `[LawOS] ${format(today, 'M월 d일')} 오늘 할일 ${dueToday.length + overdue.length}건`,
      text: body,
    });

    results.push({
      email: row.user.email,
      sent: !result.error,
      error: result.error ?? undefined,
    });

    if (result.mocked) {
      console.log(`[digest mocked] to=${row.user.email}`);
    }
  }

  return NextResponse.json({
    date: todayISO,
    processed: results.length,
    results,
  });
}

function buildDigestText(input: {
  name: string;
  date: string;
  overdue: Array<{ title: string; dueDate: string; client: string | null }>;
  dueToday: Array<{ title: string; client: string | null }>;
  dueTomorrow: Array<{ title: string; client: string | null }>;
  triageCount: number;
  dashboardUrl: string;
}): string {
  const lines: string[] = [];
  lines.push(`${input.name}님, 좋은 아침입니다.`);
  lines.push(`${input.date} 오늘의 업무 다이제스트입니다.`);
  lines.push('');

  if (input.overdue.length > 0) {
    lines.push(`🔴 지연 ${input.overdue.length}건`);
    for (const t of input.overdue) {
      const days = Math.abs(
        differenceInCalendarDays(parseISO(t.dueDate), new Date()),
      );
      lines.push(`  - ${t.title}${t.client ? ` (${t.client})` : ''} · ${days}일 지남`);
    }
    lines.push('');
  }

  if (input.dueToday.length > 0) {
    lines.push(`🟠 오늘 마감 ${input.dueToday.length}건`);
    for (const t of input.dueToday) {
      lines.push(`  - ${t.title}${t.client ? ` (${t.client})` : ''}`);
    }
    lines.push('');
  }

  if (input.dueTomorrow.length > 0) {
    lines.push(`내일 마감 ${input.dueTomorrow.length}건`);
    for (const t of input.dueTomorrow) {
      lines.push(`  - ${t.title}${t.client ? ` (${t.client})` : ''}`);
    }
    lines.push('');
  }

  if (input.triageCount > 0) {
    lines.push(`🟣 Triage에 검토 대기: ${input.triageCount}건 (AI 제안)`);
    lines.push('');
  }

  lines.push(`대시보드: ${input.dashboardUrl}`);
  lines.push('');
  lines.push('— LawOS');

  return lines.join('\n');
}
