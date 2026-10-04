import type { Metadata } from 'next';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { LetterView } from './LetterView';

export const metadata: Metadata = { title: '내년의 안부 — 나이테' };

export default function LetterPage() {
  return (
    <main className="page">
      <header>
        <Logo />
      </header>
      <LetterView />
      <Footer />
    </main>
  );
}
