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

  const { greeting, paragraphs } = letter.letter;
  const b = letter.nextBirthday;
  const last = paragraphs.length - 1;

  return (
    <>
      <p className="letter-date">
        {b.year}년 {b.month}월 {b.day}일, 다음 생일의 나로부터
      </p>

      <article className="paper" aria-label="편지 첫 장">
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
        <p className="envelope-text">봉투 안에 한 장이 더 남아 있어</p>
        <p className="envelope-sub">
          이번 1년 동안 가장 고마웠던 일, 다가오는 흐름,
          <br />
          그리고 마지막 당부 한 줄까지.
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
