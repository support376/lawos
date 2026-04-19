import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// 자연어 → Ontology 쿼리 변환
// Palantir 스타일: RAG(유사도)가 아닌 결정론적 구조화 필터
// Claude가 쿼리 의도를 파싱해서 (entity, filters) JSON으로 반환.

export const NLQuerySchema = z.object({
  entity: z
    .enum(['cases', 'tickets', 'clients', 'events'])
    .describe('조회 대상 엔티티'),
  filters: z
    .object({
      case_type: z
        .enum(['personal_rehab', 'divorce', 'criminal', 'other'])
        .nullable()
        .describe('사건 유형'),
      status: z.enum(['active', 'archived', 'any']).nullable(),
      client_name: z.string().nullable().describe('고객 이름 (일부 매칭)'),
      has_overdue_ticket: z.boolean().nullable(),
      due_within_days: z.number().nullable().describe('오늘부터 N일 이내 마감'),
      overdue: z.boolean().nullable().describe('마감 지남'),
      waiting_on: z.enum(['client', 'court', 'opposing']).nullable(),
      created_after: z
        .string()
        .nullable()
        .describe('YYYY-MM-DD 이후 생성'),
      created_before: z.string().nullable(),
      text_match: z
        .string()
        .nullable()
        .describe('제목/내용에 포함되어야 할 단어 (옵션)'),
    })
    .describe('필터 조건. 해당 없는 필드는 null.'),
  explanation: z.string().describe('이 쿼리를 어떻게 해석했는지 한 줄 (한국어)'),
});

export type NLQuery = z.infer<typeof NLQuerySchema>;

const SYSTEM = `당신은 한국 변호사 업무 시스템의 검색 엔진입니다. 사용자가 자연어로 입력한 질의를 구조화된 필터로 변환합니다.

## 지원 엔티티
- cases: 사건
- tickets: 할일/티켓
- clients: 고객
- events: 이력 (통화/이메일/상담/milestone)

## 변환 원칙
1. 의도가 모호하면 가장 자연스러운 엔티티 선택 (기본: cases)
2. "지연", "늦음" → overdue=true 또는 has_overdue_ticket=true
3. "오늘", "금주", "이번 주" → due_within_days 숫자로
4. "개인회생" → case_type='personal_rehab', "이혼"→'divorce', "형사"→'criminal'
5. "김○○" → client_name (부분 매칭)
6. "진행중", "활성" → status='active', "종결" → status='archived'
7. 명시되지 않은 필드는 null (억지로 채우지 마세요)

## 예시
Q: "김민수 개인회생 중에 활성인 것"
A: entity=cases, filters={case_type:'personal_rehab', client_name:'김민수', status:'active'}

Q: "이번 주 마감 지난 할일"
A: entity=tickets, filters={overdue:true}

Q: "고객 회신 대기 중인 것들"
A: entity=tickets, filters={waiting_on:'client'}

Q: "최근 이혼 사건"
A: entity=cases, filters={case_type:'divorce', created_after:'{오늘-90일}'}`;

export async function translateQuery(query: string): Promise<NLQuery> {
  const today = new Date().toISOString().slice(0, 10);
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system: SYSTEM,
    prompt: `오늘: ${today}\n\n질의: ${query}\n\n위 질의를 구조화 필터로 변환해주세요.`,
    schema: NLQuerySchema,
    temperature: 0.1,
  });
  return object;
}
