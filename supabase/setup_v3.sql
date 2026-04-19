-- events.source_type CHECK 확장: phone/notes/sms/voice/copilot 추가
-- (기존 제약은 phone, notes 등을 reject해서 CopilotModal / PasteModal 에서 일부 옵션 선택 시 에러 발생)

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_source_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_source_type_check
    CHECK (source_type IN (
      'audio_upload',
      'email',
      'kakao',
      'realtime_audio',
      'manual',
      'custom',
      'milestone',
      'import',
      'phone',
      'notes',
      'sms',
      'voice',
      'copilot'
    ));
