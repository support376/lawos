// 법원별 개인회생 특성 (실무 경험 기반)
// court 필드 또는 사건번호에서 자동 파싱.

export interface CourtProfile {
  key: string;
  name: string;
  jurisdiction: string;
  rehab_characteristics: {
    strictness: 'very_strict' | 'strict' | 'moderate' | 'flexible';
    avg_processing_days: number;   // 신청부터 인가까지
    key_focus: string[];           // 이 법원이 특히 보는 것
    common_correction_reasons: string[];  // 보정명령 빈출 사유
    tactical_notes: string[];      // 이 법원 대응 팁
  };
}

export const COURTS: Record<string, CourtProfile> = {
  seoul_rehab: {
    key: 'seoul_rehab',
    name: '서울회생법원',
    jurisdiction: '서울특별시',
    rehab_characteristics: {
      strictness: 'very_strict',
      avg_processing_days: 180,
      key_focus: [
        '편파변제 (6개월 내 특정 채권자 상환)',
        '재산목록 정밀도 (법인 지분·제3자 명의 포함)',
        '청산가치 보장원칙 엄격 심사',
        '변제율 20% 미만 사건 인가 까다로움',
      ],
      common_correction_reasons: [
        '통장거래내역 공백',
        '재산목록 누락 (특히 법인)',
        '소득증빙 불일치',
        '편파변제 미해명',
      ],
      tactical_notes: [
        '편파변제 사전 소명 자료 필수 첨부',
        '재산명시·조회 사전 완료 권장',
        '변제계획 1안보다 보수적 안 준비',
        '보정명령 대응 기한 엄수 (지연 시 인가 취소)',
      ],
    },
  },
  suwon: {
    key: 'suwon',
    name: '수원회생법원',
    jurisdiction: '경기도 남부',
    rehab_characteristics: {
      strictness: 'strict',
      avg_processing_days: 150,
      key_focus: ['재산목록 정합성', '소득 안정성', '변제 이행 가능성'],
      common_correction_reasons: ['소득증빙 부족', '부양가족 입증 미비'],
      tactical_notes: [
        '서울보다 상대적으로 신속 진행',
        '판사별 편차 있음 (담당 확인 후 대응)',
      ],
    },
  },
  busan: {
    key: 'busan',
    name: '부산회생법원',
    jurisdiction: '부산·경남 일부',
    rehab_characteristics: {
      strictness: 'moderate',
      avg_processing_days: 130,
      key_focus: ['기본 요건 충족', '인가 가능성'],
      common_correction_reasons: ['서류 누락'],
      tactical_notes: ['기본기 충실히. 과도한 방어 불필요.'],
    },
  },
  incheon: {
    key: 'incheon',
    name: '인천지방법원 (회생단독)',
    jurisdiction: '인천광역시',
    rehab_characteristics: {
      strictness: 'moderate',
      avg_processing_days: 140,
      key_focus: ['절차 준수', '변제계획 실행가능성'],
      common_correction_reasons: ['통장 누락', '재산 평가 부정확'],
      tactical_notes: ['신속 진행 가능. 사전 서류 완비가 관건.'],
    },
  },
  daejeon: {
    key: 'daejeon',
    name: '대전지방법원',
    jurisdiction: '대전·충청 일부',
    rehab_characteristics: {
      strictness: 'moderate',
      avg_processing_days: 135,
      key_focus: ['기본 요건'],
      common_correction_reasons: ['서류 누락'],
      tactical_notes: ['표준 절차 준수.'],
    },
  },
  generic: {
    key: 'generic',
    name: '기타 지방법원',
    jurisdiction: '해당 관할',
    rehab_characteristics: {
      strictness: 'moderate',
      avg_processing_days: 140,
      key_focus: ['법정 요건 충족'],
      common_correction_reasons: ['서류 누락', '소득증빙 미흡'],
      tactical_notes: [
        '지방 법원은 일반적으로 서울회생법원보다 완화',
        '담당 판사 성향 사전 확인 권장',
      ],
    },
  },
};

/**
 * 사건번호 or 법원명에서 법원 프로필 찾기.
 * 예: "2025개회12345" → 서울회생법원
 *     "2024회단1234" → 수원 등 지방 회생단독
 */
export function detectCourt(
  caseNumber: string | null,
  courtName: string | null,
): CourtProfile {
  // 명시된 법원명 우선
  if (courtName) {
    const n = courtName.toLowerCase();
    if (n.includes('서울회생')) return COURTS.seoul_rehab;
    if (n.includes('수원')) return COURTS.suwon;
    if (n.includes('부산')) return COURTS.busan;
    if (n.includes('인천')) return COURTS.incheon;
    if (n.includes('대전')) return COURTS.daejeon;
  }

  // 사건번호 앞자리로 추정 (개회=서울회생, 회단=지방회생단독)
  if (caseNumber) {
    const n = caseNumber.replace(/\s/g, '');
    // 2025개회* → 서울회생법원
    if (/\d{4}개회\d+/.test(n)) return COURTS.seoul_rehab;
    // 2025회단* → 수원 등 (보통 지방회생단독)
    // 더 정밀한 파싱은 사건번호 규칙 공식 확인 필요
  }

  return COURTS.generic;
}
