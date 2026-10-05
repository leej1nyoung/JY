'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { SecondPage } from '@naite/letter';
import { requestSecondPage } from '@/app/actions';
import { loadLetter, loadSecondPage, saveSecondPage, type StoredLetter } from '@/lib/letter-storage';
import { track } from '@/lib/track';
import { WORTH } from '@/lib/events';

const WORTH_KEY = 'naite:worth-answered';

export function LetterView({ secondPageFree = false }: { secondPageFree?: boolean }) {
  const [letter, setLetter] = useState<StoredLetter | null | undefined>(undefined);
  const [second, setSecond] = useState<SecondPage | null>(null);
  const [secondError, setSecondError] = useState<string | null>(null);
  const [opening, startOpening] = useTransition();
  const [answered, setAnswered] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const secondRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLetter(loadLetter());
    setSecond(loadSecondPage());
    try {
      setAnswered(sessionStorage.getItem(WORTH_KEY) === '1');
    } catch {
      // 무시
    }
  }, []);

  function openSecondPage() {
    dialogRef.current?.close();
    if (!letter?.request || !letter.createdAt) {
      setSecondError('편지를 처음부터 다시 받아 주세요. (이전 버전에서 받은 편지예요)');
      return;
    }
    setSecondError(null);
    startOpening(async () => {
      let res: Awaited<ReturnType<typeof requestSecondPage>>;
      try {
        res = await requestSecondPage(letter.request, letter.createdAt);
      } catch {
        // 서버 시간 초과·연결 끊김 등. 아무 말 없이 버튼으로 돌아가지 않게 안내한다
        setSecondError('두 번째 장을 쓰는 데 시간이 너무 걸렸어요. 잠시 뒤에 다시 열어 주세요.');
        return;
      }
      if (!res.ok) {
        setSecondError(res.message);
        return;
      }
      saveSecondPage(res.page);
      setSecond(res.page);
      track('second_page_view');
      requestAnimationFrame(() => secondRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  }

  function answer(event: (typeof WORTH)[number]['event']) {
    track(event);
    setAnswered(true);
    try {
      sessionStorage.setItem(WORTH_KEY, '1');
    } catch {
      // 무시
    }
  }

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

      {second ? (
        <>
          <article className="paper paper-second" aria-label="편지 두 번째 장" ref={secondRef}>
            {second.moment.map((p, i) => (
              <p key={`m${i}`}>{i === 0 ? `…${p}` : p}</p>
            ))}
            {second.flow.map((p, i) => (
              <p key={`f${i}`}>{p}</p>
            ))}
            <p className="request">{second.request}</p>
            <span className="page-mark">2 / 2</span>
          </article>

          {secondPageFree && (
            <section className="survey" aria-label="짧은 질문">
              {answered ? (
                <p className="survey-thanks">알려 줘서 고마워요.</p>
              ) : (
                <>
                  <p className="survey-q">이 두 번째 장, 990원 낼 만했어?</p>
                  <div className="survey-buttons">
                    {WORTH.map((w) => (
                      <button key={w.event} type="button" className="btn btn-soft" onClick={() => answer(w.event)}>
                        {w.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      ) : (
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
          {opening ? (
            <p className="opening" role="status">
              봉투를 여는 중이에요. 길면 1분쯤 걸려요.
            </p>
          ) : (
            <button
              className="btn"
              type="button"
              onClick={() => {
                track('pay_click');
                dialogRef.current?.showModal();
              }}
            >
              선물 상자 열어보기 · 990원
            </button>
          )}
          {secondError && <p className="error">{secondError}</p>}
          <p className="refund-note">열람 후에는 환불이 제한돼요</p>
        </section>
      )}

      <dialog ref={dialogRef} className="dialog" onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}>
        {secondPageFree ? (
          <>
            <h2>지금은 무료로 열어 드려요</h2>
            <p>아직 테스트 기간이라 결제를 받지 않아요. 다 읽고 나면 990원을 낼 만했는지 한 번만 알려 주세요.</p>
            <button className="btn" type="button" onClick={openSecondPage}>
              두 번째 장 열기
            </button>
          </>
        ) : (
          <>
            <h2>두 번째 장은 곧 열 수 있어요</h2>
            <p>지금은 미리 보기 기간이라 결제를 받지 않아요. 관심 가져 줘서 고마워요.</p>
            <button className="btn btn-soft" type="button" onClick={() => dialogRef.current?.close()}>
              알겠어요
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
