// Resend 래퍼. API 키 없으면 mock (콘솔 로그만).

import { Resend } from 'resend';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string; // 기본 발신자
  replyTo?: string;
}

export interface SendEmailResult {
  mocked: boolean;
  id: string | null;
  error: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom =
    process.env.RESEND_FROM_EMAIL ?? 'LawOS <onboarding@resend.dev>';

  if (!apiKey) {
    // Mock 모드: 콘솔에만 로그. 프로덕션 전 테스트용.
    console.log('[email:mock]', {
      to: input.to,
      subject: input.subject,
      preview: input.text.slice(0, 200),
    });
    return { mocked: true, id: null, error: null };
  }

  try {
    const resend = new Resend(apiKey);
    const res = await resend.emails.send({
      from: input.from ?? defaultFrom,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });

    if (res.error) {
      return { mocked: false, id: null, error: res.error.message };
    }
    return { mocked: false, id: res.data?.id ?? null, error: null };
  } catch (e) {
    return {
      mocked: false,
      id: null,
      error: e instanceof Error ? e.message : '이메일 발송 실패',
    };
  }
}
