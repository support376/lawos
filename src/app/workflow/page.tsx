import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';

// 워크플로우 재설계 중. 구현 예정 구조:
//   좌측 사이드바: 도메인(개인회생·이혼·...) > 각 도메인 아래 진행중 고객 리스트
//   우측 본문: 선택한 고객·사건의 도메인별 워크플로우 뷰
// 현재는 placeholder 뼈대.

export default async function WorkflowPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="workflow" />
      <main className="flex-1 flex">
        <aside className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              개인회생
            </div>
            <div className="text-xs text-zinc-400 italic">진행중 고객 없음</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
              이혼
            </div>
            <div className="text-xs text-zinc-400 italic">진행중 고객 없음</div>
          </div>
        </aside>
        <section className="flex-1 p-8 flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-5xl">🏗️</div>
            <p className="text-sm font-medium">워크플로우 재설계 중</p>
            <p className="text-xs text-zinc-500 max-w-sm">
              온톨로지 기반으로 도메인별 워크플로우를 처음부터 다시 설계합니다.
              좌측에서 도메인·고객을 선택하면 해당 사건의 플로우가 표시됩니다.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
