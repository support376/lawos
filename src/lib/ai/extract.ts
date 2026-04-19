import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export const ExtractedItemSchema = z.object({
  title: z.string().describe('간결한 할일 제목. 10자 내외. 한국어.'),
  type: z
    .enum(['promise', 'document_request', 'follow_up'])
    .describe(
      'promise=변호사가 "X까지 Y하겠다"고 약속한 것 | document_request=고객/상대방에게 받아야 할 서류 | follow_up=나중에 확인/연락이 필요한 일',
    ),
  due_date: z
    .string()
    .nullable()
    .describe('YYYY-MM-DD 형식. 텍스트에 명시된 마감 있으면 추정, 없으면 null.'),
  priority: z
    .number()
    .describe('정수 1~4 중 하나. 1=긴급(오늘/내일 안 하면 위험), 2=높음, 3=보통, 4=낮음'),
  waiting_on: z
    .enum(['client', 'court', 'opposing'])
    .nullable()
    .describe('대기 상대가 명시되면 지정. client=고객 회신, court=법원, opposing=상대방. 없으면 null.'),
  reasoning: z.string().describe('왜 이것을 할일로 추출했는지 한 문장. 한국어. 원문 근거 포함.'),
  confidence: z.number().describe('0과 1 사이 실수. 확신도.'),
});

export const ExtractionResultSchema = z.object({
  items: z
    .array(ExtractedItemSchema)
    .describe('추출된 할일 목록. 해당 없으면 빈 배열.'),
  summary: z
    .string()
    .nullable()
    .describe('대화 전체의 한 줄 요약. 할일이 없어도 요약은 작성.'),
});

export type ExtractedItem = z.infer<typeof ExtractedItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

interface ExtractInput {
  text: string;
  clientName?: string | null;
  sourceHint?: 'email' | 'kakao' | 'phone' | 'notes' | 'manual' | 'copilot';
  today?: string; // YYYY-MM-DD
  customInstructions?: string | null; // 변호사가 미리 지정한 추출 지시
}

const SYSTEM_PROMPT = `당신은 한국 변호사의 업무 보조입니다. 사용자가 붙여넣은 이메일/카톡/통화전사/메모를 분석해 **놓쳐서는 안 되는 할일**을 추출합니다.

## 추출 기준 (3가지만)
- **promise (구두약속)**: 변호사가 고객/상대방에게 "X까지 Y해드리겠습니다"라고 한 약속. 잊으면 신뢰 타격.
- **document_request (서류요청)**: 고객/상대방에게 받아야 할 서류. 예: "소득증빙서류 주세요", "계약서 사본 보내주세요"
- **follow_up (후속확인)**: 나중에 확인하거나 연락해야 할 것. 예: "다음 주에 법원 진행 확인", "내일 다시 연락 달라"

## 원칙
1. **확실한 것만**. 추측으로 만들지 마세요. 대화에 명확한 근거 없으면 추출하지 마세요.
2. **중복 제거**. 같은 할일 여러 번 언급돼도 1개로.
3. **한국어로 간결하게**. 제목은 10자 내외, 추상적이지 않고 실행 가능한 문장.
4. **마감일은 명시된 것만**. "다음 주 금요일" → 오늘 기준 계산. "언젠가" 같은 건 null.
5. **고객 이름은 제목에 넣지 마세요**. (앱이 별도로 관리)
6. **할일 없으면 빈 배열** 반환. 억지로 만들지 마세요.`;

export async function extractTicketsFromText(input: ExtractInput): Promise<ExtractionResult> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const contextLines = [
    `오늘 날짜: ${today}`,
    input.clientName ? `이 대화의 관련 고객: ${input.clientName}` : null,
    input.sourceHint ? `출처 힌트: ${input.sourceHint}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const instructionBlock = input.customInstructions?.trim()
    ? `\n\n## 변호사가 특별히 지시한 추출 방향\n${input.customInstructions.trim()}\n`
    : '';

  const userPrompt = `${contextLines}${instructionBlock}\n\n---\n\n분석할 텍스트:\n\n${input.text}\n\n---\n\n위 텍스트에서 놓쳐서는 안 되는 할일을 추출해주세요.`;

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    schema: ExtractionResultSchema,
    temperature: 0.2,
  });

  // LLM이 가끔 범위 벗어나는 값 반환 → 클램핑
  const clamped: ExtractionResult = {
    summary: object.summary,
    items: object.items.map((it) => ({
      ...it,
      priority: Math.max(1, Math.min(4, Math.round(it.priority))) as 1 | 2 | 3 | 4,
      confidence: Math.max(0, Math.min(1, it.confidence)),
    })),
  };

  return clamped;
}
