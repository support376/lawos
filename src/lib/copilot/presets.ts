// 상담 코파일럿 프리셋 — 상담 목적별 AI 추출 방향 + 실시간 체크리스트

export interface CopilotPreset {
  key: string;
  label: string;
  emoji: string;
  instructions: string; // LLM에게 전달할 추가 지시
  checklist: string[]; // 녹음 중 변호사가 체크할 항목
  defaultMilestoneSummary: string;
}

export const COPILOT_PRESETS: CopilotPreset[] = [
  {
    key: 'initial',
    label: '초회 상담',
    emoji: '🤝',
    instructions:
      '첫 상담이므로 고객의 기본 상황 파악과 초기 합의가 중요. 수임 의사, 수임료 합의, 필요 서류 안내, 다음 약속 일정을 특히 놓치지 말 것.',
    checklist: [
      '수임 여부 / 수임료 합의',
      '사건 핵심 사실관계',
      '증거/서류 가능 여부',
      '고객 연락 가능 시간',
      '다음 단계 일정',
    ],
    defaultMilestoneSummary: '초회 상담',
  },
  {
    key: 'progress',
    label: '사건 진행 확인',
    emoji: '📊',
    instructions:
      '이미 진행 중인 사건. 이전에 약속된 사항(서류 전달, 일정 등)이 이행됐는지, 새로 발생한 후속 조치가 있는지를 중점적으로 추출.',
    checklist: [
      '지난 상담 이후 변경사항',
      '대기 중이던 서류/자료 수령',
      '상대/법원 움직임',
      '추가 조치 필요 항목',
      '다음 기일/제출일',
    ],
    defaultMilestoneSummary: '진행상황 점검',
  },
  {
    key: 'documents',
    label: '서류 전달/수령',
    emoji: '📄',
    instructions:
      '서류 관련 상담. 전달받거나 요청한 서류의 내용/완전성/추가로 필요한 것을 확인. 놓친 서류가 없는지 주의.',
    checklist: [
      '수령 서류 목록 확인',
      '누락/추가 필요 서류',
      '공증/인증 필요 여부',
      '반환/복사본 필요성',
    ],
    defaultMilestoneSummary: '서류 전달/수령',
  },
  {
    key: 'investigation',
    label: '쟁점/재산 조사',
    emoji: '🔍',
    instructions:
      '사실관계나 쟁점을 깊이 파악하는 상담. 상대방 주장, 증거 관계, 재산/부채 상황 등을 구조화해서 추출. 추가 조사 필요한 포인트 표시.',
    checklist: [
      '쟁점별 사실관계 확인',
      '증거 존재/접근 가능성',
      '상대방 대응 시나리오',
      '추가 조사 필요 사항',
    ],
    defaultMilestoneSummary: '쟁점/조사 상담',
  },
  {
    key: 'decision',
    label: '전략/결정 회의',
    emoji: '🎯',
    instructions:
      '전략 수립, 합의/소송 여부 결정 등 방향성 논의. 합의된 방침, 거부한 옵션, 다음 액션을 명확히 추출.',
    checklist: [
      '합의된 방침',
      '거부/보류된 옵션',
      '기한이 걸린 결정',
      '다음 회의/일정',
    ],
    defaultMilestoneSummary: '전략 결정 회의',
  },
  {
    key: 'custom',
    label: '커스텀',
    emoji: '✏️',
    instructions: '',
    checklist: [],
    defaultMilestoneSummary: '상담',
  },
];

export function findPreset(key: string): CopilotPreset {
  return COPILOT_PRESETS.find((p) => p.key === key) ?? COPILOT_PRESETS[0];
}
