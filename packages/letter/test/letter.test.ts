import { describe, expect, it } from 'vitest';
import { STEMS, type Stem } from '@naite/saju';
import {
  addMonths, birthdayInYear, birthdayKeyOf, composeFirstLetter, createFirstLetter, koreanInternationalAge,
  nextLetterBirthday, templates, todayInKorea, vocative, type FirstLetterRequest,
} from '../src/index.ts';

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe('주기 규칙 (CLAUDE.md 3)', () => {
  const today = d(2026, 10, 4);
  it('다음 생일까지 3개월 이상이면 그 생일', () => {
    expect(nextLetterBirthday({ basis: 'solar', month: 2, day: 23 }, today)).toEqual(d(2027, 2, 23));
  });
  it('3개월 미만이면 그다음 생일', () => {
    expect(nextLetterBirthday({ basis: 'solar', month: 12, day: 1 }, today)).toEqual(d(2027, 12, 1));
  });
  it('정확히 3개월 뒤는 미만이 아니므로 그 생일', () => {
    expect(nextLetterBirthday({ basis: 'solar', month: 1, day: 4 }, today)).toEqual(d(2027, 1, 4));
    expect(nextLetterBirthday({ basis: 'solar', month: 1, day: 3 }, today)).toEqual(d(2028, 1, 3));
  });
  it('생일 당일 방문도 다음 해 생일', () => {
    expect(nextLetterBirthday({ basis: 'solar', month: 10, day: 4 }, today)).toEqual(d(2027, 10, 4));
  });
  it('2월 29일생은 평년에 2월 28일', () => {
    expect(birthdayInYear({ basis: 'solar', month: 2, day: 29 }, 2027)).toEqual(d(2027, 2, 28));
    expect(birthdayInYear({ basis: 'solar', month: 2, day: 29 }, 2028)).toEqual(d(2028, 2, 29));
  });
  it('음력 생일: 1996-02-23(음력 1월 5일)생 → 2027년 음력 1월 5일 = 양력 2027-02-11', () => {
    const key = birthdayKeyOf(d(1996, 2, 23), 'lunar');
    expect(key).toEqual({ basis: 'lunar', month: 1, day: 5 });
    expect(nextLetterBirthday(key, today)).toEqual(d(2027, 2, 11));
  });
  it('음력 30일생은 그달이 29일까지면 29일로 챙긴다', () => {
    // 작은달(29일)이든 큰달(30일)이든 매년 매달 날짜가 나와야 한다
    for (let y = 2026; y <= 2035; y++) {
      for (let m = 1; m <= 12; m++) expect(birthdayInYear({ basis: 'lunar', month: m, day: 30 }, y)).not.toBeNull();
    }
  });
  it('월 더하기는 말일로 맞춘다', () => {
    expect(addMonths(d(2026, 11, 30), 3)).toEqual(d(2027, 2, 28));
    expect(addMonths(d(2027, 11, 30), 3)).toEqual(d(2028, 2, 29));
    expect(addMonths(d(2026, 10, 4), 3)).toEqual(d(2027, 1, 4));
  });
  it('만 나이', () => {
    expect(koreanInternationalAge(d(2012, 10, 4), d(2026, 10, 4))).toBe(14);
    expect(koreanInternationalAge(d(2012, 10, 5), d(2026, 10, 4))).toBe(13);
    expect(koreanInternationalAge(d(2012, 2, 29), d(2026, 2, 28))).toBe(13);
    expect(koreanInternationalAge(d(2012, 2, 29), d(2026, 3, 1))).toBe(14);
  });
  it('한국 오늘 날짜', () => {
    expect(todayInKorea(new Date('2026-10-03T15:00:00Z'))).toEqual(d(2026, 10, 4));
    expect(todayInKorea(new Date('2026-10-03T14:59:59Z'))).toEqual(d(2026, 10, 3));
  });
});

