import Link from 'next/link';
import { signup } from './actions';
import { loginWithGoogle } from '../login/actions';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">LawOS</h1>
          <p className="text-sm text-zinc-500 mt-1">가입하면 바로 개인 칸반이 생성됩니다</p>
        </div>

        <form action={signup} className="space-y-3">
          <input
            name="name"
            type="text"
            required
            placeholder="이름"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
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
            placeholder="비밀번호 (6자 이상)"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          {error && <p className="text-sm text-red-600">{decodeURIComponent(error)}</p>}
          {message && <p className="text-sm text-emerald-600">{decodeURIComponent(message)}</p>}
          <button
            type="submit"
            className="w-full py-2 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
          >
            가입
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
            Google로 가입
          </button>
        </form>

        <p className="text-sm text-center text-zinc-500">
          이미 계정이 있나요?{' '}
          <Link href="/login" className="text-zinc-900 dark:text-zinc-100 underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
