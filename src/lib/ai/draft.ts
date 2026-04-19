import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export const EmailDraftSchema = z.object({
  subject: z.string().describe('이메일 제목. 한국어. 20자 내외.'),
  body_text: z
    .string()
    .describe(
      '이메일 본문 (plain text). 한국어 존댓말. 변호사가 고객에게 보내는 톤. "안녕하세요 ... 변호사입니다." 로 시작, 말미에 "감사합니다. <변호사 이름> 드림" 으로 끝. 본문은 명확하고 간결하게. 상담 내용이나 할일 맥락을 포함.',
    ),
  body_html: z.string().describe('HTML 본문 (간단한 태그만 사용: <p>, <br>, <strong>, <ul>, <li>)'),
  needs_client_review: z
    .boolean()
    .describe('변호사가 직접 검토 후 보내야 하는 민감 내용이면 true'),
});

export type EmailDraft = z.infer<typeof EmailDraftSchema>;

const SYSTEM = `당신은 한국 변호사 사무실의 업무 보조입니다. 변호사가 고객에게 보낼 이메일 초안을 작성합니다.

## 톤 & 원칙
- 정중한 존댓말. 과도하게 격식있지 않되 전문성 있게.
- 서두: "안녕하세요, {고객 성함}님" or "{고객 성함}님께"
- 결어: "감사합니다. / <변호사 이름> 드림"
- 명확하고 구체적. 법률 용어는 필요시 풀어 설명.
- 약속한 내용이면 언제까지 어떻게 할지 명시.
- 서류 요청이면 무엇을 어떤 형식으로 언제까지 줬으면 하는지.
- 민감한 내용(수임료, 불리한 판결 가능성 등)은 needs_client_review=true.
- 절대 법률 조언 단정 표현 금지 (~일 수도 있습니다 같은 완충)

## 입력 참고
- 티켓 제목/타입/마감
- 고객 이름
- 사건 유형 (개인회생/이혼/형사/기타)
- 변호사 이름
- (있으면) 원본 대화/이력 맥락`;

export async function generateEmailDraft(input: {
  ticketTitle: string;
  ticketType: 'promise' | 'document_request' | 'follow_up';
  ticketDueDate: string | null;
  ticketDescription?: string | null;
  clientName: string;
  clientEmail?: string | null;
  caseType?: string | null;
  caseTitle?: string | null;
  lawyerName: string;
  originalContext?: string | null;
}): Promise<EmailDraft> {
  const typeLabel =
    input.ticketType === 'promise'
      ? '구두 약속 이행 안내'
      : input.ticketType === 'document_request'
        ? '서류 요청'
        : '후속 확인 연락';

  const prompt = `
## 작성할 이메일 맥락
- 변호사: ${input.lawyerName}
- 고객: ${input.clientName}
- 사건: ${input.caseTitle ?? '(지정 안 됨)'} ${input.caseType ? `(${input.caseType})` : ''}
- 목적: ${typeLabel}
- 구체 내용: ${input.ticketTitle}
${input.ticketDescription ? `- 세부사항: ${input.ticketDescription}` : ''}
${input.ticketDueDate ? `- 관련 기한: ${input.ticketDueDate}` : ''}
${input.originalContext ? `\n## 원본 대화/이력\n${input.originalContext}\n` : ''}

위 맥락으로 고객에게 보낼 이메일 초안을 작성해주세요.`;

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system: SYSTEM,
    prompt,
    schema: EmailDraftSchema,
    temperature: 0.3,
  });

  return object;
}
