'use server';

import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { translateQuery, type NLQuery } from '@/lib/ai/query';

async function getSupabase() {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');
  return { supabase, userId: user.id };
}

export interface SearchResult {
  query: NLQuery;
  count: number;
  rows: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    href: string;
    badge?: string;
  }>;
}

export async function naturalLanguageSearch(input: string): Promise<SearchResult> {
  const { supabase } = await getSupabase();
  const nl = await translateQuery(input);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);

  if (nl.entity === 'cases') {
    let q = supabase
      .from('cases')
      .select(`
        id, title, case_type, status, case_number, closed_date,
        client:clients(id, name)
      `)
      .limit(50);
    if (nl.filters.case_type) q = q.eq('case_type', nl.filters.case_type);
    if (nl.filters.status === 'active') q = q.eq('status', 'active');
    if (nl.filters.status === 'archived') q = q.neq('status', 'active');
    if (nl.filters.created_after) q = q.gte('created_at', nl.filters.created_after);
    if (nl.filters.created_before) q = q.lte('created_at', nl.filters.created_before);
    if (nl.filters.text_match) q = q.ilike('title', `%${nl.filters.text_match}%`);

    const { data } = await q;
    let rows = (data ?? []) as unknown as Array<{
      id: string;
      title: string;
      case_type: string | null;
      status: string;
      case_number: string | null;
      closed_date: string | null;
      client: { id: string; name: string } | null;
    }>;

    if (nl.filters.client_name) {
      const n = nl.filters.client_name.toLowerCase();
      rows = rows.filter((r) => r.client?.name.toLowerCase().includes(n));
    }

    return {
      query: nl,
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: [
          r.client?.name,
          r.case_type,
          r.case_number && `#${r.case_number}`,
          r.closed_date && `종결 ${r.closed_date.slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/cases/${r.id}`,
        badge: r.status === 'active' ? '진행' : '종결',
      })),
    };
  }

  if (nl.entity === 'tickets') {
    let q = supabase
      .from('tickets')
      .select(`
        id, title, column_key, due_date, waiting_on, type, priority,
        client:clients(id, name)
      `)
      .limit(50);
    if (nl.filters.waiting_on) q = q.eq('waiting_on', nl.filters.waiting_on);
    if (nl.filters.overdue) {
      q = q.lt('due_date', todayISO).neq('column_key', 'done');
    }
    if (nl.filters.due_within_days !== null && nl.filters.due_within_days !== undefined) {
      const limit = new Date(today);
      limit.setDate(limit.getDate() + nl.filters.due_within_days);
      q = q
        .gte('due_date', todayISO)
        .lte('due_date', limit.toISOString().slice(0, 10))
        .neq('column_key', 'done');
    }
    if (nl.filters.text_match) q = q.ilike('title', `%${nl.filters.text_match}%`);

    const { data } = await q;
    let rows = (data ?? []) as unknown as Array<{
      id: string;
      title: string;
      column_key: string;
      due_date: string | null;
      waiting_on: string | null;
      type: string;
      client: { id: string; name: string } | null;
    }>;

    if (nl.filters.client_name) {
      const n = nl.filters.client_name.toLowerCase();
      rows = rows.filter((r) => r.client?.name.toLowerCase().includes(n));
    }

    return {
      query: nl,
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: [
          r.client?.name,
          r.column_key,
          r.due_date && `마감 ${r.due_date}`,
          r.waiting_on && `대기: ${r.waiting_on}`,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/kanban?client=${r.client?.id ?? ''}`,
      })),
    };
  }

  if (nl.entity === 'clients') {
    let q = supabase
      .from('clients')
      .select('id, name, phone, email, memo')
      .limit(50);
    if (nl.filters.client_name) q = q.ilike('name', `%${nl.filters.client_name}%`);
    if (nl.filters.text_match) q = q.or(`name.ilike.%${nl.filters.text_match}%,memo.ilike.%${nl.filters.text_match}%`);
    const { data } = await q;
    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      memo: string | null;
    }>;

    return {
      query: nl,
      count: rows.length,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.name,
        subtitle: [r.phone, r.email, r.memo?.slice(0, 50)].filter(Boolean).join(' · '),
        href: `/clients/${r.id}`,
      })),
    };
  }

  // events
  let q = supabase
    .from('events')
    .select(`
      id, raw_content, source_type, occurred_at, created_at,
      client:clients(id, name)
    `)
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(30);
  if (nl.filters.text_match)
    q = q.ilike('raw_content', `%${nl.filters.text_match}%`);
  if (nl.filters.created_after) q = q.gte('created_at', nl.filters.created_after);

  const { data } = await q;
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    raw_content: string | null;
    source_type: string;
    occurred_at: string | null;
    created_at: string;
    client: { id: string; name: string } | null;
  }>;

  return {
    query: nl,
    count: rows.length,
    rows: rows.map((r) => ({
      id: r.id,
      title: (r.raw_content ?? '').slice(0, 80),
      subtitle: [
        r.source_type,
        r.client?.name,
        (r.occurred_at ?? r.created_at).slice(0, 10),
      ]
        .filter(Boolean)
        .join(' · '),
      href: r.client ? `/clients/${r.client.id}` : '/dashboard',
    })),
  };
}