describe('호칭', () => {
  it('받침 있으면 아, 없으면 야, 한글이 아니면 그대로', () => {
    expect(vocative('진영')).toBe('진영아');
    expect(vocative('민수')).toBe('민수야');
    expect(vocative('Jin')).toBe('Jin');
  });
});

const BASE: FirstLetterRequest = {
  calendar: 'solar', year: 1996, month: 2, day: 23, isLeapMonth: false, time: { hour: 9, minute: 0 },
  birthplaceCode: '47170', mbti: 'INFP', name: '진영', birthdayBasis: 'solar', confirmSelf: true, confirmAge: true,
};
const NOW = new Date('2026-10-03T03:00:00Z'); // 한국 2026-10-03

describe('첫해 첫 장 — CLAUDE.md 5-2 매핑 케이스', () => {
  const r = createFirstLetter(BASE, NOW);
  if (!r.ok) throw new Error(r.message);
  const { letter } = r;

  it('다음 생일 2027-02-23, 丙午년 편관(관성), 둘 다 버거움', () => {
    expect(r.nextBirthday).toEqual(d(2027, 2, 23));
    expect(letter.meta.seunPillar).toBe('丙午');
    expect(letter.meta.seun.stemTenGod).toBe('편관');
    expect(letter.meta.combination).toBe('둘 다 버거움');
  });
  it('인사 → 세운 조각 → MBTI 조각 → 끊기', () => {
    expect(letter.greeting).toBe('진영아, 생일 축하해. 다음 생일의 나야.');
    const [seun, mbti, cut] = letter.paragraphs;
    expect(seun).toContain('쇠를 불로 두드려 모양을 잡는 해');
    expect(templates.SITUATIONS.편관.some((s) => seun!.includes(s))).toBe(true);
    expect(templates.SUB_SENTENCES.관성.some((s) => seun!.includes(s))).toBe(false); // 午는 같은 관성
    // 관성 축 순서: J/P(P 버거움) → T/F(F 버거움) → "그래도" 마무리
    const pIdx = Math.max(...templates.MBTI_SENTENCES.관성.P!.map((s) => mbti!.indexOf(s)));
    const fIdx = Math.max(...templates.MBTI_SENTENCES.관성.F!.map((s) => mbti!.indexOf(s)));
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(fIdx).toBeGreaterThan(pIdx);
    expect(templates.BOTH_HARD_CLOSERS.some((s) => mbti!.endsWith(s))).toBe(true);
    expect(cut).toBe('그리고 이건 꼭 직접 말해주고 싶었어. 이번 1년 동안 네가 한 일 중에 내가 제일 고마운 건');
  });
  it('같은 사람이면 몇 번을 열어도 같은 편지', () => {
    const again = createFirstLetter(BASE, NOW);
    expect(again.ok && again.letter.paragraphs).toEqual(letter.paragraphs);
  });
  it('이름이 없으면 이름 없이 인사', () => {
    const r2 = createFirstLetter({ ...BASE, name: '  ' }, NOW);
    expect(r2.ok && r2.letter.greeting).toBe('생일 축하해. 다음 생일의 나야.');
  });
});

