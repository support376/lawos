import { createClient } from '@supabase/supabase-js';

// 관리자 권한 (서비스 롤). RLS 무시함. 서버 전용으로만 쓰세요.
// 절대 클라이언트 컴포넌트나 브라우저에서 import 금지.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
