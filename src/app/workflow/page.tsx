import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/AppHeader';
import { getMyRoleContext, canAccessView, type PipelineView, type DomainKey } from '@/lib/auth/my-roles';
import { ConsultantPipeline } from './views/ConsultantPipeline';
import { ViewSwitcher } from './components/ViewSwitcher';
import { CaseDetailView } from './views/CaseDetailView';

export default async function WorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; domain?: string; case?: string }>;
}) {
  const params = await searchParams;
  const ctx = await getMyRoleContext();
  if (!ctx) redirect('/login');

  // 사건 상세 진입 (기존 동작 유지)
  if (params.case) {
    return (
      <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <AppHeader active="workflow" />
        <main className="flex-1 overflow-y-auto">
          <CaseDetailView caseId={params.case} />
        </main>
      </div>
    );
  }

  // 뷰 결정: URL param → 없으면 본인 첫 뷰 자동 선택
  let view = (params.view as PipelineView | undefined) ?? null;
  let domain = (params.domain as DomainKey | undefined) ?? null;

  if (!view || !domain) {
    const first = ctx.accessibleViews[0];
    if (!first) {
      return (
        <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
          <AppHeader active="workflow" />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2 max-w-md">
              <div className="text-5xl">🔒</div>
              <p className="text-sm font-medium">접근 권한 없음</p>
              <p className="text-xs text-zinc-500">
                역할이 부여되지 않았거나 삭제되었습니다. 대표에게 문의하세요.
              </p>
            </div>
          </main>
        </div>
      );
    }
    view = first.view;
    domain = first.domain;
  }

  if (!canAccessView(ctx, view, domain)) {
    return (
      <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <AppHeader active="workflow" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2 max-w-md">
            <div className="text-5xl">🚫</div>
            <p className="text-sm font-medium">이 뷰에 접근할 권한이 없습니다</p>
            <p className="text-xs text-zinc-500">
              권한: <code>{view} × {domain}</code>
            </p>
            <ViewSwitcher current={{ view, domain }} ctx={ctx} />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="workflow" />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">
            {viewLabel(view, domain)}
          </h1>
          <div className="flex items-center gap-2">
            <ViewSwitcher current={{ view, domain }} ctx={ctx} />
            <Link
              href="/cases"
              className="text-xs px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              사건 목록
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {view === 'consultant' && <ConsultantPipeline domain={domain} ctx={ctx} />}
          {view === 'writer' && <PlaceholderView label="작성팀 파이프라인" note="Phase P4 — Stage × 도메인 기반" />}
          {view === 'billing' && <PlaceholderView label="재무팀 파이프라인" note="Phase P3 — Finance Hold 포함" />}
          {view === 'partner' && <PlaceholderView label="대표 종합 뷰" note="Phase P5 — 도메인별 KPI + Workload" />}
        </div>
      </main>
    </div>
  );
}

function viewLabel(view: PipelineView, domain: DomainKey): string {
  const DOMAIN: Record<DomainKey, string> = {
    '*': '전사',
    personal_rehab: '개인회생',
    divorce: '이혼',
    criminal: '형사',
    other: '기타',
  };
  const VIEW: Record<PipelineView, string> = {
    consultant: '상담팀',
    writer: '작성팀',
    billing: '재무팀',
    partner: '대표',
  };
  return view === 'partner' ? VIEW[view] : `${DOMAIN[domain]} · ${VIEW[view]}`;
}

function PlaceholderView({ label, note }: { label: string; note: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center space-y-2 max-w-md">
        <div className="text-5xl">🚧</div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-zinc-500">{note}</p>
      </div>
    </div>
  );
}
