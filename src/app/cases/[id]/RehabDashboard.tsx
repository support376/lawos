'use client';

import { useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { CaseTemplate, WorkflowDocs, StageHistoryEntry } from '@/lib/ontology/types';
import { DOCUMENTS } from '@/lib/ontology/documents';
import type { CourtProfile } from '@/lib/ontology/courts';
import type { Recommendation } from '@/lib/ontology/recommendations';
import type { IntelSnapshot } from '@/lib/ontology/intel-gaps';
import { StrategyConsole } from './StrategyConsole';
import { ClientProfile, type ClientSummary } from './ClientProfile';
import { CaseNotes } from './CaseNotes';
import { EvidenceGapPanel } from './EvidenceGapPanel';
import type { EvidenceGap } from '@/lib/ontology/engine/evidence-gap';
import { ActorPanel, type ActorData } from './ActorPanel';
import { DualActorLayout } from './DualActorLayout';
import { CreditorTable } from './CreditorTable';
import { personalRehabActors } from '@/lib/ontology/domains/personal_rehab/actors';

type Tab = 'docs' | 'creditors' | 'analysis' | 'filing' | 'timeline';

const STRICTNESS_LABEL: Record<string, string> = {
  very_strict: '매우 엄격',
  strict: '엄격',
  moderate: '보통',
  flexible: '유연',
};

const STRICTNESS_COLOR: Record<string, string> = {
  very_strict: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-300',
  strict: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
  moderate: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-300',
  flexible: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
};

export interface RehabDashboardProps {
  caseId: string;
  caseData: {
    title: string;
    case_number: string | null;
    court: string | null;
    retainer_date: string | null;
    workflow_stage: string | null;
    workflow_docs: WorkflowDocs;
    free_notes: string | null;
  };
  clientSummary: ClientSummary;
  template: CaseTemplate;
  history: StageHistoryEntry[];
  courtProfile: CourtProfile;
  creditorsCount: number;
  preferentialCount: number;
  topRec: Recommendation | null;
  intelSnapshot: IntelSnapshot;
  evidenceGaps: EvidenceGap[];
  actorMap: Record<string, ActorData[]>;
  childrenTabs: {
    docs: React.ReactNode;
    creditors: React.ReactNode;
    analysis: React.ReactNode;
    filing: React.ReactNode;
    timeline: React.ReactNode;
  };
}

export function RehabDashboard({
  caseId,
  caseData,
  clientSummary,
  template,
  history,
  courtProfile,
  creditorsCount,
  preferentialCount,
  topRec,
  intelSnapshot,
  evidenceGaps,
  actorMap,
  childrenTabs,
}: RehabDashboardProps) {
  const courtSpec = personalRehabActors.find((a) => a.role === 'court')!;
  const courtActor = actorMap['court']?.[0] ?? null;
  const creditorActors = actorMap['creditor'] ?? [];
  const [tab, setTab] = useState<Tab>('docs');

  const requiredKeys = template.document_keys.filter(
    (k) => DOCUMENTS[k]?.required,
  );
  const received = requiredKeys.filter(
    (k) => (caseData.workflow_docs[k]?.status ?? 'missing') === 'received',
  ).length;

  const stages = template.stages;
  const stageIdx = stages.findIndex((s) => s.key === caseData.workflow_stage);

  const retainerDate = caseData.retainer_date
    ? parseISO(caseData.retainer_date)
    : null;
  const daysSinceRetainer = retainerDate
    ? differenceInCalendarDays(new Date(), retainerDate)
    : 0;

  return (
    <div className="space-y-4">
      {/* 법원 힌트 박스 (컴팩트) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="font-semibold text-sm">⚖️ {courtProfile.name}</span>
          <span
            className={`px-1.5 py-0.5 rounded ${STRICTNESS_COLOR[courtProfile.rehab_characteristics.strictness]}`}
          >
            심사 {STRICTNESS_LABEL[courtProfile.rehab_characteristics.strictness]}
          </span>
          <span className="text-zinc-500">
            평균 {courtProfile.rehab_characteristics.avg_processing_days}일
          </span>
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-600 dark:text-zinc-400">
            관심: {courtProfile.rehab_characteristics.key_focus.join(' / ')}
          </span>
          {retainerDate && (
            <span className="ml-auto text-zinc-500">수임 {daysSinceRetainer}일 경과</span>
          )}
        </div>
        {courtProfile.rehab_characteristics.tactical_notes.length > 0 && (
          <details className="text-xs mt-2">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              대응 전략 {courtProfile.rehab_characteristics.tactical_notes.length}개 · 보정명령 빈출사유
            </summary>
            <ul className="mt-1 space-y-0.5 pl-4 list-disc text-zinc-600 dark:text-zinc-400">
              {courtProfile.rehab_characteristics.tactical_notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
              <li className="text-zinc-500 pt-1 border-t border-zinc-200 dark:border-zinc-800 mt-1">
                <strong>보정명령 빈출:</strong>{' '}
                {courtProfile.rehab_characteristics.common_correction_reasons.join(' / ')}
              </li>
            </ul>
          </details>
        )}
      </div>

      {/* Actor 대결구도: 의뢰인 ↔ 법원 (둘 다 primary) */}
      <DualActorLayout
        caption="⚔️ 핵심 대결구도 — 의뢰인 vs 법원 심사"
        left={<ClientProfile client={clientSummary} caseId={caseId} caseType="personal_rehab" />}
        right={
          <ActorPanel
            spec={courtSpec}
            actor={courtActor}
            caseId={caseId}
            accentColor="blue"
          />
        }
      />

      {/* 전략 콘솔 (메인 아웃풋) */}
      <StrategyConsole strategy={intelSnapshot.strategy} caseId={caseId} />

      {/* 증거 갭 분석 */}
      <EvidenceGapPanel gaps={evidenceGaps} />

      {/* 채권자 명부 (배경 Actor) */}
      <CreditorTable caseId={caseId} actors={creditorActors} />

      {/* 다음 행동 (최우선 1개) */}
      {topRec && (
        <div
          className={`p-4 rounded-lg border-2 ${
            topRec.priority === 'urgent'
              ? 'border-red-400 bg-red-50 dark:bg-red-950/20 dark:border-red-700'
              : 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700'
          }`}
        >
          <div className="text-xs font-medium mb-1">
            {topRec.priority === 'urgent' ? '🔴 다음 행동 (긴급)' : '🔵 다음 행동 (권장)'}
          </div>
          <div className="font-semibold text-sm">
            {topRec.icon} {topRec.label}
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-1">
            {topRec.reason}
          </p>
        </div>
      )}

      {/* 사건 노트 (자유 텍스트) */}
      <CaseNotes caseId={caseId} initial={caseData.free_notes} />

      {/* 세부 탭 네비게이션 (서류/채권자/분석/제출/이력) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
          {[
            { key: 'docs', label: '📄 서류', count: `${received}/${requiredKeys.length}` },
            { key: 'creditors', label: '👥 채권자', count: String(creditorsCount) },
            { key: 'analysis', label: '🔍 분석', count: preferentialCount > 0 ? String(preferentialCount) : '—' },
            { key: 'filing', label: '⚖️ 법원 제출', count: stageIdx >= 4 ? '진행' : '' },
            { key: 'timeline', label: '📅 이력', count: `${history.length}` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as Tab)}
              className={`px-4 py-2.5 text-sm whitespace-nowrap flex items-center gap-1.5 ${
                tab === t.key
                  ? 'border-b-2 border-zinc-900 dark:border-zinc-100 font-medium text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {t.label}
              {t.count && (
                <span className="text-xs text-zinc-400">({t.count})</span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'docs' && childrenTabs.docs}
          {tab === 'creditors' && childrenTabs.creditors}
          {tab === 'analysis' && childrenTabs.analysis}
          {tab === 'filing' && childrenTabs.filing}
          {tab === 'timeline' && childrenTabs.timeline}
        </div>
      </div>
    </div>
  );
}
