import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CommandPalette } from './CommandPalette';
import { CommandOpener } from './CommandOpener';
import { CreateMenu } from './CreateMenu';
import { UserMenu } from './UserMenu';
import type { Client, Case } from '@/lib/types';

export type HeaderActive = 'dashboard' | 'cases' | 'clients' | 'kanban' | 'team';

const TABS: { key: HeaderActive; href: string; label: string }[] = [
  { key: 'dashboard', href: '/dashboard', label: '대시보드' },
  { key: 'cases', href: '/cases', label: '사건' },
  { key: 'clients', href: '/clients', label: '고객' },
  { key: 'kanban', href: '/kanban', label: '칸반' },
  { key: 'team', href: '/settings/team', label: '팀' },
];

export async function AppHeader({ active }: { active: HeaderActive }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 bg-white dark:bg-zinc-900">
        <Link href="/" className="font-semibold">
          LawOS
        </Link>
      </header>
    );
  }

  const [profileRes, clientsRes, casesRes] = await Promise.all([
    supabase.from('users').select('name, email').eq('id', user.id).maybeSingle(),
    supabase.from('clients').select('*').order('created_at', { ascending: false }),
    supabase.from('cases').select('*').order('created_at', { ascending: false }),
  ]);

  const profile = profileRes.data;
  const clients = (clientsRes.data ?? []) as Client[];
  const cases = (casesRes.data ?? []) as Case[];

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-2.5 flex items-center justify-between bg-white dark:bg-zinc-900 shrink-0 gap-4">
      <div className="flex items-center gap-6 min-w-0">
        <Link href="/dashboard" className="font-semibold shrink-0">
          LawOS
        </Link>
        <nav className="flex gap-4 text-sm overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={
                t.key === active
                  ? 'font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 whitespace-nowrap'
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <CommandOpener />
        <CreateMenu clients={clients} cases={cases} />
        <UserMenu name={profile?.name ?? null} email={profile?.email ?? user.email ?? null} />
      </div>
      <CommandPalette />
    </header>
  );
}
