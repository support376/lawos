import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import { getMyRoleContext, type PipelineView, type DomainKey } from '@/lib/auth/my-roles';
import { ConsultantDashboard } from './views/ConsultantDashboard';
import { WriterDashboard } from './views/WriterDashboard';
import { BillingDashboard } from './views/BillingDashboard';
import { PartnerDashboardSummary } from './views/PartnerDashboardSummary';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; as_domain?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const ctx = await getMyRoleContext();
  if (!ctx) redirect('/login');

  // 본인 주 역할 결정
  const myPrimaryView = determinePrimaryView(ctx);

  // 대표라면 시뮬 파라미터 적용
  const simView = (params.as as PipelineView | undefined) ?? null;
  const simDomain = (params.as_domain as DomainKey | undefined) ?? null;

  const effectiveView: PipelineView = ctx.isManagingPartner && simView ? simView : myPrimaryView.view;
  const effectiveDomain: DomainKey = ctx.isManagingPartner && simDomain ? simDomain : myPrimaryView.domain;

  const profileName = user.user_metadata?.name ?? user.email?.split('@')[0] ?? '';

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader
        active="dashboard"
        simulatedView={effectiveView}
        simulatedDomain={effectiveDomain}
      />
      <main className="flex-1 max-w-6xl mx-auto w-full p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {headerTitle(effectiveView, effectiveDomain)}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {profileName} · {format(new Date(), 'yyyy년 M월 d일')}
            {ctx.isManagingPartner && simView && (
              <span className="ml-2 text-amber-600 dark:text-amber-400 text-xs">
                🧪 시뮬 모드
              </span>
            )}
          </p>
        </div>

        {effectiveView === 'consultant' && (
          <ConsultantDashboard ctx={ctx} domain={effectiveDomain} asUserId={simView ? undefined : ctx.userId} />
        )}
        {effectiveView === 'writer' && (
          <WriterDashboard ctx={ctx} domain={effectiveDomain} asUserId={simView ? undefined : ctx.userId} />
        )}
        {effectiveView === 'billing' && (
          <BillingDashboard ctx={ctx} domain={effectiveDomain} />
        )}
        {effectiveView === 'partner' && (
          <PartnerDashboardSummary ctx={ctx} />
        )}
      </main>
    </div>
  );
}

function determinePrimaryView(ctx: { entries: Array<{ domain: DomainKey; role: string }>; isManagingPartner: boolean }): { view: PipelineView; domain: DomainKey } {
  if (ctx.isManagingPartner) return { view: 'partner', domain: '*' };
  // 우선순위: consultant > billing > writer > admin
  const entries = ctx.entries;
  const consultant = entries.find((e) => e.role === 'consultant');
  if (consultant) return { view: 'consultant', domain: consultant.domain };
  const billing = entries.find((e) => e.role === 'billing_staff');
  if (billing) return { view: 'billing', domain: billing.domain };
  const writer = entries.find((e) =>
    ['attorney', 'document_staff', 'analysis_staff', 'correction_staff'].includes(e.role),
  );
  if (writer) return { view: 'writer', domain: writer.domain };
  const admin = entries.find((e) => e.role === 'admin');
  if (admin) return { view: 'partner', domain: '*' };
  return { view: 'partner', domain: '*' };
}

function headerTitle(view: PipelineView, domain: DomainKey): string {
  const dl: Record<DomainKey, string> = {
    '*': '전사',
    personal_rehab: '개인회생',
    divorce: '이혼',
    criminal: '형사',
    other: '기타',
  };
  if (view === 'partner') return '대표 대시보드';
  if (view === 'consultant') return `상담 대시보드 · ${dl[domain]}`;
  if (view === 'writer') return `작성 대시보드 · ${dl[domain]}`;
  if (view === 'billing') return `재무 대시보드`;
  return '대시보드';
}

