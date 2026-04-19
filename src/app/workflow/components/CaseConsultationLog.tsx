import { getCaseConsultationLog } from '@/app/actions/consultation-logs';
import { format } from 'date-fns';

const SECTIONS: Array<{ key: 'section_personal' | 'section_debt' | 'section_assets' | 'section_income' | 'section_statement' | 'section_engagement'; title: string }> = [
  { key: 'section_personal', title: '※ 인적사항' },
  { key: 'section_debt', title: '※ 채무상황' },
  { key: 'section_assets', title: '※ 재산상황' },
  { key: 'section_income', title: '※ 소득상황' },
  { key: 'section_statement', title: '※ 진술서 기재사항' },
  { key: 'section_engagement', title: '※ 수임정보 · 쟁점' },
];

export async function CaseConsultationLog({ caseId }: { caseId: string }) {
  const log = await getCaseConsultationLog(caseId);
  if (!log) {
    return null;  // 상담일지 없으면 섹션 아예 숨김
  }

  const anyContent = SECTIONS.some((s) => !!log[s.key]);
  if (!anyContent) return null;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold">📋 상담일지 (수임 시점)</h2>
        <div className="text-[10px] text-zinc-500 flex gap-2">
          <span>
            상담일: {format(new Date(log.consultation_date), 'yyyy-MM-dd')}
          </span>
          {log.status === 'finalized' && log.finalized_at && (
            <span className="text-emerald-600">
              ✓ 확정 {format(new Date(log.finalized_at), 'MM-dd HH:mm')}
            </span>
          )}
          {log.status === 'draft' && <span className="text-amber-600">초안</span>}
        </div>
      </div>
      <div className="p-4 space-y-3">
        {SECTIONS.map((s) => {
          const content = log[s.key];
          if (!content) return null;
          return (
            <div key={s.key}>
              <div className="bg-blue-50 dark:bg-blue-950/30 px-3 py-1 rounded text-[11px] font-semibold text-blue-900 dark:text-blue-300">
                {s.title}
              </div>
              <pre className="text-xs whitespace-pre-wrap mt-1 px-3 font-mono leading-relaxed">
                {content}
              </pre>
            </div>
          );
        })}
      </div>
    </section>
  );
}
