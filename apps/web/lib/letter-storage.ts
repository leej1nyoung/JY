import type { FirstLetterResponse } from '@naite/letter';

export type StoredLetter = Extract<FirstLetterResponse, { ok: true }>;

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
