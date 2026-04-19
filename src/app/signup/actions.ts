'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signup(formData: FormData) {
  const name = String(formData.get('name') ?? '');
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Email confirmation이 켜진 프로젝트는 session이 null로 돌아옴
  if (!data.session) {
    redirect(
      `/signup?message=${encodeURIComponent('가입 완료. 이메일에서 확인 링크를 클릭해주세요.')}`,
    );
  }
  redirect('/kanban');
}
