import Link from 'next/link';
import type { StageKey } from '@/lib/ontology/domains/personal_rehab/entities';
import { STAGES } from '@/lib/ontology/domains/personal_rehab/stages';

interface RehabCaseLite {
  id: string;
  title: string;
  client_name: string;
  current_stage_key: StageKey | null;
}

interface DivorceCaseLite {
  id: string;
  title: string;
  client_name: string;
}

export function SidebarCaseList({
  rehabCases,
  divorceCases,
  selectedCaseId,
}: {
  rehabCases: RehabCaseLite[];
  divorceCases: DivorceCaseLite[];
  selectedCaseId: string | null;
}) {
  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-5 overflow-y-auto">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            개인회생
          </h3>
          <span className="text-xs text-zinc-400 tabular-nums">{rehabCases.length}</span>
        </div>
        {rehabCases.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">진행중 사건 없음</p>
        ) : (
          <div className="space-y-1">
            {rehabCases.map((c) => {
              const stageLabel = c.current_stage_key
                ? STAGES[c.current_stage_key]?.label ?? c.current_stage_key
                : '상담 전';
              const isSelected = c.id === selectedCaseId;
              return (
                <Link
                  key={c.id}
                  href={`/workflow?case=${c.id}`}
                  className={`block px-2 py-1.5 rounded text-xs ${
                    isSelected
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <div className="font-medium truncate">{c.client_name}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      isSelected ? 'opacity-70' : 'text-zinc-500'
                    }`}
                  >
                    {stageLabel}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
            이혼
          </h3>
          <span className="text-xs text-zinc-400 tabular-nums">{divorceCases.length}</span>
        </div>
        {divorceCases.length === 0 ? (
          <p className="text-xs text-zinc-400 italic">
            진행중 사건 없음 (온톨로지 재설계 중)
          </p>
        ) : (
          <div className="space-y-1 opacity-60">
            {divorceCases.map((c) => (
              <div key={c.id} className="px-2 py-1.5 text-xs">
                <div className="font-medium truncate">{c.client_name}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">— v1 구현 전</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
