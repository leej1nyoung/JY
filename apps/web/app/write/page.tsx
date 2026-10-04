import type { Metadata } from 'next';
import { BIRTHPLACES } from '@naite/saju/birthplaces';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { WriteForm, type PlaceOption } from './WriteForm';

export const metadata: Metadata = { title: '정보 입력 — 나이테' };
// 연도 선택지의 상한(올해)이 해가 바뀌어도 맞도록 하루마다 다시 만든다.
export const revalidate = 86400;

export default function WritePage() {
  const places: PlaceOption[] = BIRTHPLACES.map(({ code, sido, name }) => ({ code, sido, name }));
  const thisYear = new Date().getFullYear();
  return (
    <main className="page">
      <header>
        <Logo />
      </header>
      <h1 className="form-title">편지를 받을 너에 대해 알려 줘</h1>
      <p className="form-lead">입력한 정보는 편지를 쓰는 데만 쓰고, 지금은 어디에도 저장하지 않아요.</p>
      <WriteForm places={places} maxYear={thisYear} />
      <Footer />
    </main>
  );
}
