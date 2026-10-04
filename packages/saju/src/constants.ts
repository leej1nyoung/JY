// 천간·지지·오행·음양·십신 기본 상수.
// 지지의 음양·오행·십신은 CLAUDE.md 5-8 "기본 정의"에 따라 본기(지장간 정기) 하나로만 본다.

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
export const STEMS_KO = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'] as const;
export const BRANCHES_KO = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'] as const;

export type Stem = (typeof STEMS)[number];
export type Branch = (typeof BRANCHES)[number];
export type Element = '木' | '火' | '土' | '金' | '水';
export type YinYang = '양' | '음';

/** 상생 순서. 인덱스 e 가 (e+1)%5 를 생하고 (e+2)%5 를 극한다. */
export const ELEMENTS: readonly Element[] = ['木', '火', '土', '金', '水'];

/** 지지 → 본기(지장간 정기). 子=癸 丑=己 寅=甲 卯=乙 辰=戊 巳=丙 午=丁 未=己 申=庚 酉=辛 戌=戊 亥=壬 */
export const BRANCH_MAIN_QI: Readonly<Record<Branch, Stem>> = {
  子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙',
  午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬',
};

export function stemIndex(s: Stem): number {
  return STEMS.indexOf(s);
}
export function branchIndex(b: Branch): number {
  return BRANCHES.indexOf(b);
}
export function stemElement(s: Stem): Element {
  return ELEMENTS[Math.floor(stemIndex(s) / 2)]!;
}
export function stemYinYang(s: Stem): YinYang {
  return stemIndex(s) % 2 === 0 ? '양' : '음';
}

export type TenGod =
  | '비견' | '겁재' | '식신' | '상관' | '편재'
  | '정재' | '편관' | '정관' | '편인' | '정인';
export type TenGodGroup = '비겁' | '식상' | '재성' | '관성' | '인성';

export const TEN_GOD_GROUP: Readonly<Record<TenGod, TenGodGroup>> = {
  비견: '비겁', 겁재: '비겁',
  식신: '식상', 상관: '식상',
  편재: '재성', 정재: '재성',
  편관: '관성', 정관: '관성',
  편인: '인성', 정인: '인성',
};

/**
 * 일간 기준 대상 천간의 십신.
 * 같은 오행 → 비겁, 일간이 생함 → 식상, 일간이 극함 → 재성, 대상이 일간을 극함 → 관성, 대상이 일간을 생함 → 인성.
 * 음양이 같으면 비견·식신·편재·편관·편인, 다르면 겁재·상관·정재·정관·정인.
 */
export function tenGodOf(dayMaster: Stem, target: Stem): TenGod {
  const d = stemIndex(dayMaster);
  const t = stemIndex(target);
  const rel = (Math.floor(t / 2) - Math.floor(d / 2) + 5) % 5;
  const same = d % 2 === t % 2;
  switch (rel) {
    case 0: return same ? '비견' : '겁재';
    case 1: return same ? '식신' : '상관';
    case 2: return same ? '편재' : '정재';
    case 3: return same ? '편관' : '정관';
    default: return same ? '편인' : '정인';
  }
}

/** 60갑자 인덱스(甲子=0) → 간지 */
export function sexagenary(index: number): { stem: Stem; branch: Branch } {
  const i = ((index % 60) + 60) % 60;
  return { stem: STEMS[i % 10]!, branch: BRANCHES[i % 12]! };
}
