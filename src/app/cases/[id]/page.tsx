import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/server';
import { AppHeader } from '@/components/AppHeader';
import {
  CASE_TYPE_LABEL,
  TICKET_TYPE_ICON,
  PRIORITY_COLOR,
  type CaseType,
} from '@/lib/types';
import { CaseActions } from './CaseActions';
import { AssigneeSelect } from '@/components/AssigneeSelect';
import { VisibilitySelect } from './VisibilitySelect';
import { AttachmentList } from '@/components/AttachmentList';
import { WorkflowPanel } from './WorkflowPanel';
import { PdfActions } from './PdfActions';
import { PreferentialAnalyzer } from './PreferentialAnalyzer';
import { RepaymentSimulator } from './RepaymentSimulator';
import { PortalButton } from './PortalButton';
import { RecommendedActions } from './RecommendedActions';
import { StrategyPanel } from './StrategyPanel';
import { RehabDashboard } from './RehabDashboard';
import { StrategyConsole } from './StrategyConsole';
import { ClientProfile } from './ClientProfile';
import { CaseNotes } from './CaseNotes';
import { CaseIntelPanel } from './CaseIntelPanel';
import { ActorPanel, type ActorData } from './ActorPanel';
import { DualActorLayout } from './DualActorLayout';
import { CreditorTable } from './CreditorTable';
import { ensureDomainActors } from '@/app/actions/actor';
import { getTemplate } from '@/lib/ontology/templates';
import { computeRecommendations } from '@/lib/ontology/recommendations';
import { DOCUMENTS } from '@/lib/ontology/documents';
import { detectCourt } from '@/lib/ontology/courts';
import { analyzeIntel } from '@/lib/ontology/intel-gaps';
import { getDomain } from '@/lib/ontology/registry';
import {
  analyzeEvidenceGaps,
  buildEvidenceCorpus,
} from '@/lib/ontology/engine/evidence-gap';
import { EvidenceGapPanel } from './EvidenceGapPanel';
import type { CaseVisibility } from '@/lib/types';
import type { WorkflowDocs, StageHistoryEntry } from '@/lib/ontology/types';

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 전체 컬럼 셀렉트 시도 → 실패 시 안전한 minimal 쿼리로 폴백
  let caseRow: Record<string, unknown> | null = null;
  const fullRes = await supabase
    .from('cases')
    .select(`
      id, title, case_type, status, case_number, court, opposing_party,
      retainer_date, closed_date, outcome, assigned_to, visibility, created_at,
      workflow_stage, workflow_docs, workflow_history, free_notes, case_intel,
      client:clients(id, name, phone, email, memo, occupation, monthly_income_krw, total_debt_krw, dependents_count, assets, risk_flags),
      assignee:users!cases_assigned_to_fkey(id, name, email)
    `)
    .eq('id', id)
    .maybeSingle();

  if (fullRes.error) {
    console.warn('[case detail] full select 실패, 최소 쿼리로 폴백:', fullRes.error.message);
    const minRes = await supabase
      .from('cases')
      .select(`
        id, title, case_type, status, created_at,
        client:clients(id, name)
      `)
      .eq('id', id)
      .maybeSingle();
    caseRow = minRes.data ?? null;
  } else {
    caseRow = fullRes.data ?? null;
  }

  if (!caseRow) notFound();

  const raw = caseRow as Record<string, unknown>;
  const c = {
    id: raw.id as string,
    title: raw.title as string,
    case_type: (raw.case_type ?? null) as CaseType | null,
    status: (raw.status as string) ?? 'active',
    case_number: (raw.case_number ?? null) as string | null,
    court: (raw.court ?? null) as string | null,
    opposing_party: (raw.opposing_party ?? null) as string | null,
    retainer_date: (raw.retainer_date ?? null) as string | null,
    closed_date: (raw.closed_date ?? null) as string | null,
    outcome: (raw.outcome ?? null) as string | null,
    assigned_to: (raw.assigned_to ?? null) as string | null,
    visibility: (raw.visibility ?? 'workspace') as CaseVisibility,
    workflow_stage: (raw.workflow_stage ?? null) as string | null,
    workflow_docs: (raw.workflow_docs ?? null) as WorkflowDocs | null,
    workflow_history: (raw.workflow_history ?? null) as StageHistoryEntry[] | null,
    free_notes: (raw.free_notes ?? null) as string | null,
    case_intel: (raw.case_intel ?? {}) as Record<string, unknown>,
    created_at: raw.created_at as string,
    client: (raw.client ?? null) as {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      memo: string | null;
      occupation: string | null;
      monthly_income_krw: number | null;
      total_debt_krw: number | null;
      dependents_count: number | null;
      assets: Array<{ label: string; value_krw: number; kind?: string }> | null;
      risk_flags: Record<string, boolean> | null;
    } | null,
    assignee: (raw.assignee ?? null) as { id: string; name: string | null; email: string } | null,
  };

  const template = c.case_type ? getTemplate(c.case_type) : null;

  // 워크스페이스 멤버 목록 (담당자 선택용)
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: membersRaw } = membership
    ? await supabase
        .from('workspace_members')
        .select('user:users(id, name, email)')
        .eq('workspace_id', membership.workspace_id)
    : { data: [] };
  const teamMembers = ((membersRaw ?? []) as unknown as Array<{
    user: { id: string; name: string | null; email: string };
  }>).map((m) => m.user);

  const [{ data: tickets }, { data: events }, { data: activities }, { data: attachments }] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, column_key, title, type, priority, due_date, waiting_on, ai_suggested, created_at, completed_at, updated_at')
      .eq('case_id', id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('events')
      .select('id, source_type, raw_content, occurred_at, created_at')
      .eq('case_id', id)
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('ticket_activities')
      .select('id, ticket_id, action, to_value, created_at')
      .in('ticket_id',
        (await supabase.from('tickets').select('id').eq('case_id', id)).data?.map((x) => x.id) ?? ['00000000-0000-0000-0000-000000000000']
      )
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('attachments')
      .select('id, storage_path, original_name, mime_type, size_bytes, created_at')
      .eq('case_id', id)
      .order('created_at', { ascending: false }),
  ]);

  // 전술 플레이북 데이터
  // 도메인 actors 자동 보장 (idempotent)
  await ensureDomainActors(id, c.case_type, { courtName: c.court ?? null });

  const [counterpartiesRes, adoptedRes] = await Promise.all([
    supabase
      .from('case_counterparties')
      .select('id, name, role, weight, description, profile, consent_recorded, consent_scope')
      .eq('case_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('case_tactics_adopted')
      .select('id, tactic_key, status, outcome')
      .eq('case_id', id)
      .order('adopted_at', { ascending: false }),
  ]);
  const counterparties = (counterpartiesRes.data ?? []) as unknown as Array<{
    id: string;
    name: string;
    role: string | null;
    weight: string | null;
    description: string | null;
    profile: Record<string, unknown>;
    consent_recorded: boolean;
    consent_scope: string | null;
  }>;

  // Actor 맵 생성 (role별)
  const actorMap: Record<string, ActorData[]> = {};
  for (const cp of counterparties) {
    const role = cp.role ?? 'unknown';
    if (!actorMap[role]) actorMap[role] = [];
    actorMap[role].push({
      id: cp.id,
      role,
      name: cp.name,
      weight: cp.weight,
      profile: cp.profile ?? {},
    });
  }

  // clients 테이블 데이터를 client actor로 어댑트 (가상 ActorData)
  if (c.client) {
    actorMap['client'] = [{
      id: c.client.id,
      role: 'client',
      name: c.client.name,
      weight: 'primary',
      profile: {
        monthly_income_krw: c.client.monthly_income_krw,
        total_debt_krw: c.client.total_debt_krw,
        dependents_count: c.client.dependents_count,
        occupation: c.client.occupation,
      } as Record<string, unknown>,
    }];
  }
  const adoptedTactics = (adoptedRes.data ?? []) as unknown as Array<{
    id: string;
    tactic_key: string;
    status: 'planned' | 'executing' | 'completed' | 'abandoned';
    outcome: string | null;
  }>;

  const activeTickets = (tickets ?? []).filter((t) => t.column_key !== 'done');
  const completedTickets = (tickets ?? []).filter((t) => t.column_key === 'done');

  // 추천 계산 (최상단에서 미리)
  const workflowDocsData = (c.workflow_docs ?? {}) as WorkflowDocs;
  const workflowHistoryData = (c.workflow_history ?? []) as StageHistoryEntry[];
  const currentStageEntry = workflowHistoryData[workflowHistoryData.length - 1];
  const recs = template && c.workflow_stage
    ? computeRecommendations({
        caseType: c.case_type,
        currentStage: c.workflow_stage,
        docs: workflowDocsData,
        requiredDocKeys: template.document_keys.filter(
          (k) => DOCUMENTS[k]?.required,
        ),
        recentEvents: (events ?? []).slice(0, 20).map((e) => ({
          source_type: e.source_type,
          raw_content: e.raw_content,
          created_at: e.created_at,
          metadata: (e as unknown as { metadata?: Record<string, unknown> })
            .metadata,
        })),
        stageEnteredAt: currentStageEntry?.entered_at ?? null,
        today: new Date(),
      })
    : [];

  // 편파변제 의심 건수 (events metadata에서)
  const preferentialCount = (events ?? []).reduce((acc, e) => {
    const m = (e as unknown as { metadata?: { action?: string; suspicious_count?: number } }).metadata;
    if (m?.action === 'preferential_analysis') {
      return Math.max(acc, m.suspicious_count ?? 0);
    }
    return acc;
  }, 0);

  // 개인회생 전용 대시보드 모드 여부
  const isRehabMode =
    c.case_type === 'personal_rehab' && !!template && !!c.workflow_stage;
  const courtProfile = isRehabMode
    ? detectCourt(c.case_number, c.court)
    : null;

  const hasPreferentialAnalysis = (events ?? []).some((e) => {
    const m = (e as unknown as { metadata?: { action?: string } }).metadata;
    return m?.action === 'preferential_analysis';
  });
  const hasRepaymentSim = (events ?? []).some((e) => {
    const m = (e as unknown as { metadata?: { action?: string } }).metadata;
    return m?.action === 'repayment_simulation';
  });
  const hasEngagementLetter = (events ?? []).some((e) => {
    const m = (e as unknown as { metadata?: { action?: string } }).metadata;
    return m?.action === 'engagement_letter';
  });

  // 정보-전술 연결 분석
  const ci = c.case_intel as Record<string, unknown>;
  const intelSnapshot = analyzeIntel({
    caseType: c.case_type ?? '',
    hasClient: !!c.client,
    marriageYears: (ci['marriage_years'] as number | null) ?? null,
    separationMonths: (ci['separation_months'] as number | null) ?? null,
    childrenCount: (ci['children_count'] as number | null) ?? null,
    youngestChildAge: (ci['youngest_child_age'] as number | null) ?? null,
    sharedAssetsKrw: (ci['shared_assets_krw'] as number | null) ?? null,
    mediationAttempted: (ci['mediation_attempted'] as boolean | null) ?? false,
    protectiveOrderActive: (ci['protective_order_active'] as boolean | null) ?? false,
    hasCourtInfo: !!(c.case_number || c.court),
    hasRetainerDate: !!c.retainer_date,
    counterpartiesCount: counterparties.length,
    affairPartnersCount: (actorMap['affair_partner'] ?? []).length,
    opposingFaultEvidenceStrength:
      (actorMap['opposing_side']?.[0]?.profile?.['fault_evidence_strength'] as
        | 'none' | 'weak' | 'moderate' | 'strong' | null | undefined) ?? null,
    ourFaultDefenseEvidence:
      (actorMap['our_side']?.[0]?.profile?.['fault_defense_evidence'] as
        | 'none' | 'partial' | 'ready' | null | undefined) ?? null,
    workflowDocs: workflowDocsData,
    requiredDocKeys: template
      ? template.document_keys.filter((k) => DOCUMENTS[k]?.required)
      : [],
    monthlyIncome: c.client?.monthly_income_krw ?? null,
    totalDebt: c.client?.total_debt_krw ?? null,
    dependentsCount: c.client?.dependents_count ?? null,
    occupation: c.client?.occupation ?? null,
    assetsCount: (c.client?.assets ?? []).length,
    riskFlags: c.client?.risk_flags ?? {},
    hasPreferentialAnalysis,
    preferentialFoundCount: preferentialCount,
    hasRepaymentSim,
    hasEngagementLetter,
    currentStage: c.workflow_stage,
    daysSinceRetainer: c.retainer_date
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(c.retainer_date).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0,
    courtStrictness: courtProfile?.rehab_characteristics.strictness,
  });

  // 증거 갭 분석 (활성 전략 기준)
  const activeStrategyKeys = intelSnapshot.strategy.available_tactics.map((t) => t.key);
  const domain = getDomain(c.case_type);
  const evidenceCorpus = buildEvidenceCorpus({
    workflowDocs: workflowDocsData,
    attachments: (attachments ?? []).map((a) => ({ original_name: a.original_name })),
  });
  const evidenceGaps =
    domain && activeStrategyKeys.length > 0
      ? analyzeEvidenceGaps(domain, activeStrategyKeys, evidenceCorpus)
      : [];

  // ClientProfile용 문서 체크리스트 (증빙 흡수)
  const clientDocuments = template
    ? template.document_keys.map((k) => {
        const d = DOCUMENTS[k];
        return {
          key: k,
          label: d?.label ?? k,
          required: !!d?.required,
          received: (workflowDocsData[k]?.status ?? 'missing') === 'received',
        };
      })
    : [];

  const clientSummary = c.client
    ? {
        id: c.client.id,
        name: c.client.name,
        phone: c.client.phone,
        email: c.client.email,
        memo: c.client.memo,
        occupation: c.client.occupation,
        monthly_income_krw: c.client.monthly_income_krw,
        total_debt_krw: c.client.total_debt_krw,
        dependents_count: c.client.dependents_count,
        assets: c.client.assets ?? [],
        risk_flags: c.client.risk_flags ?? {},
        preferentialFoundCount: preferentialCount,
        hasRepaymentSim,
        hasEngagementLetter,
        documents: clientDocuments,
      }
    : null;

  // 통합 타임라인: events + ticket activities, 날짜 순 (최신 위)
  const timelineItems: Array<{
    id: string;
    date: string;
    kind: 'milestone' | 'event' | 'ticket_created' | 'ticket_moved' | 'ticket_edited' | 'other';
    title: string;
    detail?: string | null;
    source_type?: string;
  }> = [];

  for (const ev of events ?? []) {
    const date = ev.occurred_at ?? ev.created_at;
    const sourceLabel =
      ev.source_type === 'milestone'
        ? '이력'
        : ev.source_type === 'email'
          ? '이메일'
          : ev.source_type === 'kakao'
            ? '카톡'
            : ev.source_type === 'phone' || ev.source_type === 'realtime_audio'
              ? '통화'
              : ev.source_type;
    timelineItems.push({
      id: `ev-${ev.id}`,
      date,
      kind: ev.source_type === 'milestone' ? 'milestone' : 'event',
      title: (ev.raw_content ?? '').slice(0, 120) || sourceLabel,
      detail: ev.raw_content,
      source_type: sourceLabel,
    });
  }

  for (const act of activities ?? []) {
    const label =
      act.action === 'created'
        ? '티켓 생성'
        : act.action === 'moved'
          ? '이동'
          : act.action === 'edited'
            ? '편집'
            : act.action === 'approved'
              ? '승인'
              : act.action === 'rejected'
                ? '기각'
                : act.action === 'sent' || act.action === 'executed'
                  ? '실행'
                  : act.action;
    const titleText = (act.to_value as { title?: string } | null)?.title ?? '';
    timelineItems.push({
      id: `act-${act.id}`,
      date: act.created_at,
      kind:
        act.action === 'created'
          ? 'ticket_created'
          : act.action === 'moved'
            ? 'ticket_moved'
            : 'other',
      title: titleText ? `${label}: ${titleText}` : label,
    });
  }

  timelineItems.sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader active="cases" />
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
        <div>
          <Link
            href="/cases"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← 사건 목록
          </Link>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold">{c.title}</h1>
                <span
                  className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    c.status === 'active'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {c.status === 'active' ? '진행중' : '종결'}
                </span>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {c.client && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">고객</span>
                    <Link
                      href={`/clients/${c.client.id}`}
                      className="hover:underline"
                    >
                      {c.client.name}
                    </Link>
                  </div>
                )}
                {c.case_type && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">유형</span>
                    <span>{CASE_TYPE_LABEL[c.case_type]}</span>
                  </div>
                )}
                {c.case_number && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">사건번호</span>
                    <span>{c.case_number}</span>
                  </div>
                )}
                {c.court && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">법원</span>
                    <span>{c.court}</span>
                  </div>
                )}
                {c.opposing_party && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">상대방</span>
                    <span>{c.opposing_party}</span>
                  </div>
                )}
                {c.retainer_date && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">수임일</span>
                    <span>{format(parseISO(c.retainer_date), 'yyyy-MM-dd')}</span>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <span className="text-zinc-500 w-20 shrink-0">담당</span>
                  <AssigneeSelect
                    value={c.assigned_to}
                    kind="case"
                    entityId={c.id}
                    members={teamMembers}
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-zinc-500 w-20 shrink-0">🔒 접근</span>
                  <VisibilitySelect caseId={c.id} value={c.visibility} />
                </div>
                {c.closed_date && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">종결일</span>
                    <span>{format(parseISO(c.closed_date), 'yyyy-MM-dd')}</span>
                  </div>
                )}
                {c.outcome && (
                  <div className="flex gap-2">
                    <span className="text-zinc-500 w-20 shrink-0">결과</span>
                    <span>{c.outcome}</span>
                  </div>
                )}
              </div>
            </div>
            <CaseActions caseId={c.id} status={c.status} />
          </div>
        </div>

        {/* 개인회생 전용 대시보드 */}
        {isRehabMode && template && courtProfile && c.client && clientSummary && (
          <RehabDashboard
            caseId={c.id}
            caseData={{
              title: c.title,
              case_number: c.case_number,
              court: c.court,
              retainer_date: c.retainer_date,
              workflow_stage: c.workflow_stage,
              workflow_docs: workflowDocsData,
              free_notes: c.free_notes,
            }}
            clientSummary={clientSummary}
            template={template}
            history={workflowHistoryData}
            courtProfile={courtProfile}
            creditorsCount={counterparties.length}
            preferentialCount={preferentialCount}
            topRec={recs[0] ?? null}
            intelSnapshot={intelSnapshot}
            evidenceGaps={evidenceGaps}
            actorMap={actorMap}
            childrenTabs={{
              docs: (
                <WorkflowPanel
                  caseId={c.id}
                  template={template}
                  currentStage={c.workflow_stage}
                  docs={workflowDocsData}
                  history={workflowHistoryData}
                  isInitialized={true}
                />
              ),
              creditors: (
                <CreditorTable
                  caseId={c.id}
                  actors={actorMap['creditor'] ?? []}
                />
              ),
              analysis: (
                <div className="space-y-4">
                  <PreferentialAnalyzer caseId={c.id} />
                  <RepaymentSimulator />
                </div>
              ),
              filing: (
                <div className="space-y-4">
                  <PdfActions caseId={c.id} />
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      🔗 고객 업로드 링크
                    </div>
                    <PortalButton caseId={c.id} />
                  </div>
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
                    <AttachmentList
                      target={{ caseId: c.id }}
                      attachments={attachments ?? []}
                    />
                  </div>
                </div>
              ),
              timeline: (
                <RecommendedActions caseId={c.id} recs={recs} />
              ),
            }}
          />
        )}

        {/* Generic 레이아웃 — Actor 기반 대칭 구성 */}
        {!isRehabMode && c.client && clientSummary && (
          <>
            {/* 좌(의뢰인) / 우(spouse primary adversarial if exists) */}
            <DualActorLayout
              caption={
                domain?.caseType === 'divorce'
                  ? '⚔️ 양측 대립구도 — 의뢰인 vs 배우자 (대칭 인텔)'
                  : undefined
              }
              left={
                <div className="space-y-3">
                  <ClientProfile client={clientSummary} caseId={c.id} caseType={c.case_type} />
                  {domain?.caseType === 'divorce' && (() => {
                    const ourSpec = domain.actors.find((a) => a.role === 'our_side');
                    if (!ourSpec) return null;
                    return (
                      <ActorPanel
                        spec={ourSpec}
                        actor={actorMap['our_side']?.[0] ?? null}
                        caseId={c.id}
                        accentColor="amber"
                      />
                    );
                  })()}
                </div>
              }
              right={
                domain
                  ? (() => {
                      const primaryAdversarial = domain.actors.find(
                        (a) => a.weight === 'primary' && a.adversarial && a.cardinality === 'single',
                      );
                      if (!primaryAdversarial) return <div />;
                      const data = actorMap[primaryAdversarial.role]?.[0] ?? null;
                      return (
                        <ActorPanel
                          spec={primaryAdversarial}
                          actor={data}
                          caseId={c.id}
                          accentColor="red"
                        />
                      );
                    })()
                  : <div />
              }
            />

            {/* 관계 수준 인텔 (혼인관계 등) */}
            {domain && domain.caseFields.length > 0 && (
              <CaseIntelPanel
                caseId={c.id}
                domainLabel={domain.label}
                fields={domain.caseFields}
                initial={ci}
              />
            )}

            {/* Secondary actors (법원 등) */}
            {domain && domain.actors
              .filter((a) => a.weight === 'secondary' && a.cardinality === 'single')
              .map((spec) => (
                <ActorPanel
                  key={spec.role}
                  spec={spec}
                  actor={actorMap[spec.role]?.[0] ?? null}
                  caseId={c.id}
                  accentColor="blue"
                />
              ))}

            <StrategyConsole strategy={intelSnapshot.strategy} caseId={c.id} />
            <EvidenceGapPanel gaps={evidenceGaps} />

            {/* Multiple cardinality actors (상간자 등) */}
            {domain && domain.actors
              .filter((a) => a.cardinality === 'multiple' && a.weight !== 'background')
              .map((spec) => {
                const list = actorMap[spec.role] ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={spec.role} className="space-y-2">
                    {list.map((actor) => (
                      <ActorPanel
                        key={actor.id}
                        spec={spec}
                        actor={actor}
                        caseId={c.id}
                        accentColor="red"
                      />
                    ))}
                  </div>
                );
              })}

            <CaseNotes caseId={c.id} initial={c.free_notes} />
          </>
        )}

        {/* Generic 레이아웃 추천 액션 */}
        {!isRehabMode && template && c.workflow_stage && (
          <RecommendedActions caseId={c.id} recs={recs} />
        )}

        {/* Generic 레이아웃 전용 섹션들 */}
        {!isRehabMode && (
          <>
            {/* StrategyPanel: Actor 온톨로지 없는 도메인만 표시 (legacy) */}
            {c.case_type && !domain && (
              <StrategyPanel
                caseId={c.id}
                caseType={c.case_type}
                counterparties={counterparties}
                adoptedTactics={adoptedTactics}
              />
            )}

            {template && (
              <WorkflowPanel
                caseId={c.id}
                template={template}
                currentStage={c.workflow_stage}
                docs={workflowDocsData}
                history={workflowHistoryData}
                isInitialized={!!c.workflow_stage}
              />
            )}

            <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
              <AttachmentList target={{ caseId: c.id }} attachments={attachments ?? []} />
            </section>

            <details className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
              <summary className="px-5 py-3 cursor-pointer text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex items-center justify-between">
                <span>🧰 고급 도구 (수동 실행)</span>
                <span className="text-xs text-zinc-500 font-normal">
                  권장 액션이 없어도 직접 실행
                </span>
              </summary>
              <div className="p-5 space-y-4 border-t border-zinc-200 dark:border-zinc-800">
                <PdfActions caseId={c.id} />
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <PortalButton caseId={c.id} />
                </div>
                {c.case_type === 'other' && <RepaymentSimulator />}
              </div>
            </details>
          </>
        )}

        {activeTickets.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-2">
              활성 할일 ({activeTickets.length})
            </h2>
            <div className="space-y-1.5">
              {activeTickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/kanban`}
                  className={`flex items-center gap-3 p-3 rounded-md bg-white dark:bg-zinc-900 border-l-4 ${PRIORITY_COLOR[(t.priority as 1 | 2 | 3 | 4) ?? 2]} border border-zinc-200 dark:border-zinc-800 hover:shadow-sm`}
                >
                  <span className="text-base">
                    {TICKET_TYPE_ICON[t.type as 'promise' | 'document_request' | 'follow_up']}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-zinc-500 flex gap-1.5 flex-wrap mt-0.5">
                      <span>{t.column_key}</span>
                      {t.due_date && (
                        <>
                          <span>·</span>
                          <span>{format(parseISO(t.due_date), 'yyyy-MM-dd')}</span>
                        </>
                      )}
                      {t.waiting_on && (
                        <>
                          <span>·</span>
                          <span>
                            대기:{' '}
                            {t.waiting_on === 'client'
                              ? '고객'
                              : t.waiting_on === 'court'
                                ? '법원'
                                : '상대'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold mb-2">타임라인</h2>
          {timelineItems.length === 0 ? (
            <p className="text-xs text-zinc-500">이력 없음</p>
          ) : (
            <div className="border-l-2 border-zinc-200 dark:border-zinc-800 ml-2 space-y-3 py-2">
              {timelineItems.map((item) => (
                <div key={item.id} className="relative pl-5">
                  <div
                    className={`absolute -left-[6px] top-1.5 w-2.5 h-2.5 rounded-full ${
                      item.kind === 'milestone'
                        ? 'bg-purple-500'
                        : item.kind === 'event'
                          ? 'bg-blue-500'
                          : item.kind === 'ticket_created'
                            ? 'bg-emerald-500'
                            : 'bg-zinc-400'
                    }`}
                  />
                  <div className="text-xs text-zinc-500">
                    {format(parseISO(item.date), 'yyyy-MM-dd HH:mm')}
                    {item.source_type && ` · ${item.source_type}`}
                  </div>
                  <div className="text-sm mt-0.5 whitespace-pre-wrap">
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {completedTickets.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-500 mb-2">
              완료된 할일 ({completedTickets.length})
            </h2>
            <div className="space-y-1">
              {completedTickets.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-2 text-xs text-zinc-500"
                >
                  <span>{TICKET_TYPE_ICON[t.type as 'promise' | 'document_request' | 'follow_up']}</span>
                  <span className="flex-1 truncate line-through">{t.title}</span>
                  {t.completed_at && (
                    <span>{format(parseISO(t.completed_at), 'yyyy-MM-dd')}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
