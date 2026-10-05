import type { Metadata } from 'next';
import { composeFirstLetter } from '@naite/letter';
import { BRANCHES, STEMS, THEME_AXES, analyzeSeun, type Stem } from '@naite/saju';
import { Logo } from '@/components/Logo';

// 문장 검토용 페이지 (지인 테스트 전까지만). 정식 런칭 전에 지운다.
export const metadata: Metadata = { title: '편지 미리보기 — 나이테' };

const TODAY = { year: 2026, month: 10, day: 3 };
const NEXT_BIRTHDAY = { year: 2027, month: 2, day: 23 }; // 기간 대부분이 丙午년
const AXIS_INDEX = { 'E/I': 0, 'N/S': 1, 'T/F': 2, 'J/P': 3 } as const;

/** 테마의 두 축에서 (편함/버거움) 네 조합을 만드는 MBTI. 나머지 축은 INFP 기준 */
function mbtiCombos(stem: Stem): string[] {
  const theme = analyzeSeun(stem, { stem: '丙', branch: '午' }).theme;
  const [a, b] = THEME_AXES[theme];
  return [a.easy, a.hard].flatMap((x) =>
    [b.easy, b.hard].map((y) => {
      const m = 'INFP'.split('');
      m[AXIS_INDEX[a.axis]] = x;
      m[AXIS_INDEX[b.axis]] = y;
      return m.join('');
    }),
  );
}

export default function PreviewPage() {
  const letters = STEMS.flatMap((stem) =>
    mbtiCombos(stem).map((mbti) => ({
      stem,
      mbti,
      letter: composeFirstLetter({ dayMaster: stem, dayBranch: BRANCHES[(STEMS.indexOf(stem) * 5 + mbti.length) % 12]!, mbti, name: '진영', today: TODAY, nextBirthday: NEXT_BIRTHDAY, seedKey: stem + mbti }),
    })),
  );
  return (
    <main className="page">
      <header>
        <Logo />
      </header>
      <h1 className="form-title">편지 미리보기 ({letters.length}통)</h1>
      <p className="form-lead">
        2026-10-03 → 2027-02-23(丙午년) 기간, 일간 10종 × 그해 테마의 MBTI 네 조합. 어색한 문장은 번호와 함께 알려 주세요.
      </p>
      {letters.map(({ stem, mbti, letter }, i) => (
        <section key={stem + mbti} style={{ marginBottom: 36 }}>
          <p className="letter-date" style={{ textAlign: 'left', margin: '0 0 8px' }}>
            #{i + 1} · 일간 {stem} · {letter.meta.seun.theme}({letter.meta.seun.stemTenGod}) · {mbti} · {letter.meta.combination}
          </p>
          <article className="paper">
            <p>{letter.greeting}</p>
            {letter.paragraphs.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </article>
        </section>
      ))}
    </main>
  );
}
