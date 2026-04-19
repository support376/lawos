-- 사건 메타 확장 + milestone 이벤트 허용

-- cases에 실제 사건 정보 필드 추가
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS case_number TEXT,
  ADD COLUMN IF NOT EXISTS court TEXT,
  ADD COLUMN IF NOT EXISTS opposing_party TEXT,
  ADD COLUMN IF NOT EXISTS retainer_date DATE,
  ADD COLUMN IF NOT EXISTS closed_date DATE,
  ADD COLUMN IF NOT EXISTS outcome TEXT;

-- events.source_type에 milestone 추가 (이력 타임라인용)
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_source_type_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_source_type_check
    CHECK (source_type IN (
      'audio_upload', 'email', 'kakao', 'realtime_audio',
      'manual', 'custom', 'milestone', 'import'
    ));

-- events에 이벤트 날짜 필드 추가 (created_at과 별개로 "언제 발생한 일"인지)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- 사건별 타임라인 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_events_case_occurred
  ON public.events(case_id, occurred_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_client
  ON public.events(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status, workspace_id);
CREATE INDEX IF NOT EXISTS idx_cases_type ON public.cases(case_type, workspace_id);
