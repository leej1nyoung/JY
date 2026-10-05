'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { FirstLetterField } from '@naite/letter';
import { requestFirstLetter } from '../actions';
import { clearSecondPage, saveLetter } from '@/lib/letter-storage';
import { track } from '@/lib/track';

export interface PlaceOption {
  code: string;
  sido: string;
  name: string;
}

const SIDO_ORDER = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
];
const ABROAD = '__abroad__';

const MBTI_AXES = [
  [['E', '외향'], ['I', '내향']],
  [['N', '직관'], ['S', '감각']],
  [['T', '사고'], ['F', '감정']],
  [['J', '판단'], ['P', '인식']],
] as const;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const pad = (n: number) => String(n).padStart(2, '0');
function hourLabel(h: number) {
  if (h === 0) return '0시 (자정)';
  if (h === 12) return '12시 (정오)';
  return h < 12 ? `${h}시 (오전 ${h}시)` : `${h}시 (오후 ${h - 12}시)`;
}

export function WriteForm({ places, maxYear }: { places: PlaceOption[]; maxYear: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>('solar');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [isLeapMonth, setIsLeapMonth] = useState(false);
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [hour, setHour] = useState('');
  const [minute, setMinute] = useState('');
  const [sido, setSido] = useState('');
  const [placeCode, setPlaceCode] = useState('');
  const [mbti, setMbti] = useState<string[]>(['', '', '', '']);
  const [birthdayBasis, setBirthdayBasis] = useState<'solar' | 'lunar' | ''>('');
  const [confirmSelf, setConfirmSelf] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [error, setError] = useState<{ field: FirstLetterField; message: string } | null>(null);

  const sidoList = useMemo(() => SIDO_ORDER.filter((s) => places.some((p) => p.sido === s)), [places]);
  const placeList = useMemo(() => places.filter((p) => p.sido === sido), [places, sido]);
  const abroad = sido === ABROAD;

  const complete =
    year && month && day && (timeUnknown || (hour && minute)) && placeCode && mbti.every(Boolean) &&
    birthdayBasis && confirmSelf && confirmAge && !abroad;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || pending) return;
    setError(null);
    startTransition(async () => {
      const request = {
        calendar,
        year: Number(year),
        month: Number(month),
        day: Number(day),
        isLeapMonth: calendar === 'lunar' && isLeapMonth,
        time: timeUnknown ? null : { hour: Number(hour), minute: Number(minute) },
        birthplaceCode: placeCode,
        mbti: mbti.join(''),
        name: name.trim() || null,
        birthdayBasis,
        confirmSelf,
        confirmAge,
      };
      const res = await requestFirstLetter(request);
      if (!res.ok) {
        setError({ field: res.field, message: res.message });
        return;
      }
      saveLetter({ ...res, request });
      clearSecondPage(); // 새 편지를 받으면 이전 두 번째 장은 지운다
      track('letter_created');
      router.push('/letter');
    });
  }

  const fieldError = (f: FirstLetterField) =>
    error?.field === f ? <p className="field-error" role="alert">{error.message}</p> : null;

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor="name">
          불리고 싶은 이름<span className="optional">선택</span>
        </label>
        <input
          id="name"
          className="input"
          value={name}
          maxLength={10}
          autoComplete="nickname"
          placeholder="비워 두면 '너'라고 부를게요"
          onChange={(e) => setName(e.target.value)}
        />
        {fieldError('name')}
      </div>

      <fieldset className="field">
        <legend>생년월일</legend>
        <div className="segmented" role="radiogroup" aria-label="양력 또는 음력">
          {(['solar', 'lunar'] as const).map((c) => (
            <label key={c} className="toggle">
              <input type="radio" name="calendar" checked={calendar === c} onChange={() => setCalendar(c)} />
              <span>{c === 'solar' ? '양력' : '음력'}</span>
            </label>
          ))}
        </div>
        <div className="row row-3">
          <select className="select" aria-label="태어난 해" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">년</option>
            {range(1920, maxYear).reverse().map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select className="select" aria-label="태어난 달" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">월</option>
            {range(1, 12).map((m) => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
          <select className="select" aria-label="태어난 날" value={day} onChange={(e) => setDay(e.target.value)}>
            <option value="">일</option>
            {range(1, calendar === 'lunar' ? 30 : 31).map((d) => (
              <option key={d} value={d}>{d}일</option>
            ))}
          </select>
        </div>
        {calendar === 'lunar' && (
          <label className="check inline-check">
            <input type="checkbox" checked={isLeapMonth} onChange={(e) => setIsLeapMonth(e.target.checked)} />
            <span className="box" />
            윤달이에요
          </label>
        )}
        {fieldError('birth')}
      </fieldset>

      <fieldset className="field">
        <legend>태어난 시간</legend>
        {!timeUnknown && (
          <div className="row row-2">
            <select className="select" aria-label="태어난 시" value={hour} onChange={(e) => setHour(e.target.value)}>
              <option value="">시</option>
              {range(0, 23).map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
            <select className="select" aria-label="태어난 분" value={minute} onChange={(e) => setMinute(e.target.value)}>
              <option value="">분</option>
              {range(0, 59).map((m) => (
                <option key={m} value={m}>{pad(m)}분</option>
              ))}
            </select>
          </div>
        )}
        <label className="check inline-check">
          <input type="checkbox" checked={timeUnknown} onChange={(e) => setTimeUnknown(e.target.checked)} />
          <span className="box" />
          시간을 몰라요
        </label>
        <p className="hint">
          {timeUnknown
            ? '시간 없이도 편지를 쓸 수 있어요.'
            : '출생 기록에 적힌 시각 그대로 넣어 주세요. 서머타임이나 지역별 시차 보정은 저희가 해요.'}
        </p>
        {fieldError('time')}
      </fieldset>

      <fieldset className="field">
        <legend>태어난 곳</legend>
        <div className="row row-2">
          <select
            className="select"
            aria-label="시·도"
            value={sido}
            onChange={(e) => {
              setSido(e.target.value);
              setPlaceCode('');
            }}
          >
            <option value="">시·도</option>
            {sidoList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value={ABROAD}>해외</option>
          </select>
          <select
            className="select"
            aria-label="시·군·구"
            value={placeCode}
            disabled={!sido || abroad}
            onChange={(e) => setPlaceCode(e.target.value)}
          >
            <option value="">시·군·구</option>
            {placeList.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>
        {abroad ? (
          <p className="notice-box">해외에서 태어난 경우는 아직 준비 중이에요. 조금만 기다려 줘요.</p>
        ) : (
          <p className="hint">지금 행정구역 이름으로 골라 주세요. 구를 모르면 &lsquo;(구 모름)&rsquo;을 고르면 돼요.</p>
        )}
        {fieldError('birthplace')}
      </fieldset>

      <fieldset className="field">
        <legend>MBTI</legend>
        <div className="mbti-grid">
          {MBTI_AXES.map((pair, i) => (
            <div key={i} className="segmented" role="radiogroup" aria-label={`${pair[0][0]} 또는 ${pair[1][0]}`}>
              {pair.map(([letter, label]) => (
                <label key={letter} className="toggle">
                  <input
                    type="radio"
                    name={`mbti-${i}`}
                    checked={mbti[i] === letter}
                    onChange={() => setMbti((prev) => prev.map((v, j) => (j === i ? letter : v)))}
                  />
                  <span>
                    {letter}
                    <small>{label}</small>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
        {fieldError('mbti')}
      </fieldset>

      <fieldset className="field">
        <legend>생일은 언제 챙겨요?</legend>
        <div className="segmented" role="radiogroup" aria-label="생일 기준">
          {(['solar', 'lunar'] as const).map((b) => (
            <label key={b} className="toggle">
              <input type="radio" name="birthdayBasis" checked={birthdayBasis === b} onChange={() => setBirthdayBasis(b)} />
              <span>{b === 'solar' ? '양력 생일' : '음력 생일'}</span>
            </label>
          ))}
        </div>
        <p className="hint">다음 생일을 이 기준으로 계산해요. 평소 챙기는 생일을 골라 주세요.</p>
        {fieldError('birthdayBasis')}
      </fieldset>

      <fieldset className="field">
        <legend>확인해 주세요</legend>
        <label className="check">
          <input type="checkbox" checked={confirmSelf} onChange={(e) => setConfirmSelf(e.target.checked)} />
          <span className="box" />
          본인의 정보만 입력했어요
        </label>
        <label className="check">
          <input type="checkbox" checked={confirmAge} onChange={(e) => setConfirmAge(e.target.checked)} />
          <span className="box" />
          만 14세 이상이에요
        </label>
        {fieldError('confirm')}
      </fieldset>

      <button className="btn" type="submit" disabled={!complete || pending}>
        {pending ? '편지를 꺼내는 중…' : '편지 열어보기'}
      </button>
      <p className="cta-note">첫 장은 무료예요</p>
    </form>
  );
}
