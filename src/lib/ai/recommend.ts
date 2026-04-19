import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const PathSchema = z.object({
  recommended: z
    .enum(['personal_rehab', 'bankruptcy', 'workout', 'pre_workout'])
    .describe('가장 적합한 경로'),
  reasoning: z.string().describe('추천 사유 (한국어 1~2문장)'),
  comparison: z.array(
    z.object({
      option: z.enum([
        'personal_rehab',
        'bankruptcy',
        'workout',
        'pre_workout',
      ]),
      label: z.string().describe('한국어 경로명'),
      pros: z.array(z.string()).describe('장점 2~3개'),
      cons: z.array(z.string()).describe('단점 2~3개'),
      fit: z.enum(['strong_fit', 'possible', 'not_fit']),
    }),
  ),
  cautions: z.array(z.string()).describe('특히 주의할 점'),
});

export type PathRecommendation = z.infer<typeof PathSchema>;

const SYSTEM = `한국 채무 구조조정 전문가입니다. 4가지 경로의 특성:

1. **personal_rehab (개인회생)**: 소득 있는 채무자. 3년 변제 후 면책. 채무 5~10% 변제도 가능. 신청 자격: 무담보 10억 이하, 담보 15억 이하.
2. **bankruptcy (파산·면책)**: 변제 불가능 상태. 재산 청산, 채무 탕감. 직업 제한.
3. **workout (신용회복위원회 개인워크아웃)**: 금융권 채무만. 이자·원금 감면 후 최장 10년 분할. 소송 진행중이면 불가.
4. **pre_workout (프리워크아웃)**: 연체 초기. 이자 감면, 기간 연장. 3개월 미만 단기연체만.

## 판단 기준
- 소득: 안정적 → 회생/워크아웃, 없음 → 파산
- 무담보채무: 5천 이하 & 단기연체 → 워크아웃
- 무담보채무: 1~10억 & 소득있음 → 회생
- 변제 여력 거의 없음 → 파산
- 소송 진행중 → 워크아웃 불가

## 출력
- 각 옵션 비교 (fit: strong_fit/possible/not_fit)
- 추천 1개 + 이유
- 주의사항`;

export async function recommendPath(input: {
  monthlyIncome: number;
  familySize: number;
  unsecuredDebt: number;
  securedDebt?: number;
  assetValue?: number;
  hasStableJob: boolean;
  hasLitigationInProgress?: boolean;
  prefOccupationalRisk?: boolean; // 파산 시 직업 제한 걱정
  notes?: string;
}): Promise<PathRecommendation> {
  const prompt = `
## 상담자 재무 상황
- 월 소득 (세후): ${input.monthlyIncome.toLocaleString()}원
- 가구원 수: ${input.familySize}명
- 무담보 채무: ${input.unsecuredDebt.toLocaleString()}원
- 담보 채무: ${(input.securedDebt ?? 0).toLocaleString()}원
- 재산(청산가치): ${(input.assetValue ?? 0).toLocaleString()}원
- 안정적 소득: ${input.hasStableJob ? '예' : '아니오'}
- 진행 중 소송: ${input.hasLitigationInProgress ? '예' : '아니오'}
- 직업 제한 우려: ${input.prefOccupationalRisk ? '예' : '아니오'}
${input.notes ? `- 참고: ${input.notes}` : ''}

위 상황에서 최적 경로를 추천하고, 4가지 옵션을 비교해주세요.`;

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system: SYSTEM,
    prompt,
    schema: PathSchema,
    temperature: 0.2,
  });
  return object;
}
