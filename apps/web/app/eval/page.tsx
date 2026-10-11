import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { keyMatches } from '@/lib/stats-key';
import { FIRST_PAGE_MODEL } from '@/lib/first-page-ai';
import { EvalRunner } from './EvalRunner';

// 운영자 전용: 첫 장 AI 자동 검사. 한 사람당 생성 + 채점 두 번이라 넉넉히.
export const metadata: Metadata = { title: '첫 장 자동 검사 — 나이테', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export default async function EvalPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!keyMatches(key)) {
    return (
      <main className="page">
        <Logo />
        <p className="form-lead" style={{ marginTop: 28 }}>이 페이지를 볼 수 없어요.</p>
      </main>
    );
  }
  return (
    <main className="page eval-page">
      <Logo />
      <h1 className="form-title">첫 장 자동 검사</h1>
      <p className="form-lead">
        가상의 사람 12명(유형마다 3명)에게 새 구조의 첫 장을 AI로 쓰고, 다른 AI가 채점해요. 첫 장 모델: {FIRST_PAGE_MODEL}. 한 번 돌리는 데 대략 1~2천 원(추정), 5분 안팎 걸려요.
        창을 닫아도 결과는 이 브라우저에 남고, 다시 열면 이어서 해요.
      </p>
      <EvalRunner secret={key!} />
    </main>
  );
}
