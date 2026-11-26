"""명령줄 사용법:  python -m mailbrain <명령> ...

  ingest <파일 또는 폴더...> --owner 이름 [--since 2025-12-01]   메일 넣기
  serve [--host 0.0.0.0] [--port 8765] [--password 암호]        팀 웹 화면 열기
  search "질문"                                                 명령줄에서 검색
  cases build [--ai] [--limit 100] [--rebuild]                  사례 DB 만들기 (--ai: 사내 AI로 정리)
  cases export 사례.csv | 사례.jsonl [--dealer TMU ...]          사례 DB 내보내기 (엑셀용 CSV)
  cases show [--dealer TMU] [--part 31Q6-10130] [--q "fan brake"] 사례 DB 조회 + 요약
  stats                                                         누구 메일이 몇 통 들어갔는지
  remove-owner 이름                                             한 사람의 메일함을 통째로 빼기
"""
import argparse
import os
import sys
from datetime import datetime, timedelta

from . import ingest, search
from .db import connect, load_config


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    p = argparse.ArgumentParser(prog="mailbrain", description="팀 메일 브레인")
    p.add_argument("--data", default=os.environ.get("MAILBRAIN_DATA", "data"), help="데이터 폴더 (기본: ./data)")
    sub = p.add_subparsers(dest="cmd", required=True)

    pi = sub.add_parser("ingest", help="메일 넣기")
    pi.add_argument("paths", nargs="+")
    pi.add_argument("--owner", required=True, help="메일함 주인 이름 (예: 이진영)")
    pi.add_argument("--since", help="이 날짜 이후 메일만 (YYYY-MM-DD). 기본: 최근 1년")
    pi.add_argument("--all", action="store_true", help="기간 제한 없이 전부")

    ps = sub.add_parser("serve", help="웹 화면 열기")
    ps.add_argument("--host", default="127.0.0.1", help="팀원이 접속하게 하려면 0.0.0.0")
    ps.add_argument("--port", type=int, default=8765)
    ps.add_argument("--password", default=os.environ.get("MAILBRAIN_PASSWORD"), help="접속 암호 (권장)")
    ps.add_argument("--keep-uploads", action="store_true", help="업로드한 원본 PST를 지우지 않고 남김")

    pq = sub.add_parser("search", help="명령줄 검색")
    pq.add_argument("query")
    pq.add_argument("--owner")
    pq.add_argument("-n", type=int, default=10)

    pi.add_argument("--limit", type=int, help="시험용: 새 메일 N통만 넣고 멈춤 (예: 100)")

    pc = sub.add_parser("cases", help="사례 DB")
    pcs = pc.add_subparsers(dest="cases_cmd", required=True)
    pcb = pcs.add_parser("build", help="사례 DB 만들기")
    pcb.add_argument("--ai", action="store_true", help="사내 AI로 이슈·조치·결과·요약 정리")
    pcb.add_argument("--limit", type=int, help="AI 정리를 N건만 (시험용)")
    pcb.add_argument("--rebuild", action="store_true", help="이미 AI로 정리한 것도 다시")
    pce = pcs.add_parser("export", help="내보내기")
    pce.add_argument("file", help=".csv 또는 .jsonl")
    pcsh = pcs.add_parser("show", help="조회")
    for x in (pce, pcsh):
        x.add_argument("--dealer")
        x.add_argument("--part", dest="part_no")
        x.add_argument("--model")
        x.add_argument("--category")
        x.add_argument("--q")
    pcsh.add_argument("-n", type=int, default=15)

    sub.add_parser("stats", help="현황")

    pr = sub.add_parser("remove-owner", help="한 사람 메일 빼기")
    pr.add_argument("owner")

    a = p.parse_args(argv)
    data_dir = os.path.abspath(a.data)
    cfg = load_config(data_dir)
    db_path = os.path.join(data_dir, "brain.db")

    if a.cmd == "ingest":
        since = None
        if not a.all:
            since = datetime.strptime(a.since, "%Y-%m-%d") if a.since else datetime.now() - timedelta(days=366)
        conn = connect(db_path)
        print(f"기간: {since.strftime('%Y-%m-%d') + ' 이후' if since else '전체'} / 제외 폴더·제목 규칙: {data_dir}{os.sep}config.json")
        ok = True
        for path in a.paths:
            try:
                ingest.ingest_path(conn, path, a.owner.strip(), cfg, since, limit=a.limit)
            except Exception as e:
                ok = False
                print(f"! {path}: {e}")
        return 0 if ok else 1

    if a.cmd == "serve":
        from .server import serve
        httpd = serve(db_path, cfg, data_dir, a.host, a.port, a.password, a.keep_uploads)
        shown = "localhost" if a.host in ("127.0.0.1", "0.0.0.0") else a.host
        print(f"팀 메일 브레인이 열렸습니다:  http://{shown}:{a.port}")
        if a.host == "0.0.0.0":
            print("  팀원은 http://<이 PC의 사내 IP>:%d 로 접속하세요 (ipconfig 로 IP 확인)" % a.port)
            if not a.password:
                print("  ※ 접속 암호가 없습니다. --password 를 꼭 지정하세요.")
        print("끄려면 Ctrl+C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        return 0

    conn = connect(db_path)
    if a.cmd == "search":
        r = search.search(conn, a.query, cfg, a.owner, limit=a.n)
        print("검색어:", " / ".join("·".join(g) for g in r["groups"]) or "(없음)")
        cs = r.get("case_summary")
        if cs and cs["total"]:
            top = lambda xs: ", ".join(f"{x['value']}({x['count']})" for x in xs) or "-"  # noqa: E731
            print(f"사례 요약 ({cs['basis']} 포함): 총 {cs['total']}건 | 결과 {top(cs['status'])} | "
                  f"주요 품번 {top(cs['part_no'][:3])}")
        if r["experts"]:
            print("이 주제를 많이 다룬 사람:", ", ".join(e["owner"] for e in r["experts"]))
        for c in r["cards"]:
            print(f"\n★ 노하우 카드: {c['title']} ({c['author']})\n   {c['body'][:200]}")
        for i, t in enumerate(r["threads"], 1):
            print(f"\n[{i}] {t['subject']}  ({t['first_date'][:10]}~{t['last_date'][:10]}, {t['count']}통)")
            print(f"    메일함: {', '.join(t['owners'])}  |  참여: {', '.join(t['participants'][:5])}")
            print(f"    {t['snippet']}")
        print(f"\n총 {r['total']}건")
    elif a.cmd == "cases":
        from . import cases
        if a.cases_cmd == "build":
            def prog(st):
                if a.ai:
                    print(f"\r  {st['done']}/{st['total']}  AI 정리 {st['ai']}건, 실패 {st['ai_failed']}건, "
                          f"이미 정리됨 {st['ai_skipped']}건", end="", flush=True)
            st = cases.build(conn, cfg, use_ai=a.ai, limit=a.limit, rebuild=a.rebuild,
                             progress=prog if a.ai else None)
            print(f"\n사례 {st['done']}건 정리 완료" + (f" (AI {st['ai']}건, 실패 {st['ai_failed']}건)" if a.ai else ""))
            if st["last_error"]:
                print("  마지막 오류:", st["last_error"])
            return 0
        f = {k: getattr(a, k) for k in ("dealer", "part_no", "model", "category", "q") if getattr(a, k, None)}
        if a.cases_cmd == "export":
            fmt = "jsonl" if a.file.lower().endswith(".jsonl") else "csv"
            with open(a.file, "w", encoding="utf-8", newline="") as fh:
                fh.write(cases.export(conn, fmt, f))
            print(f"내보냄: {a.file}")
            return 0
        r = cases.query(conn, f, limit=a.n)
        sm = r["summary"]
        top = lambda xs: ", ".join(f"{x['value']}({x['count']})" for x in xs) or "-"  # noqa: E731
        print(f"총 {r['total']}건 | 결과: {top(sm['status'])}")
        print(f"주요 품번: {top(sm['part_no'])} | 모델: {top(sm['model'])} | 분류: {top(sm['category'])}")
        if sm["action"]:
            print(f"공통 조치(AI): {top(sm['action'])}")
        for c in r["cases"]:
            print(f"\n#{c['thread_id']} {(c['last_date'] or '')[:10]} [{c['dealer'] or '-'}] {c['subject']}")
            print(f"   품번 {c['part_no'] or '-'} | 모델 {c['model'] or '-'} | {c['category']} | {c['status']} ({c['method']})")
            if c["action"]:
                print(f"   조치: {c['action'][:120]}")
            if c["result"]:
                print(f"   결과: {c['result'][:120]}")
    elif a.cmd == "stats":
        s = search.stats(conn)
        print(f"메일 {s['messages']}통 / 사례 {s['cases']}건 (AI 정리 {s['cases_ai']}건) / 노하우 카드 {s['cards']}개")
        for o in s["owners"]:
            print(f"  {o['owner']}: {o['messages']}통 ({(o['first'] or '')[:10]} ~ {(o['last'] or '')[:10]})")
    elif a.cmd == "remove-owner":
        n = ingest.remove_owner(conn, a.owner)
        print(f"{a.owner} 님 메일함을 뺐습니다. 완전히 지워진 메일 {n}통 (다른 사람 메일함에도 있던 건 남김)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
