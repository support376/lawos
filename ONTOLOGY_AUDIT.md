# LawOS 온톨로지 검증 v2 (2026-04-19)

## 1. 핵심 원칙

> **Everything is client intel.** 의뢰인의 모든 정보(재무 · 위험신호 · 상대 · 증빙 · 절차 · 자유메모)가 전략 활성화의 유일한 인풋이다.

```
                      ┌──────────────────┐
  ┌───────────────── │  의뢰인 인텔     │ ←── 수동 입력 (ClientProfile 편집)
  │                   │ (clients 테이블) │ ←── 자유메모 (CaseNotes)
  │                   │                  │ ←── AI 분석 (PreferentialAnalyzer/RepaymentSim → Event)
  │                   └────────┬─────────┘ ←── 파일 업로드 (Portal → Attachment)
  │                            │
  │                            ▼
  │                   ┌──────────────────┐
  │                   │  분석 (analyzeIntel) │
  │                   │   activation_conditions │
  │                   └────────┬─────────┘
  │                            │
  │                            ▼
  │                   ┌──────────────────┐    수동 보조
  │                   │ 전략 콘솔 (자동) │←──→ StrategyPanel
  │                   │  9개 전략        │     (15 TACTICS 카탈로그)
  │                   └────────┬─────────┘
  │                            │ 채택
  │                            ▼
  │                   ┌──────────────────┐
  │                   │  칸반 티켓 자동  │
  │                   │  생성 (tickets)  │
  │                   └────────┬─────────┘
  │                            │ 실행결과
  │                            ▼
  │                   ┌──────────────────┐
  └──────────────────│  Event           │ (환류: 인텔 업데이트)
                      └──────────────────┘
```

## 2. 개체 지도 (변경사항 ✓)

| 개체 | 테이블 | 새 필드 v2 |
|---|---|---|
| Client | `clients` | ✨ monthly_income_krw · total_debt_krw · dependents_count · occupation · assets · risk_flags · intel_updated_at |
| Case | `cases` | ✨ free_notes |
| 나머지 | (변경 없음) | — |

## 3. 전략 인벤토리 v2

### 자동 전략 (StrategyConsole, 9개) — 인텔 조건식 활성

| 키 | 주 활성화 인풋 | 카테고리 |
|---|---|---|
| preemptive_defense | 엄격법원 + 편파분석 + 의심>0 | defensive |
| creditor_notice_preempt | 채권자≥1 + 신청전 | offensive |
| repayment_negotiate | 시뮬완료 + 소득 + 부채 | settlement |
| asset_audit | 편파분석 + 의심=0 + 엄격법원 + 자산공개 | preparation |
| high_value_defense | 부채≥5억 + 소득입력 | defensive |
| ✨ discharge_defense | risk_flag.gambling + 수임 | defensive |
| ✨ reapplication_strategy | risk_flag.prior_bankruptcy | preparation |
| ✨ voluntary_disclosure | risk_flag.asset_concealment + 자산 | defensive |
| ✨ parallel_suit_mgmt | risk_flag.other_active_suits | preparation |

### 수동 전술 (StrategyPanel → TACTICS 카탈로그, 15개)

개인회생 3개 키:
- `rehab_preemptive_creditor_notice` ← 자동 `creditor_notice_preempt` **개념 동일**
- `rehab_preferential_defense` ← 자동 `preemptive_defense` **개념 동일**
- `rehab_repayment_increase_counter` ← 자동 `repayment_negotiate` **개념 동일**

**🟡 중복 리스크**: 자동 전략 9개 중 3개가 수동 전술 3개와 개념 중복.

### 중복 해결 지침

| 상황 | 쓸 도구 |
|---|---|
| 일반 개인회생 사건 | StrategyConsole (자동) — 인텔 조건 자동검사 |
| 상대방(채권자) 개별 프로파일링 필요 | StrategyPanel — 상대방 약점 × 전술 매칭 |
| 이혼/형사/민사 등 비회생 | StrategyPanel (자동 전략 없음) |

**경계선**: 개인회생 전용 자동 전략은 **StrategyConsole이 일차 진입점**, StrategyPanel은 상대방 단위 보조. 두 채택 액션(`adoptStrategy` vs `adoptTactic`)은 별도 이벤트로 기록되어 구분됨.

## 4. 컴포넌트 책임 지도 v2

| 컴포넌트 | 위치 | 역할 | 편집 |
|---|---|---|---|
| ClientProfile | `/cases/[id]` + ✨`/clients/[id]` | 재무/인적/자산/위험/증빙 | 인라인 |
| CaseNotes | `/cases/[id]` | 사건 자유텍스트 | 직접 |
| StrategyConsole | `/cases/[id]` | 자동 전략 9개 | 채택 버튼 |
| StrategyPanel | `/cases/[id]` | 상대방 + 수동 전술 | 상대방 CRUD |
| WorkflowPanel | `/cases/[id]` 탭 | 서류 수령 토글 | 개별 토글 |
| RecommendedActions | `/cases/[id]` 탭 | 절차 추천 | 트리거 |

