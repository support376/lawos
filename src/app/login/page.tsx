import Link from 'next/link';
import { login, loginWithGoogle } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <LoginForm searchParams={searchParams} />;
}

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">LawOS</h1>
          <p className="text-sm text-zinc-500 mt-1">로그인</p>
        </div>

        <form action={login} className="space-y-3">
          <input
            name="email"
            type="email"
            required
            placeholder="이메일"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="비밀번호"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          {error && (
            <p className="text-sm text-red-600">{decodeURIComponent(error)}</p>
          )}
          <button
            type="submit"
            className="w-full py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            로그인
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-zinc-50 dark:bg-zinc-950 px-2 text-zinc-500">또는</span>
          </div>
        </div>

        <form action={loginWithGoogle}>
          <button
            type="submit"
            className="w-full py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-medium"
          >
            Google로 계속하기
          </button>
        </form>

        <p className="text-sm text-center text-zinc-500">
          계정이 없나요?{' '}
          <Link href="/signup" className="text-zinc-900 dark:text-zinc-100 underline">
            가입
          </Link>
        </p>
      </div>
    </div>
  );
}
