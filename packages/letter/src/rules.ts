// 편지 문장 규칙 (CLAUDE.md 5-2 편지 톤 원칙). 첫 장 템플릿 검사와 두 번째 장 AI 결과 검사가 함께 쓴다.

/** 결정 지시·건강 예언·단정 표현 */
export const BANNED_WORDS = ['투자', '이직', '퇴사', '연애', '결혼', '이별', '건강', '병원', '수술', '죽', '반드시', '무조건'];

/** 본문에 쓰지 않는 명리 용어 */
export const JARGON = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인', '비겁', '식상', '재성', '관성', '인성', '일간', '세운', '오행', '십신', '월운'];

/** 사람 글처럼 보이지 않게 만드는 상투어 (리뷰에서 지적된 AI 문체) */
export const AI_TELLS = ['너라서', '많이 애썼', '단단해졌', '나는 기억해', '다 기억해', '그 시간을 지나와서', '잘 맞는 해였', '마음 한쪽', '숨 돌릴 틈', '차곡차곡', '한 걸음씩', '오롯이', '선물 같', '쉼표'];

/** 직업·학업·가족 관계를 짐작하게 하는 말. 받는 사람은 학생일 수도, 쉬고 있을 수도, 가족이 없을 수도 있다 */
export const LIFE_ASSUMPTIONS = [
  '회의', '회사', '출근', '퇴근', '상사', '동료', '팀장', '업무', '직장', '보고서', '발표', '출장', '야근', '사무실', '월급', '연봉', '거래처',
  '프로젝트', '마감', '면접', '취업', '알바', '손님', '고객', '메일', '학교', '수업', '시험', '과제', '숙제', '선생님', '교수',
  '엄마', '아빠', '부모', '남편', '아내', '남친', '여친', '애인', '자녀',
];

/** 남의 일을 짐작하는 말투 ("~했을 거야") */
export const GUESSING = /을 거[야예]/;

/** 문장에 들어 있는 규칙 위반 단어 목록 (없으면 빈 배열) */
/**
 * 명리 용어가 일상어 속에 섞인 경우는 빼고 찾는다.
 * 예: "충전되는 편인데"(편인), "상관없어"(상관), "식상해"(식상), "계획을 세운 날"(세운), "습관성"(관성), "3일간"(일간), "확정인데"(정인)
 */
const JARGON_EXCEPT: Readonly<Record<string, RegExp>> = {
  편인: /^(데|지|가|걸|게|것|\s거|\s것)/,
  정인: /^(데|지|가|걸|게|것|\s거|\s것)/,
  상관: /^\s*(없|있|이\s*없|하지|안\s)/,
  식상: /^(해|하|한|했)/,
  비견: /^(할|될|하|되)/,
  세운: /^(\s|$|[.,!?])/,
};
export function jargonHits(text: string): string[] {
  return JARGON.filter((w) => {
    const re = new RegExp(`(?<![가-힣0-9])${w}`, 'g');
    for (const m of text.matchAll(re)) {
      const rest = text.slice((m.index ?? 0) + w.length);
      if (!JARGON_EXCEPT[w]?.test(rest)) return true;
    }
    return false;
  });
}

export function ruleViolations(text: string): string[] {
  const found = [...[...BANNED_WORDS, ...AI_TELLS, ...LIFE_ASSUMPTIONS].filter((w) => text.includes(w)), ...jargonHits(text)];
  if (GUESSING.test(text)) found.push('~을 거야');
  return found;
}
