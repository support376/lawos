'use server';

import { createClient as createSupabaseClient } from '@/lib/supabase/server';

async function getSupabase() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return { supabase, userId: user.id };
}

export interface SearchResult {
  count: number;
  rows: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    href: string;
    badge?: string;
  }>;
}

// 자연어 검색 레이어는 온톨로지 재설계 중이라 임시로 단순 텍스트 검색으로 대체.
export async function naturalLanguageSearch(input: string): Promise<SearchResult> {
  const { supabase } = await getSupabase();
  const text = input.trim();
  if (!text) return { count: 0, rows: [] };

  const [casesRes, clientsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id, title, case_type, status, case_number, client:clients(id, name)')
      .ilike('title', `%${text}%`)
      .limit(20),
    supabase
      .from('clients')
      .select('id, name, phone, email, memo')
      .or(`name.ilike.%${text}%,memo.ilike.%${text}%`)
      .limit(20),
  ]);

  const caseRows = ((casesRes.data ?? []) as unknown as Array<{
    id: string;
    title: string;
    case_type: string | null;
    status: string;
    case_number: string | null;
    client: { id: string; name: string } | null;
  }>).map((r) => ({
    id: `case-${r.id}`,
    title: r.title,
    subtitle: [r.client?.name, r.case_type, r.case_number && `#${r.case_number}`]
      .filter(Boolean)
      .join(' · '),
    href: `/cases/${r.id}`,
    badge: r.status === 'active' ? '진행' : '종결',
  }));

  const clientRows = ((clientsRes.data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    memo: string | null;
  }>).map((r) => ({
    id: `client-${r.id}`,
    title: r.name,
    subtitle: [r.phone, r.email, r.memo?.slice(0, 50)].filter(Boolean).join(' · '),
    href: `/clients/${r.id}`,
  }));

  const rows = [...caseRows, ...clientRows];
  return { count: rows.length, rows };
}
