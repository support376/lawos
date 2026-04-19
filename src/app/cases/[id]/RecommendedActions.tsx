'use client';

import { useState } from 'react';
import type { Recommendation } from '@/lib/ontology/recommendations';
import { PdfActionsModal } from './PdfActionsModal';
import { PreferentialModal } from './PreferentialModal';
import { SimulatorModal } from './SimulatorModal';
import { PortalModal } from './PortalModal';
import { DocRequestModal } from './DocRequestModal';
import { AdvanceStageButton } from './AdvanceStageButton';

type ActiveModal =
  | null
  | 'engagement_letter'
  | 'creditor_notice'
  | 'preferential'
  | 'simulate'
  | 'portal'
  | 'doc_request'
  | 'doc_reminder';

const PRIORITY_BADGE: Record<Recommendation['priority'], string> = {
  urgent: 'bg-red-600 text-white',
  suggested: 'bg-blue-600 text-white',
  optional: 'bg-zinc-500 text-white',
};

const PRIORITY_LABEL: Record<Recommendation['priority'], string> = {
  urgent: '긴급',
  suggested: '권장',
  optional: '선택',
};

export function RecommendedActions({
  caseId,
  recs,
}: {
  caseId: string;
  recs: Recommendation[];
}) {
  const [modal, setModal] = useState<ActiveModal>(null);

  if (recs.length === 0) {
    return (
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 text-center">
        <p className="text-sm text-zinc-500">
          ✓ 지금 할 일 없음. 새 정보(이메일/카톡/통화/업로드)가 들어오면 다음 행동이 여기 나타납니다.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">⚡ 지금 해야 할 것 ({recs.length})</h2>
        <p className="text-xs text-zinc-500">
          스테이지 + 이벤트 + 서류 상태 분석 결과
        </p>
      </div>

      <div className="space-y-1.5">
        {recs.map((r, i) => (
          <RecCard
            key={i}
            rec={r}
            caseId={caseId}
            onTrigger={() => openForAction(r, setModal)}
          />
        ))}
      </div>

      {/* 모달들 */}
      <PdfActionsModal
        caseId={caseId}
        which={
          modal === 'engagement_letter'
            ? 'engagement'
            : modal === 'creditor_notice'
              ? 'creditor'
              : null
        }
        onClose={() => setModal(null)}
      />
      <PreferentialModal
        caseId={caseId}
        open={modal === 'preferential'}
        onClose={() => setModal(null)}
      />
      <SimulatorModal
        open={modal === 'simulate'}
        onClose={() => setModal(null)}
      />
      <PortalModal
        caseId={caseId}
        open={modal === 'portal'}
        onClose={() => setModal(null)}
      />
      <DocRequestModal
        caseId={caseId}
        mode={modal === 'doc_reminder' ? 'reminder' : 'request'}
        open={modal === 'doc_request' || modal === 'doc_reminder'}
        onClose={() => setModal(null)}
      />
    </section>
  );
}

function openForAction(r: Recommendation, setModal: (m: ActiveModal) => void) {
  switch (r.action) {
    case 'generate_engagement_letter':
      setModal('engagement_letter');
      break;
    case 'generate_creditor_notice':
      setModal('creditor_notice');
      break;
    case 'detect_preferential_payment':
      setModal('preferential');
      break;
    case 'simulate_repayment':
    case 'recommend_path':
    case 'recalculate_repayment':
      setModal('simulate');
      break;
    case 'send_portal_link':
      setModal('portal');
      break;
    case 'send_doc_request':
      setModal('doc_request');
      break;
    case 'send_doc_reminder':
      setModal('doc_reminder');
      break;
    // Stage advance는 아래 AdvanceStageButton 으로 분기 처리
  }
}

function RecCard({
  rec,
  caseId,
  onTrigger,
}: {
  rec: Recommendation;
  caseId: string;
  onTrigger: () => void;
}) {
  // Stage 전환 추천은 별도 버튼
  const stageAdvanceMap: Record<string, string> = {
    advance_to_investigation: 'investigation',
    advance_to_creditor_response: 'creditor_response',
    advance_to_court_filing: 'court_filing',
    advance_to_monitoring: 'repayment_monitoring',
  };
  const stageTarget = stageAdvanceMap[rec.action];

  return (
    <div
      className={`p-3 rounded-md border bg-white dark:bg-zinc-900 ${
        rec.pulse
          ? 'border-blue-400 dark:border-blue-600 shadow-sm'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 leading-none mt-0.5">
          {rec.icon ?? '•'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_BADGE[rec.priority]}`}
            >
              {PRIORITY_LABEL[rec.priority]}
            </span>
            <span className="font-medium text-sm">{rec.label}</span>
            {rec.pulse && (
              <span className="text-xs text-blue-600 dark:text-blue-400">● 새 정보</span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {rec.reason}
          </p>
        </div>
        <div className="shrink-0">
          {stageTarget ? (
            <AdvanceStageButton caseId={caseId} to={stageTarget} />
          ) : (
            <button
              onClick={onTrigger}
              className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
            >
              실행
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