## 5. 인풋→전략 매트릭스 (v2 갱신)

```
[재무4필드] ────┬─→ repayment_negotiate
                ├─→ high_value_defense
                └─→ 인텔 완성도 %

[자산목록] ─────┬─→ asset_audit
                 └─→ voluntary_disclosure (+risk_concealment)

[risk.gambling] ─→ discharge_defense
[risk.prior_bk] ──→ reapplication_strategy
[risk.concealment] → voluntary_disclosure
[risk.parallel] ──→ parallel_suit_mgmt

[편파분석] ─────┬─→ preemptive_defense (+의심>0+엄격)
                 └─→ asset_audit (+의심=0+엄격+자산)

[시뮬] ─────────→ repayment_negotiate
[채권자≥1] ─────→ creditor_notice_preempt
```

## 6. 겹침/일관성 체크 v2

### 🟢 해결됨
- ~~ProcessChecklist~~: 삭제 — 전부 ClientProfile로 흡수
- ~~risk_flags 미연결~~: 4개 전략이 risk_flags로 활성 (gambling/prior_bk/concealment/parallel)
- ~~/clients/[id] 파편화~~: ClientProfile 재사용으로 편집 UX 일관화

### 🟡 검토 항목

1. **`/clients/[id]`의 ClientProfile에 documents 없음**
   - documents는 `workflow_docs`(case-level) 파생 → client 레벨에선 표시 불가
   - 현재: `client.documents`를 안 넘겨서 증빙 섹션 자동 숨김. ✅ 의도대로 동작.

2. **Client 재무필드는 여러 case가 공유**
   - `clients.monthly_income_krw` = 이 사람의 현재 재무
   - ✅ 의도: 사람 속성이 사건 속성이 아님. 동일인 다른 사건도 같은 재무 사용.
   - ⚠ 리스크: 수임 당시 재무로 snapshot이 필요하면 별도 `cases.financial_snapshot` JSONB 추가 필요 — 현재는 사용자가 그 요구 없었음.

3. **자동 전략 vs 수동 전술 개념중복 3건**
   - preemptive_defense ≈ rehab_preferential_defense
   - creditor_notice_preempt ≈ rehab_preemptive_creditor_notice
   - repayment_negotiate ≈ rehab_repayment_increase_counter
   - 두 번 채택하면 칸반 중복 티켓 생성 가능 → 향후 개선: `adoptStrategy` 진입시 기존 `case_tactics_adopted`에 같은 개념 키 있는지 체크

4. **ClientProfile.memo vs Case.free_notes**
   - Client.memo = 사람 메모 (사건 횡단)
   - Case.free_notes = 사건 메모
   - UI 제목: "메모" vs "사건 노트" — 구분 OK ✅

5. **risk_flags 토글 → 즉시 전략 재계산?**
   - updateClientIntel → revalidatePath → analyzeIntel 재실행 ✅

### 🔴 남은 숙제
- [ ] `adoptStrategy` 중복 채택 가드 (기존 `case_tactics_adopted.tactic_key` 존재 체크)
- [ ] free_notes LLM 자동 분석 → risk_flags 추론
- [ ] 재무필드 snapshot 필요 여부 사용자 확인
- [ ] ClientProfile 편집 diff를 events에 기록해 타임라인 가시화 (현재 "N개 필드 업데이트"만)
- [ ] 수동 전술 3개를 deprecated 표시해서 자동으로 안내

## 7. 데이터 정합성 테스트 시나리오

| 시나리오 | 기대 결과 |
|---|---|
| 월소득 입력 → 저장 | 재무 완성도 % 상승, repayment_negotiate 활성화 조건 ✓ |
| risk.gambling 토글 ON → 저장 | discharge_defense 전략 카드 등장 |
| 전략 채택 → 칸반 확인 | Triage 컬럼에 티켓 N개 자동 생성 |
| PreferentialAnalyzer 실행 → 의심 2건 탐지 | preemptive_defense 카드가 locked→available |
| /clients/[id]에서 월소득 편집 | 해당 의뢰인의 모든 사건에서 동기화 |

## 8. 결론

- **일관됨**: 인텔→조건→전략→티켓 환류 루프 유지.
- **신규 9전략이 risk_flags와 연결**되어 "위험신호는 보기용"이 아닌 **전략 활성화 인풋**으로 승격.
- **/clients/[id]·/cases/[id] 공유 ClientProfile**로 편집점 일원화.
- **주요 중복**: 수동 전술 3개 ≈ 자동 전략 3개. 단기적으론 공존 가능하나 중복 채택 가드 필요 (숙제 #1).
