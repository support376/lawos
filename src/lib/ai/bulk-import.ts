import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

export const BulkClientSchema = z.object({
  name: z.string().describe('고객 이름'),
  phone: z.string().nullable().describe('전화번호, 없으면 null'),
  email: z.string().nullable().describe('이메일, 없으면 null'),
  memo: z.string().nullable().describe('고객에 대한 짧은 메모, 없으면 null'),
  cases: z
    .array(
      z.object({
        title: z.string().describe('사건명. 간결하게.'),
        case_type: z
          .enum(['personal_rehab', 'divorce', 'criminal', 'other'])
          .nullable()
          .describe(
            'personal_rehab=개인회생, divorce=이혼, criminal=형사, other=기타 민사 등',
          ),
        case_number: z.string().nullable().describe('사건번호 (예: 2025개회12345)'),
        court: z.string().nullable().describe('담당 법원 (예: 서울회생법원)'),
        opposing_party: z.string().nullable().describe('상대방/피고 정보'),
        retainer_date: z
          .string()
          .nullable()
          .describe('수임일 YYYY-MM-DD 형식'),
        status: z
          .enum(['active', 'closed'])
          .describe('활성(active) 또는 종결(closed)'),
        closed_date: z.string().nullable().describe('종결된 경우 YYYY-MM-DD'),
        outcome: z
          .string()
          .nullable()
          .describe('종결 결과/승패/주요 성과 한 줄'),
        history: z
          .array(
            z.object({
              date: z.string().describe('YYYY-MM-DD'),
              summary: z.string().describe('그 날 일어난 일 한 줄 (한국어)'),
            }),
          )
          .describe('사건 진행 이력. 시간순.'),
        tickets: z
          .array(
            z.object({
              title: z.string().describe('할일 제목 (10자 내외)'),
              type: z.enum(['promise', 'document_request', 'follow_up']),
              due_date: z.string().nullable().describe('YYYY-MM-DD 또는 null'),
              priority: z.number().describe('정수 1~4 (1=긴급)'),
              waiting_on: z
                .enum(['client', 'court', 'opposing'])
                .nullable(),
              description: z.string().nullable(),
            }),
          )
          .describe('현재 활성 할일'),
      }),
    )
    .describe('이 고객의 사건 목록'),
});

export const BulkImportResultSchema = z.object({
  clients: z.array(BulkClientSchema),
  summary: z.string().nullable().describe('전체 임포트 요약'),
});

export type BulkClient = z.infer<typeof BulkClientSchema>;
export type BulkImportResult = z.infer<typeof BulkImportResultSchema>;

const SYSTEM_PROMPT = `당신은 한국 변호사의 업무 정보를 구조화하는 전문가입니다.
사용자가 자유 형식으로 붙여넣은 고객/사건/이력/할일 정보를 파싱해 구조화된 JSON으로 변환합니다.

## 파싱 원칙

1. **추측하지 않기**: 명시되지 않은 필드는 null. 대충 채우지 마세요.
2. **날짜는 YYYY-MM-DD**: "10/15"는 오늘 연도 기준. "작년 12월"은 오늘-1년 12월 1일.
3. **중복 제거**: 같은 고객이 여러 번 나오면 하나로 합치고 사건을 배열로.
4. **사건번호/법원/상대방**: 원문에 "사건번호:", "담당 법원:", "상대방:" 같은 명시만 추출. 못 찾으면 null.
5. **활성 할일만 tickets**에. 이미 완료된 건 history에.
6. **이력(history) vs 할일(tickets) 구분**:
   - 과거형/완료 → history
   - 예정/진행중/해야할 것 → tickets
7. **사건 종결 여부**: "종결", "승소/패소 확정", "취하" 같은 명시 → status='closed' + outcome 채움
8. **priority 정수**: 1~4 범위. "긴급"이면 1, 보통이면 2~3.

## 파싱 예시

입력:
"김민수 (010-1234-5678)
 개인회생, 서울회생법원 2025개회12345, 2025-10-15 수임
 10/20 소득증빙 요청 → 10/28 수령
 11/05 신청서 제출
 할일: 변제계획서 12/15 제출, 김민수에게 채권자 목록 확인 요청"

출력:
{
  clients: [{
    name: "김민수",
    phone: "010-1234-5678",
    email: null, memo: null,
    cases: [{
      title: "김민수 개인회생",
      case_type: "personal_rehab",
      case_number: "2025개회12345",
      court: "서울회생법원",
      opposing_party: null,
      retainer_date: "2025-10-15",
      status: "active",
      closed_date: null, outcome: null,
      history: [
        { date: "2025-10-20", summary: "소득증빙서류 요청" },
        { date: "2025-10-28", summary: "소득증빙서류 수령" },
        { date: "2025-11-05", summary: "신청서 법원 제출" }
      ],
      tickets: [
        { title: "변제계획서 제출", type: "promise", due_date: "2025-12-15", priority: 2, waiting_on: null, description: null },
        { title: "채권자 목록 확인 요청", type: "follow_up", due_date: null, priority: 3, waiting_on: "client", description: null }
      ]
    }]
  }],
  summary: "김민수 개인회생 1건 임포트"
}`;

export async function extractBulkImport(input: {
  text: string;
  today?: string;
}): Promise<BulkImportResult> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system: SYSTEM_PROMPT,
    prompt: `오늘 날짜: ${today}\n\n---\n\n${input.text}\n\n---\n\n위 내용을 파싱해주세요.`,
    schema: BulkImportResultSchema,
    temperature: 0.1,
  });

  // priority 클램핑
  const clamped: BulkImportResult = {
    ...object,
    clients: object.clients.map((c) => ({
      ...c,
      cases: c.cases.map((cs) => ({
        ...cs,
        tickets: cs.tickets.map((t) => ({
          ...t,
          priority: Math.max(1, Math.min(4, Math.round(t.priority))),
        })),
      })),
    })),
  };

  return clamped;
}
