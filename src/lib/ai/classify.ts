import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { DOCUMENTS } from '@/lib/ontology/documents';

// 업로드된 파일의 제목/내용으로 어떤 서류인지 자동 분류.
// 지금은 **파일명 + mime_type** 기반 분류 (텍스트 내용 분석은 추후 OCR 필요).
// 확장성: text_content 파라미터가 있으면 PDF 텍스트 일부 포함해서 판단.

const DOC_KEYS = Object.keys(DOCUMENTS) as [string, ...string[]];

const ClassifyResultSchema = z.object({
  matched_doc_key: z
    .enum(DOC_KEYS)
    .nullable()
    .describe('매칭된 서류 키. 불확실하면 null.'),
  confidence: z
    .number()
    .describe('0~1 확신도. 0.7 이상만 매칭 확정 권장.'),
  reasoning: z.string().describe('왜 이 서류로 분류했는지 한 줄.'),
});

export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

export async function classifyUploadedDoc(input: {
  fileName: string;
  mimeType?: string | null;
  textExcerpt?: string | null; // PDF 첫 몇 줄 등
}): Promise<ClassifyResult> {
  const knownDocs = Object.values(DOCUMENTS)
    .map(
      (d) =>
        `- ${d.key}: "${d.label}" (발급처: ${d.source}, 분류: ${d.category})`,
    )
    .join('\n');

  const system = `한국 개인회생 사건의 서류 분류기입니다. 업로드된 파일 정보로 어떤 서류인지 매칭합니다.

## 알려진 서류 목록
${knownDocs}

## 분류 원칙
1. 파일명에 명시된 단서 (예: "주민등록등본.pdf" → resident_reg)
2. 불확실하면 matched_doc_key=null, confidence<0.7
3. 위 목록에 없는 파일이면 matched_doc_key=null
4. 일반적 명칭 → 정확한 key로 매핑 (예: "재직증명서" → employment_cert)`;

  const prompt = `## 분류할 파일
- 파일명: ${input.fileName}
- MIME: ${input.mimeType ?? 'unknown'}
${input.textExcerpt ? `- 내용 발췌: ${input.textExcerpt.slice(0, 500)}` : ''}

위 파일이 어느 서류인지 매칭해주세요.`;

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5'),
    system,
    prompt,
    schema: ClassifyResultSchema,
    temperature: 0.1,
  });

  return object;
}
