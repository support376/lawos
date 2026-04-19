-- LawOS V1 가입 자동 프로비저닝
-- Spec: lawos_kanban_spec.md §3.1
-- auth.users INSERT 시: public.users + workspace + members + board + 5 columns 생성 (단일 트랜잭션)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_board_id UUID;
  v_user_name TEXT;
  v_provider TEXT;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  v_provider := COALESCE(
    NEW.raw_app_meta_data->>'provider',
    'email'
  );

  -- 1) 프로필
  INSERT INTO public.users (id, email, name, auth_provider)
  VALUES (NEW.id, NEW.email, v_user_name, v_provider);

  -- 2) 워크스페이스
  INSERT INTO public.workspaces (name, owner_id)
  VALUES (v_user_name || '의 워크스페이스', NEW.id)
  RETURNING id INTO v_workspace_id;

  -- 3) 멤버십
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, NEW.id, 'owner');

  -- 4) 기본 보드
  INSERT INTO public.kanban_boards (workspace_id, name)
  VALUES (v_workspace_id, '내 사건 관리')
  RETURNING id INTO v_board_id;

  -- 5) 기본 5컬럼
  INSERT INTO public.kanban_columns (board_id, key, name, "order", color) VALUES
    (v_board_id, 'triage',      'Triage',        1, 'gray'),
    (v_board_id, 'todo',        'To Do',         2, 'blue'),
    (v_board_id, 'in_progress', 'In Progress',   3, 'amber'),
    (v_board_id, 'review',      'Review & Send', 4, 'purple'),
    (v_board_id, 'done',        'Done',          5, 'green');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
