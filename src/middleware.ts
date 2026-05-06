import { type NextRequest, NextResponse } from 'next/server';

// 로그인 게이트 비활성화 — mockup 시연 모드
// 어떤 경로로 들어와도 lawos.html mockup만 보이게
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 정적 자산·API·lawos.html은 그대로 통과
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/lawos.html' ||
    pathname.includes('.') // 파일 확장자 있으면 정적 자산
  ) {
    return NextResponse.next();
  }

  // 그 외 모든 경로 (/login, /dashboard, /workflow, /cases 등) → lawos.html로 강제 이동
  return NextResponse.redirect(new URL('/lawos.html', request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
