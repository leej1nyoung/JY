import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Rings } from '@/components/Rings';
import { TrackView } from '@/components/TrackView';

export default function Home() {
  return (
    <main className="page">
      <TrackView event="main_view" />
      <header>
        <Logo />
      </header>

      <section className="hero">
        <Rings size={132} className="hero-rings" />
        <h1>
          다음 생일의 내가
          <br />
          지금의 나에게
          <br />
          안부를 보냈어요
        </h1>
        <p>태어난 날의 기운과 지금의 나(MBTI)를 담아, 1년을 먼저 지나온 내가 쓴 편지예요.</p>
        <span className="price-tag">첫 장 무료 · 편지 전체 열람 990원</span>

        <ol className="steps">
          <li>생년월일시와 MBTI를 알려 주세요.</li>
          <li>편지 첫 장을 바로 무료로 읽을 수 있어요.</li>
          <li>봉투에 남은 두 번째 장은 990원에 열려요. 답장을 쓰면 매년 생일마다 편지가 이어져요.</li>
        </ol>

        <div className="cta-area">
          <Link href="/write" className="btn">
            편지 받으러 가기
          </Link>
          <p className="cta-note">회원가입 없이 1분이면 돼요</p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
