'use client';

import { useState, useTransition } from 'react';
import {
  createCounterparty,
  addWeakness,
  adoptTactic,
  updateAdoptedTactic,
  type WeaknessEntry,
} from '@/app/actions/counterparty';
import { recommendTactics, type TacticRecommendation } from '@/lib/ontology/strategy';
import { TACTICS } from '@/lib/ontology/tactics';

interface Counterparty {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  profile: {
    weaknesses?: WeaknessEntry[];
    personality_tags?: string[];
  };
  consent_recorded: boolean;
  consent_scope: string | null;
}

interface AdoptedTactic {
  id: string;
  tactic_key: string;
  status: 'planned' | 'executing' | 'completed' | 'abandoned';
  outcome: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  offensive: '⚔️ 공격',
  defensive: '🛡 방어',
  settlement: '🤝 합의 유도',
  procedural: '📋 절차',
};

const CATEGORY_COLOR: Record<string, string> = {
  offensive: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  defensive: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  settlement: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  procedural: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const RISK_COLOR: Record<string, string> = {
  low: 'text-emerald-600',
  medium: 'text-amber-600',
  high: 'text-red-600',
};

export function StrategyPanel({
  caseId,
  caseType,
  counterparties,
  adoptedTactics,
}: {
  caseId: string;
  caseType: string;
  counterparties: Counterparty[];
  adoptedTactics: AdoptedTactic[];
}) {
  const [expanded, setExpanded] = useState(true);

  // 첫 상대방 기준 추천 (복수 상대방은 V2)
  const primary = counterparties[0] ?? null;
  const adoptedKeys = adoptedTactics.map((a) => a.tactic_key);

  const recs = recommendTactics({
    caseType,
    counterparty: primary
      ? {
          id: primary.id,
          name: primary.name,
          role: primary.role,
          weaknesses: primary.profile.weaknesses,
          personality_tags: primary.profile.personality_tags,
          consent_recorded: primary.consent_recorded,
        }
      : null,
    adoptedTacticKeys: adoptedKeys,
  });

  const topRecs = recs.slice(0, 5);

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div>
          <h3 className="text-sm font-semibold">⚔️ 전략 · 전술 플레이북</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            상대방 약점 × 법정 전술 매칭 · 승리 논리 설계
          </p>
        </div>
        <span className="text-xs text-zinc-500">{expanded ? '접기 ▲' : '열기 ▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <CounterpartySection
            caseId={caseId}
            counterparties={counterparties}
          />

          {primary && (
            <>
              <hr className="border-zinc-200 dark:border-zinc-800" />
              <TacticsSection
                caseId={caseId}
                recommendations={topRecs}
                adopted={adoptedTactics}
                counterpartyId={primary.id}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ============ 상대방 섹션 ============
function CounterpartySection({
  caseId,
  counterparties,
}: {
  caseId: string;
  counterparties: Counterparty[];
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          👥 상대방 ({counterparties.length})
        </h4>
        {counterparties.length === 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            + 상대방 추가
          </button>
        )}
      </div>

      {counterparties.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          상대방을 추가하면 약점 분석 + 전술 매칭이 활성화됩니다.
        </p>
      ) : (
        <div className="space-y-2">
          {counterparties.map((cp) => (
            <CounterpartyCard key={cp.id} counterparty={cp} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCounterpartyModal
          caseId={caseId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function CounterpartyCard({ counterparty }: { counterparty: Counterparty }) {
  const [adding, setAdding] = useState(false);

  const weaknesses = counterparty.profile.weaknesses ?? [];
  const personality = counterparty.profile.personality_tags ?? [];

  return (
    <div className="p-3 border border-zinc-200 dark:border-zinc-700 rounded bg-zinc-50 dark:bg-zinc-800/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{counterparty.name}</div>
          {counterparty.role && (
            <div className="text-xs text-zinc-500">{counterparty.role}</div>
          )}
          {counterparty.description && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
              {counterparty.description}
            </p>
          )}
        </div>
        <span className="text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
          ✓ 동의 기록됨
        </span>
      </div>

      {personality.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {personality.map((t, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">
            🎯 약점 ({weaknesses.length})
          </span>
          <button
            onClick={() => setAdding(!adding)}
            className="text-xs underline text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {adding ? '취소' : '+ 약점 추가'}
          </button>
        </div>

        {weaknesses.length === 0 && !adding && (
          <p className="text-xs text-zinc-500 italic">
            공개정보·합법 조사로 파악된 약점을 기록하세요.
          </p>
        )}

        {weaknesses.length > 0 && (
          <div className="space-y-1">
            {weaknesses.map((w, i) => (
              <div key={i} className="text-xs flex items-center gap-2">
                <span>▸</span>
                <span className="flex-1">{w.label}</span>
                {w.source_type && (
                  <span className="text-zinc-500">[{sourceLabel(w.source_type)}]</span>
                )}
              </div>
            ))}
          </div>
        )}

        {adding && (
          <AddWeaknessForm
            counterpartyId={counterparty.id}
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </div>
  );
}

function sourceLabel(s: string): string {
  return (
    {
      public_record: '공개등기',
      interview: '인터뷰',
      detective: '공인탐정',
      news: '언론',
      sns_public: 'SNS 공개',
      client_provided: '의뢰인',
      other: '기타',
    } as Record<string, string>
  )[s] ?? s;
}

function AddWeaknessForm({
  counterpartyId,
  onDone,
}: {
  counterpartyId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [source, setSource] = useState<WeaknessEntry['source_type']>('public_record');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!label.trim()) return;
    startTransition(async () => {
      await addWeakness({
        counterpartyId,
        weakness: {
          label: label.trim(),
          source_type: source,
          legality: 'clear_legal',
          notes: notes.trim() || undefined,
        },
      });
      setLabel('');
      setNotes('');
      onDone();
    });
  };

  return (
    <div className="mt-2 p-2 bg-white dark:bg-zinc-900 rounded space-y-1.5 border border-zinc-200 dark:border-zinc-700">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="약점/성향 (예: 공개석상 기피, 평판 민감)"
        className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
      />
      <div className="grid grid-cols-2 gap-1">
        <select
          value={source}
          onChange={(e) =>
            setSource(e.target.value as WeaknessEntry['source_type'])
          }
          className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
        >
          <option value="public_record">공개등기·공시</option>
          <option value="interview">의뢰인 인터뷰</option>
          <option value="detective">공인탐정</option>
          <option value="news">언론</option>
          <option value="sns_public">SNS 공개</option>
          <option value="client_provided">의뢰인 제공</option>
          <option value="other">기타</option>
        </select>
        <button
          onClick={submit}
          disabled={pending || !label.trim()}
          className="px-2 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs disabled:opacity-50"
        >
          {pending ? '...' : '저장'}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="근거/비고 (선택)"
        rows={2}
        className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs resize-none"
      />
    </div>
  );
}

// ============ 상대방 생성 모달 (동의 필수) ============
function CreateCounterpartyModal({
  caseId,
  onClose,
}: {
  caseId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [consentText, setConsentText] = useState(
    '공개 정보 + 공인탐정업법 범위 내 합법적 조사',
  );
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!consentChecked) {
      setError('의뢰인 동의 확인 필수');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createCounterparty({
          caseId,
          name,
          role: role || null,
          description: description || null,
          consentScope: consentText,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : '생성 실패');
      }
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-zinc-900 rounded-lg w-full max-w-md p-5 space-y-3 shadow-xl"
      >
        <div>
          <h3 className="font-semibold">상대방 프로필 생성</h3>
          <p className="text-xs text-zinc-500 mt-1">
            변호사법 §26 비밀유지의무, 개인정보보호법을 준수하는 범위에서만 사용하세요.
          </p>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름/상호 *"
          required
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="역할 (예: 피고, 배우자, 채권자, 상대 대리인)"
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="간단 설명 (직업·규모 등)"
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm resize-none"
        />

        <div className="p-3 border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 rounded text-xs">
          <div className="font-medium text-amber-900 dark:text-amber-200 mb-1">
            📋 의뢰인 동의 기록
          </div>
          <textarea
            value={consentText}
            onChange={(e) => setConsentText(e.target.value)}
            rows={2}
            className="w-full px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs resize-none mb-2"
          />
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-amber-800 dark:text-amber-300">
              의뢰인으로부터 위 범위의 상대방 정보 수집 동의를 받았으며, 합법 경계를 넘지 않음을 확인합니다.
            </span>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={pending || !name.trim() || !consentChecked}
            className="px-3 py-1.5 text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 전술 섹션 ============
function TacticsSection({
  caseId,
  recommendations,
  adopted,
  counterpartyId,
}: {
  caseId: string;
  recommendations: TacticRecommendation[];
  adopted: AdoptedTactic[];
  counterpartyId: string;
}) {
  return (
    <div className="p-4 space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          🎯 승리 전술 제안 (상위 {recommendations.length}개)
        </h4>
        <p className="text-xs text-zinc-500 mt-0.5">
          상대방 약점 × 사건유형 → 합법 전술 매칭
        </p>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-xs text-zinc-500 italic py-4 text-center">
          이 사건 유형에 해당하는 전술이 카탈로그에 없거나 모두 채택됨.
        </p>
      ) : (
        <div className="space-y-2">
          {recommendations.map((r) => (
            <TacticCard
              key={r.tactic.key}
              rec={r}
              caseId={caseId}
              counterpartyId={counterpartyId}
            />
          ))}
        </div>
      )}

      {adopted.length > 0 && (
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <h5 className="text-xs font-semibold mb-2">채택된 전술 ({adopted.length})</h5>
          <div className="space-y-1">
            {adopted.map((a) => (
              <AdoptedTacticRow key={a.id} adopted={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TacticCard({
  rec,
  caseId,
  counterpartyId,
}: {
  rec: TacticRecommendation;
  caseId: string;
  counterpartyId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const t = rec.tactic;

  const adopt = () => {
    startTransition(async () => {
      await adoptTactic({
        caseId,
        tacticKey: t.key,
        counterpartyId,
      });
    });
  };

  return (
    <div className="p-3 border border-zinc-200 dark:border-zinc-700 rounded">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${CATEGORY_COLOR[t.category]}`}
            >
              {CATEGORY_LABEL[t.category]}
            </span>
            <span className="text-sm font-medium">{t.name}</span>
            {rec.matched_triggers.length > 0 && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                ● 약점 매칭 {rec.matched_triggers.length}개
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            {t.summary}
          </p>
          <div className="mt-1.5 flex gap-3 text-xs text-zinc-500">
            {t.estimated_success !== null && (
              <span>
                성공률 {Math.round(t.estimated_success * 100)}%
              </span>
            )}
            <span className={RISK_COLOR[t.risk_level]}>
              리스크: {t.risk_level === 'low' ? '낮음' : t.risk_level === 'medium' ? '중간' : '높음'}
            </span>
            <span>매칭 {Math.round(rec.match_score * 100)}%</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => setOpen(!open)}
            className="text-xs px-2.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            {open ? '접기' : '상세'}
          </button>
          <button
            onClick={adopt}
            disabled={pending}
            className="text-xs px-2.5 py-1 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? '...' : '채택'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 space-y-2 text-xs">
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mb-0.5">
              상세 전술
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
              {t.description}
            </p>
          </div>
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mb-0.5">
              성립 요건
            </div>
            <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
              {t.required_conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mb-0.5">
              법적 근거
            </div>
            <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
              {t.legal_basis.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300 mb-0.5">
              예상 효과
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">{t.expected_effect}</p>
          </div>
          <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
            <div className="font-semibold text-amber-900 dark:text-amber-200 mb-0.5">
              ⚠ 리스크
            </div>
            <p className="text-amber-800 dark:text-amber-300">{t.risk_description}</p>
          </div>
          {rec.caution.length > 0 && (
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded">
              <div className="font-semibold mb-0.5">주의</div>
              <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                {rec.caution.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {t.professional_notes && (
            <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
              <div className="font-semibold text-blue-900 dark:text-blue-200 mb-0.5">
                💼 실무 팁
              </div>
              <p className="text-blue-800 dark:text-blue-300">{t.professional_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AdoptedTacticRow({ adopted }: { adopted: AdoptedTactic }) {
  const [pending, startTransition] = useTransition();
  const t = TACTICS[adopted.tactic_key];

  return (
    <div className="flex items-center gap-2 text-xs p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded">
      <span className="flex-1">
        {t?.name ?? adopted.tactic_key}
      </span>
      <select
        value={adopted.status}
        disabled={pending}
        onChange={(e) =>
          startTransition(() =>
            updateAdoptedTactic({
              adoptedId: adopted.id,
              status: e.target.value as 'planned' | 'executing' | 'completed' | 'abandoned',
            }),
          )
        }
        className="text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
      >
        <option value="planned">계획</option>
        <option value="executing">실행중</option>
        <option value="completed">완료</option>
        <option value="abandoned">포기</option>
      </select>
      {adopted.outcome && (
        <span className="text-zinc-500">· {adopted.outcome}</span>
      )}
    </div>
  );
}
