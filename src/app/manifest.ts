import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LawOS',
    short_name: 'LawOS',
    description: '변호사를 위한 대화 기반 할일 관리',
    start_url: '/today',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#18181b',
    orientation: 'portrait',
    lang: 'ko',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
