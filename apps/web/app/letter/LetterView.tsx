'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { loadLetter, type StoredLetter } from '@/lib/letter-storage';
import { track } from '@/lib/track';

export function LetterView() {
  const [letter, setLetter] = useState<StoredLetter | null | undefined>(undefined);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setLetter(loadLetter());
  }, []);

  // 첫 장 끝(페이지 표시 "1 / 2")이 화면에 보이면 "끝까지 읽음"으로 한 번 기록
  useEffect(() => {
    const el = endRef.current;
    if (!letter || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        track('letter_read_end');
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [letter]);

  if (letter === undefined) return <div style={{ minHeight: '60vh' }} />;

  if (letter === null) {
    return (
      <section className="hero center">
        <p className="envelope-text">아직 받은 편지가 없어요</p>
        <p className="envelope-sub">정보를 입력하면 다음 생일의 내가 쓴 편지를 바로 읽을 수 있어요.</p>
        <Link href="/write" className="btn">
          편지 받으러 가기
        </Link>
      </section>
    );
  }

  const { greeting, paragraphs, moment } = letter.letter;
  const b = letter.nextBirthday;
  const last = paragraphs.length - 1;
  const stamp = letter.stamp;
  // 봉투 미리보기 첫 줄: "진영아, 11월 말이야." (이름이 없으면 "있잖아,")
  const callName = greeting.startsWith('생일') ? '있잖아' : greeting.split(',')[0];
  const momentLabel = moment?.label ?? '1년 중 어느 날';

  return (
    <>
      <p className="letter-date">
        {b.year}년 {b.month}월 {b.day}일, 다음 생일의 나로부터
      </p>

      <article className="paper" aria-label="편지 첫 장">
        {stamp && (
          <div className="stamp" aria-label={`${stamp.dayPillarKo}일주, ${stamp.birthDate} 생`}>
            <span className="stamp-pillar">{stamp.dayPillar}</span>
            <span className="stamp-date">{stamp.birthDate.replaceAll('-', '.')}</span>
          </div>
        )}
        <p>{greeting}</p>
        {paragraphs.map((p, i) => (
          <p key={i} className={i === last ? 'cut' : undefined}>
            {p}
          </p>
        ))}
        <span className="page-mark" ref={endRef}>1 / 2</span>
      </article>

      {letter.notes.length > 0 && (
        <div className="letter-notes">
          {letter.notes.map((n) => (
            <p key={n}>※ {n}</p>
          ))}
        </div>
      )}

      <section className="envelope-wrap" aria-label="편지 두 번째 장">
        <div className="envelope" aria-hidden="true">
          <div className="sheet">
            <span style={{ width: '80%' }} />
            <span style={{ width: '92%' }} />
            <span style={{ width: '64%' }} />
          </div>
          <div className="body" />
          <div className="label">두 번째 장</div>
        </div>
        <p className="envelope-text">봉투 안에 한 장이 더 있어</p>
        <ol className="envelope-list">
          <li>{momentLabel}, 그날 네가 한 일</li>
          <li>
            {b.month}월 {b.day}일 생일부터 1년, 달라지는 흐름
          </li>
          <li>미래의 내가 꼭 부탁하고 싶은 한 가지</li>
        </ol>
        <p className="peek" aria-hidden="true">
          {/* 흐린 부분은 실제 두 번째 장 내용이 아니라 자리만 보여 주는 안내 문장이다 (내용을 지어내 보여 주지 않는다) */}
          {callName}, {momentLabel.replace(/^1년 중 /, '')} 말이야. 너는 <span className="blur">그날 있었던 일을 여기에 적어 둘게.</span>{' '}
          <span className="blur">두 번째 장에서 이어서 말할게.</span>
        </p>
        <button className="btn" type="button" onClick={() => {
            track('pay_click');
            dialogRef.current?.showModal();
          }}
        >
          선물 상자 열어보기 · 990원
        </button>
        <p className="refund-note">열람 후에는 환불이 제한돼요</p>
      </section>

      <dialog ref={dialogRef} className="dialog" onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}>
        <h2>두 번째 장은 곧 열 수 있어요</h2>
        <p>지금은 미리 보기 기간이라 결제를 받지 않아요. 관심 가져 줘서 고마워요.</p>
        <button className="btn btn-soft" type="button" onClick={() => dialogRef.current?.close()}>
          알겠어요
        </button>
      </dialog>
    </>
  );
}
