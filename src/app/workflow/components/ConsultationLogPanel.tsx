'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getLeadConsultationLog,
  upsertConsultationLog,
  type ConsultationLog,
} from '@/app/actions/consultation-logs';

// 상담일지 — 6 섹션 자유 텍스트. 항목 명세는 힌트로만, 입력은 자유.

interface SectionDef {
  key: keyof ConsultationLog;
  title: string;
  hint: string;
  placeholder: string;
}

const SECTIONS: SectionDef[] = [
  {
    key: 'section_personal',
    title: '※ 인적사항',
    hint: '상담날짜 · 성명(나이) · 연락처 · 거주지역 · 가족관계(부양가족) · 거주현황 · 이메일 · 재신청 및 신용회복여부',
    placeholder: `예시:
2026.04.17. 이연희 82년생 / 010-xxxx-xxxx / 서울
미혼 · 월세 500/45
5월 12일 이전 개인회생 면책 (서울 2018개회1009803 · 면책결정일 2021.04.19)
현재 신용회복 유예중`,
  },
  {
    key: 'section_debt',
    title: '※ 채무상황',
    hint: '총 채무금액 · 채권자 수 · 채권자별 채무금액 · 보증 채무 · 채무사유 · 채권정보(최근대출·개인채권자·세금·사채 등)',
    placeholder: `예시:
총 6,000만 / 채권자 5
롯데카드 현대카드 전북은행 고려저축은행 농협저축
채무사유: 주식투자 및 생활비
최근 1년이내 채무금액: 0원`,
  },
  {
    key: 'section_assets',
    title: '※ 재산상황',
    hint: '부동산·자동차·임대차계약·배우자/부양가족 재산·최근5년 처분재산·재산 총 예상액',
    placeholder: `예시:
부동산 x · 자동차 x · 임대차 x · 배우자재산 x · 처분재산 x
예금/적금 x · 보험 실손1개 월납 72,000원 (해지환급금 x)
주식 잔고 140원 정도 · 현재 거래 없음`,
  },
  {
    key: 'section_income',
    title: '※ 소득상황',
    hint: '신청인 직업 · 1년 총 소득 · 월 평균 급여 · 1년 총 상여 · 4대보험 · 퇴직금 · 배우자 소득·퇴직금',
    placeholder: `예시:
직장인 · 월 평균 급여 230만원
4대보험 가입 · 퇴직연금가입자
배우자: 해당없음

예상가용소득:
230만 - 2026년 1인생계비(1,538,543) - 월세 추가생계비 30만
= 약 461,457원 (월 변제금)
× 36개월 = 약 1,661만원 (총 변제금)
※ 추가생계비는 일부만 인정될 수 있음`,
  },
  {
    key: 'section_statement',
    title: '※ 진술서 기재사항',
    hint: '과거 10년 소득활동(연도·소득금액) · 최종학력 · 소송 및 압류여부',
    placeholder: `예시:
소송 및 압류: 연체 x
과거 소득:
최종학력: `,
  },
  {
    key: 'section_engagement',
    title: '※ 수임정보 · 쟁점 및 진행방향',
    hint: '수임료 · 납부방법 · 쟁점사항 · 진행 방향 메모',
    placeholder: `예시:
수임료 250 / 340,000원 (6회 분납 등)
2026.05.01. 이후 접수해야 합니다 !!!!!!!!
(면책 후 5년 제한 — 이전 면책결정일 2021.04.19)`,
  },
];

export function ConsultationLogPanel({ leadId }: { leadId: string }) {
  const [log, setLog] = useState<ConsultationLog | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeadConsultationLog(leadId)
      .then((l) => {
        setLog(l);
        const d: Record<string, string> = {};
        for (const s of SECTIONS) {
          d[s.key as string] = ((l?.[s.key] as string | null) ?? '');
        }
        setDrafts(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [leadId]);

  const save = (status: 'draft' | 'finalized' = 'draft') => {
    setErr(null);
    startTransition(async () => {
      const r = await upsertConsultationLog({
        leadId,
        section_personal: drafts.section_personal || null,
        section_debt: drafts.section_debt || null,
        section_assets: drafts.section_assets || null,
        section_income: drafts.section_income || null,
        section_statement: drafts.section_statement || null,
        section_engagement: drafts.section_engagement || null,
        status,
      });
      if (!r.ok) return setErr(r.error ?? '실패');
      setSavedAt(new Date().toLocaleTimeString('ko-KR'));
      // 서버값 다시 읽기 (finalized_at 반영)
      const fresh = await getLeadConsultationLog(leadId);
      setLog(fresh);
    });
  };

  if (loading) {
    return <p className="text-xs text-zinc-500 p-4 text-center">불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">📋 상담일지</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            각 섹션은 자유 텍스트로 작성. 정형 입력은 추후 개선 (현재는 상담원 메모 형태).
            {log?.status === 'finalized' && log?.finalized_at && (
              <span className="ml-2 text-emerald-600">
                ✓ 확정: {new Date(log.finalized_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        {savedAt && (
          <span className="text-[10px] text-zinc-500">저장 {savedAt}</span>
        )}
      </div>

      {SECTIONS.map((s) => (
        <div key={s.key as string} className="space-y-1">
          <div className="bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 rounded">
            <div className="text-xs font-semibold text-blue-900 dark:text-blue-300">
              {s.title}
            </div>
            <div className="text-[10px] text-blue-700/80 dark:text-blue-400/80 mt-0.5">
              {s.hint}
            </div>
          </div>
          <textarea
            value={drafts[s.key as string] ?? ''}
            onChange={(e) => setDrafts({ ...drafts, [s.key as string]: e.target.value })}
            placeholder={s.placeholder}
            rows={6}
            className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded bg-transparent whitespace-pre-wrap font-mono"
          />
        </div>
      ))}

      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => save('draft')}
          disabled={pending}
          className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
        >
          {pending ? '저장 중...' : '💾 임시 저장'}
        </button>
        <button
          onClick={() => save('finalized')}
          disabled={pending}
          className="px-4 py-1.5 text-sm rounded bg-emerald-600 text-white disabled:opacity-50"
        >
          {pending ? '확정 중...' : '✓ 상담일지 확정'}
        </button>
      </div>
    </div>
  );
}
