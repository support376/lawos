import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'attachments';
const MAX_SIZE = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const token = form.get('token');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    }
    if (typeof token !== 'string') {
      return NextResponse.json({ error: '토큰 누락' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: '빈 파일' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: '파일이 너무 큽니다 (최대 20MB)' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // 토큰 검증
    const { data: tok } = await admin
      .from('client_portal_tokens')
      .select('id, workspace_id, case_id, client_id, expires_at, revoked_at, access_count')
      .eq('token', token)
      .maybeSingle();
    if (!tok) {
      return NextResponse.json(
        { error: '유효하지 않은 링크' },
        { status: 404 },
      );
    }
    if (tok.revoked_at) {
      return NextResponse.json({ error: '해지된 링크' }, { status: 403 });
    }
    if (new Date(tok.expires_at) < new Date()) {
      return NextResponse.json({ error: '만료된 링크' }, { status: 403 });
    }

    // Storage 업로드
    const ext = file.name.includes('.')
      ? file.name.split('.').pop()
      : 'bin';
    const uuid = crypto.randomUUID();
    const path = `${tok.workspace_id}/case/${tok.case_id}/${uuid}.${ext}`;
    const buffer = await file.arrayBuffer();

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) {
      return NextResponse.json(
        { error: `스토리지 업로드 실패: ${upErr.message}` },
        { status: 500 },
      );
    }

    // attachments + events 기록
    await admin.from('attachments').insert({
      workspace_id: tok.workspace_id,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      case_id: tok.case_id,
      client_id: tok.client_id,
      uploaded_by: null,
    });

    await admin
      .from('client_portal_tokens')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: (tok.access_count ?? 0) + 1,
      })
      .eq('id', tok.id);

    await admin.from('events').insert({
      workspace_id: tok.workspace_id,
      source_type: 'import',
      raw_content: `고객 포털 업로드: ${file.name}`,
      occurred_at: new Date().toISOString(),
      client_id: tok.client_id,
      case_id: tok.case_id,
      processed: true,
      metadata: {
        via: 'portal',
        file: file.name,
        size: file.size,
      },
    });

    return NextResponse.json({ ok: true, fileName: file.name });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '업로드 실패' },
      { status: 500 },
    );
  }
}
