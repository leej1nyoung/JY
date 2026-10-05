import type { FirstLetterResponse, SecondPage } from '@naite/letter';

export type StoredLetter = Extract<FirstLetterResponse, { ok: true }> & {
  /** 첫 장을 만든 시각 (두 번째 장을 같은 첫 장 기준으로 쓰기 위해) */
  createdAt?: string;
  /** 입력값. 두 번째 장을 요청할 때 서버가 첫 장을 다시 계산하는 데 쓴다. 이 탭에만 남는다 */
  request?: unknown;
};

// 아직 DB 가 없으므로 편지는 이 브라우저 탭(sessionStorage)에만 둔다. 탭을 닫으면 사라진다.
// 같은 입력이면 같은 편지가 다시 만들어지므로(템플릿 고정 선택) 잃어도 다시 받을 수 있다.
const KEY = 'naite:first-letter';

export function saveLetter(letter: StoredLetter): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(letter));
  } catch {
    // 사생활 보호 모드 등에서 저장이 막혀도 화면 이동은 계속한다
  }
}

export function loadLetter(): StoredLetter | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredLetter) : null;
  } catch {
    return null;
  }
}

// 두 번째 장도 이 탭에만 둔다. 새로고침해도 다시 생성하지 않도록 (CLAUDE.md 5-2 "생성된 편지는 저장")
const SECOND_KEY = 'naite:second-page';

export function saveSecondPage(page: SecondPage): void {
  try {
    sessionStorage.setItem(SECOND_KEY, JSON.stringify(page));
  } catch {
    // 무시
  }
}

export function loadSecondPage(): SecondPage | null {
  try {
    const raw = sessionStorage.getItem(SECOND_KEY);
    return raw ? (JSON.parse(raw) as SecondPage) : null;
  } catch {
    return null;
  }
}

export function clearSecondPage(): void {
  try {
    sessionStorage.removeItem(SECOND_KEY);
  } catch {
    // 무시
  }
}
