import type { Metadata, Viewport } from 'next';
import { Gowun_Batang, IBM_Plex_Sans_KR } from 'next/font/google';
import './globals.css';

const letterFont = Gowun_Batang({ weight: ['400', '700'], preload: false, display: 'swap', variable: '--font-letter' });
const uiFont = IBM_Plex_Sans_KR({ weight: ['400', '500', '600'], preload: false, display: 'swap', variable: '--font-ui' });

export const metadata: Metadata = {
  title: '나이테 — 내년의 안부',
  description: '다음 생일의 내가 지금의 나에게 안부를 보냈어요.',
  // 지인 테스트(3단계)까지는 검색 노출을 막는다. 정식 런칭 때 제거.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFF6F7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${letterFont.variable} ${uiFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
