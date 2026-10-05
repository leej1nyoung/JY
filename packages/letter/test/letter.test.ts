import { describe, expect, it } from 'vitest';
import { BRANCHES, STEMS, TEN_GOD_GROUP, THEME_AXES, type Stem, type TenGod } from '@naite/saju';
import {
  addMonths, birthdayInYear, chooseAnchor, isClash, isCombine, spanWord, birthdayKeyOf, composeFirstLetter, createFirstLetter, koreanInternationalAge,
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
  it('인사 → 본문(관성 PF 세 버전 중 하나) → 시점을 짚는 끊기', () => {
    expect(letter.greeting).toBe('진영아, 생일 축하해. 다음 생일의 나야.');
    expect(letter.meta.bodyKey).toBe('PF');
    const cut = letter.paragraphs.at(-1)!;
    expect(cut).toBe(letter.cut);
    expect(letter.cut).toContain(letter.moment.when);
    expect(/(너는|네가)$/.test(letter.cut)).toBe(true);
  });
  it('시점: 일지 寅과 충하는 申월은 기간 밖, 합하는 亥월(11월)이 기간 안 → "마음이 좀 놓였던 11월"류', () => {
    expect(letter.moment.anchor).toEqual({ kind: 'combine', month: 11 });
    expect(letter.moment.label).toMatch(/11월$/);
  });
  it('첫마디: 편지를 여는 날짜·요일·시간대와 다음 생일까지의 길이를 짚는다', () => {
    const hook = letter.paragraphs[0]!;
    // 2026-10-03 12:00 KST = 토요일 오후, 다음 생일 2027-02-23 까지 약 다섯 달
    expect(hook).toMatch(/10월 3일|토요일|오후/);
    expect(templates.NOW_LINES[10]!.some((n) => hook.includes(n)) || templates.HOOKS.some((h) => !h.includes('{now}'))).toBe(true);
    expect(hook).not.toContain('{');
  });
  it('기간이 열 달이 안 되면 "1년" 대신 실제 길이로 쓴다', () => {
    expect(spanWord(d(2026, 10, 3), d(2027, 2, 23))).toBe('다섯 달');
    expect(spanWord(d(2026, 10, 3), d(2027, 1, 5))).toBe('석 달');
    expect(spanWord(d(2026, 10, 3), d(2027, 9, 1))).toBe('1년');
    expect([...letter.paragraphs].join(' ')).not.toContain('1년');
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

const MBTIS = ['E', 'I'].flatMap((a) => ['N', 'S'].flatMap((b) => ['T', 'F'].flatMap((c) => ['J', 'P'].map((e) => a + b + c + e))));
const BANNED = ['투자', '이직', '퇴사', '연애', '결혼', '이별', '건강', '병원', '수술', '죽', '반드시', '무조건'];
const JARGON = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인', '비겁', '식상', '재성', '관성', '인성', '일간', '세운', '오행', '십신', '월운'];
/** 사람 글처럼 보이지 않게 만드는 상투어 (리뷰에서 지적된 AI 문체) */
const AI_TELLS = ['너라서', '많이 애썼', '단단해졌', '나는 기억해', '다 기억해', '그 시간을 지나와서', '잘 맞는 해였', '마음 한쪽', '숨 돌릴 틈', '차곡차곡', '한 걸음씩', '오롯이', '선물 같', '쉼표'];

/** 2026~2085년, 시작 달·기간을 바꿔 가며 편지를 만든다 */
function* letters() {
  let i = 0;
  for (let y = 2026; y < 2086; y++) {
    for (const stem of STEMS) {
      for (const mbti of MBTIS) {
        i++;
        const today = d(y, 1 + (i % 12), 1 + (i % 27));
        const months = 4 + (i % 11); // 4~14개월
        const total = today.month - 1 + months;
        const next = d(y + Math.floor(total / 12), (total % 12) + 1, 1 + ((i * 7) % 27));
        yield { y, stem: stem as Stem, mbti, l: composeFirstLetter({ dayMaster: stem as Stem, dayBranch: BRANCHES[i % 12]!, mbti, name: null, today, nextBirthday: next, seedKey: `${y}${stem}${mbti}${i}`, readAt: new Date(Date.UTC(today.year, today.month - 1, today.day, i % 24) - 9 * 3600_000) }) };
      }
    }
  }
}

describe('전 조합 점검: 일간 10 × 60년 × MBTI 16 (9,600통)', () => {
  it('문장이 완성되고, 금지어·명리 용어·AI 상투어·짐작 말투가 없다', () => {
    const seen = new Set<string>();
    for (const { y, stem, mbti, l } of letters()) {
      seen.add(l.meta.seunPillar);
      const text = [l.greeting, ...l.paragraphs].join('\n');
      for (const w of [...BANNED, ...JARGON, ...AI_TELLS, '{', '}', 'undefined', '  ']) {
        if (text.includes(w)) throw new Error(`"${w}" in ${y} ${stem} ${mbti}: ${text}`);
      }
      if (/을 거[야예]/.test(text)) throw new Error(`짐작 말투: ${text}`);
      if ((text.match(/사주/g) ?? []).length > 1) throw new Error(`"사주" 두 번: ${text}`);
      for (const p of l.paragraphs.slice(0, -1)) {
        if (!/[.?!]$/.test(p)) throw new Error(`문단이 문장으로 안 끝남: ${p}`);
        // 명사형·관형형으로 끝나는 감성 조각 문장 금지 ("헷갈리는." 같은)
        for (const sentence of p.split(/(?<=[.?!])\s+/)) {
          if (/[는던은]\.$/.test(sentence)) throw new Error(`조각 문장: ${sentence}`);
        }
      }
    }
    expect(seen.size).toBe(60);
  });

  it('나란히 놓아도 같은 문장이 반복되지 않는다: 10글자 구절이 편지 15% 넘게 나오지 않음 (끊기 8종이 각각 약 12.5%)', () => {
    const df = new Map<string, number>();
    let n = 0;
    for (const { l } of letters()) {
      n++;
      // 인사는 서비스 고정 문구라 제외
      const text = l.paragraphs.join(' ').replace(/\s+/g, ' ');
      const grams = new Set<string>();
      for (let i = 0; i + 10 <= text.length; i++) grams.add(text.slice(i, i + 10));
      for (const g of grams) df.set(g, (df.get(g) ?? 0) + 1);
    }
    const top = [...df.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, c]) => `${g} ${(c / n * 100).toFixed(1)}%`);
    expect((top[0] ? Number(top[0].split(' ').at(-1)!.replace('%', '')) : 0), top.join(' | ')).toBeLessThan(15);
  });

  it('본문 120통: 십신마다 조합 4개 × 버전 3, 버전마다 뼈대가 다르다', () => {
    let count = 0;
    for (const [god, bodies] of Object.entries(templates.BODIES)) {
      const theme = TEN_GOD_GROUP[god as TenGod];
      const [a, b] = THEME_AXES[theme];
      const keys = [a.easy, a.hard].flatMap((x) => [b.easy, b.hard].map((y) => x + y));
      expect(Object.keys(bodies).sort(), god).toEqual([...keys].sort());
      for (const key of keys) {
        const [v0, v1, v2] = bodies[key]!;
        count += 3;
        expect(v0, `${god} ${key} v0`).toContain('{m}'); // 상황부터 + 비유
        expect(v1, `${god} ${key} v1`).toContain('{season}'); // 감정부터 + 계절
        expect(v2!.startsWith('{season}'), `${god} ${key} v2`).toBe(true); // 계절부터
        for (const v of [v0, v1, v2]) {
          expect(v, `${god} ${key}`).toContain('{sub}');
          expect(v!.replace(/\{(m|season|sub)\}/g, ''), `${god} ${key}`).not.toMatch(/[{}]/);
          // 조합 규칙: 둘 다 편함 → 방심한 순간 하나 / 그 외 → 돌아서는 말
          const hard = [key[0] === a.hard, key[1] === b.hard].filter(Boolean).length;
          if (hard === 0) expect(v, `${god} ${key}`).toMatch(/딱 하나|다만|하나 아쉬운|하나 꼽자면|아, 근데/);
          else expect(v, `${god} ${key}`).toMatch(/그래도|근데|그런데|지만|그래서/);
        }
      }
    }
    expect(count).toBe(120);
  });

  it('비유 50종이 모두 서로 다르다', () => {
    const all = Object.values(templates.METAPHORS).flatMap((g) => Object.values(g));
    expect(all).toHaveLength(50);
    expect(new Set(all).size).toBe(50);
  });

  it('계절 디테일은 기간 안의 달에서, 시점과 다른 달로 고른다', () => {
    for (const { l } of letters()) {
      const m = l.meta.seasonMonth;
      if (m === null) continue;
      const a = l.moment.anchor;
      if (a.kind !== 'none') expect(m).not.toBe(a.month);
      expect(m).not.toBe(l.meta.period.from.month); // 지금 달은 첫마디가 이미 말한다
    }
  });
});

describe('시점 고르기 (일지와 월지의 충·합)', () => {
  it('충·합 판정', () => {
    expect(isClash('子', '午')).toBe(true);
    expect(isClash('寅', '申')).toBe(true);
    expect(isClash('寅', '亥')).toBe(false);
    expect(['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'].every((p) => isCombine(p[0] as never, p[1] as never))).toBe(true);
    expect(isCombine('子', '寅')).toBe(false);
  });
  it('충하는 달이 기간 안에 있으면 그 달이 먼저 (일지 午 → 子월 = 12월)', () => {
    expect(chooseAnchor('午', d(2026, 10, 5), d(2027, 8, 30))).toEqual({ kind: 'clash', month: 12 });
  });
  it('충 없고 합만 있으면 합하는 달 (일지 寅, 10월~2월 → 亥월 = 11월)', () => {
    expect(chooseAnchor('寅', d(2026, 10, 3), d(2027, 2, 23))).toEqual({ kind: 'combine', month: 11 });
  });
  it('둘 다 없고 입춘이 끼어 있으면 입춘 무렵, 그것도 없으면 시점 없음', () => {
    // 일지 午: 충 子(12월)·합 未(7월). 2027-01-10 ~ 2027-05-01 은 둘 다 없고 입춘이 있음
    expect(chooseAnchor('午', d(2027, 1, 10), d(2027, 5, 1))).toEqual({ kind: 'ipchun', month: 2 });
    expect(chooseAnchor('午', d(2027, 2, 20), d(2027, 6, 1))).toEqual({ kind: 'none' });
  });
  it('같은 기간이라도 일지가 다르면 다른 시점이 나온다', () => {
    const anchors = new Set(BRANCHES.map((b) => JSON.stringify(chooseAnchor(b, d(2026, 10, 5), d(2027, 8, 30)))));
    expect(anchors.size).toBeGreaterThanOrEqual(10);
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
