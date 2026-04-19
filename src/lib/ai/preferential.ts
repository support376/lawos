import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// 개인회생 편파변제(편파행위) 탐지
// 신청 6개월 이전 특정 채권자에 대한 불균형 지급을 자동 추출
// 법적 근거: 채무자회생법 §391, §392 (개인회생 준용)

export const PreferentialResultSchema = z.object({
  suspicious_payments: z
    .array(
      z.object({
        date: z.string().describe('YYYY-MM-DD'),
        recipient: z.string().describe('수취인/채권자 이름'),
        amount_krw: z.number().describe('지급 금액 (원)'),
        reason: z
          .string()
          .describe('왜 의심스러운지 한 줄 (한국어). 법적 쟁점 포함.'),
        risk_level: z.enum(['high', 'medium', 'low']),
      }),
    )
    .describe(
      '편파변제로 의심되는 거래 목록. 기준: 최근 6개월 내 특정 채권자 편중, 대여금 반환, 친족·관계자 상환, 가압류 회피성 이체 등.',
    ),
  summary: z
    .string()
    .describe(
      '전체 통장내역 분석 요약. 의심 없으면 "편파변제 징후 없음"이라 명시.',
    ),
  total_suspicious_krw: z.number().describe('의심 거래 총액 (원)'),
  recommendations: z
    .array(z.string())
    .describe('변호사가 취해야 할 후속 조치 제안 (한국어).'),
});

export type PreferentialResult = z.infer<typeof PreferentialResultSchema>;

const SYSTEM = `당신은 한국 개인회생 전문 변호사의 재산조사 보조입니다.
사용자가 제공한 통장거래내역을 분석해서 **편파변제로 의심되는 거래를 추출**합니다.

## 법적 기준 (채무자회생법)
- 신청 6개월 이전 특정 채권자에 대한 상환
- 특히 친족·관계인에게 우선 상환한 경우
- 가압류·추심 직전 특정 채권자에게 목돈 이체
- 금융기관 대출이 아닌 사채·지인 대여금 우선 상환
- 비정상적으로 큰 현금 인출 (재산 은닉 의심)

## 추출 원칙
1. **확실한 것만 high**. 단순 의심은 low.
2. **공과금/생활비/급여 이체는 제외**.
3. **같은 날/같은 금액 반복**은 정기 결제 가능성 고려.
4. 금액은 원 단위 숫자.
5. risk_level 기준:
   - high: 친족/지인 대여금 상환, 우선 변제, 큰 현금 인출
   - medium: 동일 채권자 반복 송금, 의심스러운 대여
   - low: 애매하지만 확인 필요`;

export async function detectPreferentialPayments(
  bankStatementText: string,
): Promise<PreferentialResult> {
  const trimmed = bankStatementText.trim();
  if (!trimmed) throw new Error('통장내역 없음');
  if (trimmed.length > 100000) throw new Error('내역이 너무 깁니다 (10만자 이하)');

  const today = new Date().toISOString().slice(0, 10);
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system: SYSTEM,
    prompt: `오늘: ${today}\n\n## 분석할 통장거래내역\n\n${trimmed}\n\n---\n\n위 통장내역에서 편파변제로 의심되는 거래를 전부 추출해주세요. 법정 판단에 활용될 자료이므로 정확성 중요.`,
    schema: PreferentialResultSchema,
    temperature: 0.1,
  });

  return object;
}
