import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { secondPageStatus } from '@/lib/second-page-ai';
import { LetterView } from './LetterView';

export const metadata: Metadata = { title: '내년의 안부 — 나이테' };
// 두 번째 장 AI 생성(지인 테스트)이 서버 액션으로 이 페이지에서 돈다. 한 번에 최대 두 번 쓰므로 넉넉히.
export const maxDuration = 180;
export const dynamic = 'force-dynamic';

export default function LetterPage() {
  const status = secondPageStatus();
  console.log('[letter] render, second page:', status.reason);
  return (
    <main className="page">
      <header>
        <Logo />
      </header>
      <LetterView secondPageFree={status.enabled} />
      <Footer />
    </main>
  );
}