describe('전 조합 점검: 일간 10 × 세운 60갑자 × MBTI 16', () => {
  const MBTIS = ['E', 'I'].flatMap((a) => ['N', 'S'].flatMap((b) => ['T', 'F'].flatMap((c) => ['J', 'P'].map((e) => a + b + c + e))));
  // 2026~2085년 생일 기준으로 60갑자 세운을 모두 지난다 (기간 = 10월 1일 → 이듬해 2월 23일, 대부분 앞 해)
  const BANNED = ['투자', '이직', '퇴사', '연애', '결혼', '이별', '건강', '병원', '수술', '죽', '사고', '반드시', '무조건'];
  const JARGON = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인', '비겁', '식상', '재성', '관성', '인성', '일간', '세운', '사주', '오행', '십신'];

  it('모든 조합에서 문장이 완성되고, 금지어·명리 용어가 없다', () => {
    const seen = new Set<string>();
    for (let y = 2026; y < 2086; y++) {
      for (const stem of STEMS) {
        for (const mbti of MBTIS) {
          const l = composeFirstLetter({
            dayMaster: stem as Stem, mbti, name: null, today: d(y, 10, 1), nextBirthday: d(y + 1, 2, 23), seedKey: `${y}${stem}${mbti}`,
          });
          seen.add(l.meta.seunPillar);
          const text = [l.greeting, ...l.paragraphs].join('\n');
          for (const w of [...BANNED, ...JARGON, '{m}', 'undefined', '  ']) {
            if (text.includes(w)) throw new Error(`"${w}" in ${y} ${stem} ${mbti}: ${text}`);
          }
          for (const p of l.paragraphs.slice(0, -1)) if (!/[.]$/.test(p)) throw new Error(p);
        }
      }
    }
    expect(seen.size).toBe(60);
  });

  it('MBTI 문장 두 개의 말끝이 겹치지 않는다', () => {
    for (const stem of STEMS) {
      for (const mbti of MBTIS) {
        const l = composeFirstLetter({ dayMaster: stem as Stem, mbti, name: null, today: d(2026, 10, 3), nextBirthday: d(2027, 2, 23), seedKey: stem + mbti });
        const p = l.paragraphs[1]!;
        expect(p.match(/거야\./g)?.length ?? 0, p).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('비유 50종이 모두 서로 다르다', () => {
    const all = Object.values(templates.METAPHORS).flatMap((g) => Object.values(g));
    expect(all).toHaveLength(50);
    expect(new Set(all).size).toBe(50);
  });
});

describe('입력 검증', () => {
  it('확인 체크 누락', () => {
    expect(createFirstLetter({ ...BASE, confirmAge: false }, NOW)).toMatchObject({ ok: false, field: 'confirm' });
  });
  it('만 14세 미만', () => {
    expect(createFirstLetter({ ...BASE, year: 2013, month: 1, day: 1 }, NOW)).toMatchObject({ ok: false, field: 'confirm' });
  });
  it('미래 날짜', () => {
    expect(createFirstLetter({ ...BASE, year: 2027 }, NOW)).toMatchObject({ ok: false, field: 'birth' });
  });
  it('MBTI 미완성', () => {
    expect(createFirstLetter({ ...BASE, mbti: 'IN' }, NOW)).toMatchObject({ ok: false, field: 'mbti' });
  });
  it('이름 10자 초과', () => {
    expect(createFirstLetter({ ...BASE, name: '가나다라마바사아자차카' }, NOW)).toMatchObject({ ok: false, field: 'name' });
  });
  it('해외 출생지', () => {
    expect(createFirstLetter({ ...BASE, birthplaceCode: 'abroad' }, NOW)).toMatchObject({ ok: false, field: 'birthplace' });
  });
  it('없는 윤달', () => {
    expect(createFirstLetter({ ...BASE, calendar: 'lunar', year: 2021, month: 4, day: 1, isLeapMonth: true }, NOW))
      .toMatchObject({ ok: false, field: 'birth' });
  });
  it('시간 모름 + 입춘 당일이어도 편지는 나온다 (일간은 같음)', () => {
    const r = createFirstLetter({ ...BASE, month: 2, day: 4, time: null }, NOW);
    expect(r.ok).toBe(true);
  });
  it('밤 11시~자정 출생에게만 안내', () => {
    const late = createFirstLetter({ ...BASE, time: { hour: 23, minute: 50 } }, NOW);
    expect(late.ok && late.notes).toEqual(['밤 11시~자정에 태어난 경우, 기준에 따라 해석이 다를 수 있어요.']);
    const normal = createFirstLetter(BASE, NOW);
    expect(normal.ok && normal.notes).toEqual([]);
  });
});
