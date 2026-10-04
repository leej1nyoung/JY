export type Mbti = `${'E' | 'I'}${'N' | 'S'}${'T' | 'F'}${'J' | 'P'}`;

export function parseMbti(value: string): Mbti {
  const v = value.trim().toUpperCase();
  if (!/^[EI][NS][TF][JP]$/.test(v)) throw new RangeError(`MBTI 형식이 올바르지 않습니다: ${value}`);
  return v as Mbti;
}
