"""사례 검색: 메일 → 스레드(사례) 단위로 묶어서 돌려준다."""
import math

from . import cases

from .textutil import index_text, query_groups, snippet, stem, tokens


def _fts_expr(groups):
    """[[단어, 동의어]] → FTS5 MATCH 식. 단어 안 토큰은 AND, 단어끼리는 OR."""
    ors = []
    for g in groups:
        for w in g:
            toks = list(dict.fromkeys(tokens(w)))
            if not toks:
                continue
            parts = []
            for t in toks:
                if len(t) >= 4 and t.isalpha() and not ("\uac00" <= t[0] <= "\u9fff"):
                    parts.append(f'"{stem(t)}"*')  # label → labels, масло → масла
                else:
                    parts.append(f'"{t}"')
            ors.append("(" + " AND ".join(parts) + ")")
    return " OR ".join(dict.fromkeys(ors))


def _filters(owner, date_from, date_to, alias="m"):
    sql, args = [f"{alias}.hidden=0"], []
    if owner:
        sql.append(f"EXISTS (SELECT 1 FROM owners o WHERE o.message_id={alias}.id AND o.owner=?)")
        args.append(owner)
    if date_from:
        sql.append(f"{alias}.date >= ?")
        args.append(date_from)
    if date_to:
        sql.append(f"{alias}.date <= ?")
        args.append(date_to + " 23:59")
    return " AND ".join(sql), args


def _owners_of_thread(conn, tid):
    rows = conn.execute(
        """SELECT o.owner, COUNT(*) n FROM owners o JOIN messages m ON m.id=o.message_id
           WHERE m.thread_id=? GROUP BY o.owner ORDER BY n DESC""", (tid,)).fetchall()
    return [r["owner"] for r in rows]


def search(conn, q, cfg, owner=None, date_from=None, date_to=None, limit=20, offset=0):
    groups = query_groups(q, cfg.get("synonyms"))
    terms = [stem(w) for g in groups for w in g]
    where, args = _filters(owner, date_from, date_to)
    cards = search_cards(conn, groups) if groups and not offset else []

    if not groups:
        rows = conn.execute(
            f"""SELECT t.id FROM threads t WHERE t.hidden=0 AND EXISTS
                (SELECT 1 FROM messages m WHERE m.thread_id=t.id AND {where})
                ORDER BY t.last_date DESC LIMIT ? OFFSET ?""", args + [limit, offset]).fetchall()
        threads = [thread_summary(conn, r["id"], [], None) for r in rows]
        return {"terms": [], "groups": [], "cards": [], "threads": threads, "experts": [], "total": len(threads)}

    expr = _fts_expr(groups)
    rows = conn.execute(
        f"""SELECT m.id, m.thread_id, m.subject, m.body_new, m.attachments, m.sender_name,
                   bm25(messages_fts, 4.0, 1.0) AS s
            FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
            JOIN threads t ON t.id = m.thread_id
            WHERE messages_fts MATCH ? AND {where} AND t.hidden=0
            ORDER BY s LIMIT 800""", [expr] + args).fetchall()

    by_thread = {}
    for r in rows:
        text = f"{r['subject']}\n{r['body_new']}\n{r['attachments']}".lower()
        hit = [i for i, g in enumerate(groups) if any(stem(w) in text for w in g)]
        t = by_thread.setdefault(r["thread_id"], {"best": None, "best_s": 0.0, "n": 0, "hit": set()})
        t["n"] += 1
        t["hit"].update(hit)
        score = -r["s"] + 2.0 * len(hit)
        if t["best"] is None or score > t["best_s"]:
            t["best"], t["best_s"] = r, score

    ranked = []
    for tid, t in by_thread.items():
        coverage = len(t["hit"]) / max(1, len(groups))
        ranked.append((coverage * 20 + t["best_s"] + math.log1p(t["n"]), tid, t))
    ranked.sort(key=lambda x: -x[0])
    total = len(ranked)
    page = ranked[offset: offset + limit]
    threads = []
    for score, tid, t in page:
        s = thread_summary(conn, tid, terms, t["best"])
        s["score"] = round(score, 2)
        s["matched"] = [groups[i][0] for i in sorted(t["hit"])]
        s["missing"] = [g[0] for i, g in enumerate(groups) if i not in t["hit"]]
        threads.append(s)

    # 이 주제를 많이 다룬 사람 (메일함 주인 기준, 상위 사례 50개)
    experts = {}
    for score, tid, t in ranked[:50]:
        coverage = len(t["hit"]) / max(1, len(groups))
        if coverage < 0.5:
            continue
        for i, o in enumerate(_owners_of_thread(conn, tid)):
            experts[o] = experts.get(o, 0) + coverage ** 2 * (1.0 if i == 0 else 0.5)
    experts = [{"owner": k, "weight": round(v, 1)} for k, v in sorted(experts.items(), key=lambda x: -x[1])[:5]]

    # 사례 요약: 질문 단어를 모두 담은 사례 (없으면 절반 이상 담은 사례) 기준
    full = [tid for _s, tid, t in ranked if len(t["hit"]) == len(groups)]
    half = [tid for _s, tid, t in ranked if len(t["hit"]) / max(1, len(groups)) >= 0.5]
    basis = full or half
    case_summary = cases.summary_for_threads(conn, basis[:500])
    case_summary["basis"] = "모든 단어" if full else "단어 절반 이상"

    return {"terms": terms, "groups": groups, "cards": cards, "threads": threads,
            "experts": experts, "total": total, "case_summary": case_summary}


def thread_summary(conn, tid, terms, best_row):
    t = conn.execute("SELECT * FROM threads WHERE id=?", (tid,)).fetchone()
    if best_row is None:
        best_row = conn.execute(
            "SELECT id, body_new, attachments FROM messages WHERE thread_id=? AND hidden=0 ORDER BY date LIMIT 1",
            (tid,)).fetchone()
    atts = set()
    for r in conn.execute("SELECT attachments FROM messages WHERE thread_id=? AND hidden=0", (tid,)):
        atts.update(a for a in (r["attachments"] or "").split("\n") if a)
    card = conn.execute("SELECT id, title FROM cards WHERE thread_id=? LIMIT 1", (tid,)).fetchone()
    case = conn.execute("SELECT * FROM cases WHERE thread_id=?", (tid,)).fetchone()
    return {
        "id": tid,
        "subject": t["subject"],
        "first_date": t["first_date"],
        "last_date": t["last_date"],
        "count": t["msg_count"],
        "participants": [p for p in (t["participants"] or "").split("|") if p][:8],
        "owners": _owners_of_thread(conn, tid),
        "snippet": snippet(best_row["body_new"] if best_row else "", terms),
        "best_message": best_row["id"] if best_row else None,
        "attachments": sorted(atts)[:12],
        "card": dict(card) if card else None,
        "case": dict(case) if case else None,
    }


def get_thread(conn, tid):
    t = conn.execute("SELECT * FROM threads WHERE id=?", (tid,)).fetchone()
    if not t:
        return None
    msgs = []
    for m in conn.execute("SELECT * FROM messages WHERE thread_id=? AND hidden=0 ORDER BY date", (tid,)):
        owners = [r["owner"] for r in conn.execute("SELECT owner FROM owners WHERE message_id=?", (m["id"],))]
        msgs.append({
            "id": m["id"], "subject": m["subject"], "sender": m["sender_name"], "sender_email": m["sender_email"],
            "to": m["to_text"], "cc": m["cc_text"], "date": m["date"], "folder": m["folder"],
            "body_new": m["body_new"], "body": m["body"] if m["body"] != m["body_new"] else None,
            "attachments": [a for a in (m["attachments"] or "").split("\n") if a], "owners": owners,
        })
    cards = [dict(r) for r in conn.execute("SELECT * FROM cards WHERE thread_id=?", (tid,))]
    case = conn.execute("SELECT * FROM cases WHERE thread_id=?", (tid,)).fetchone()
    return {"id": tid, "subject": t["subject"], "first_date": t["first_date"], "last_date": t["last_date"],
            "participants": [p for p in (t["participants"] or "").split("|") if p],
            "owners": _owners_of_thread(conn, tid), "messages": msgs, "cards": cards,
            "case": dict(case) if case else None}


# ------------------------------------------------------------------ 노하우 카드

def search_cards(conn, groups, limit=5):
    expr = _fts_expr(groups)
    if not expr:
        return []
    rows = conn.execute(
        """SELECT c.*, bm25(cards_fts, 3.0, 1.0) s FROM cards_fts JOIN cards c ON c.id=cards_fts.rowid
           WHERE cards_fts MATCH ? ORDER BY s LIMIT ?""", (expr, limit)).fetchall()
    return [dict(r) for r in rows]


def save_card(conn, data, now):
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    tags = (data.get("tags") or "").strip()
    if not title:
        raise ValueError("제목을 입력해 주세요")
    tid = data.get("thread_id") or None
    if data.get("id"):
        cid = int(data["id"])
        conn.execute("UPDATE cards SET title=?, body=?, tags=?, author=?, thread_id=?, updated=? WHERE id=?",
                     (title, body, tags, data.get("author") or "", tid, now, cid))
        conn.execute("DELETE FROM cards_fts WHERE rowid=?", (cid,))
    else:
        cid = conn.execute(
            "INSERT INTO cards(thread_id, title, body, tags, author, created, updated) VALUES (?,?,?,?,?,?,?)",
            (tid, title, body, tags, data.get("author") or "", now, now)).lastrowid
    conn.execute("INSERT INTO cards_fts(rowid, title, body) VALUES (?,?,?)",
                 (cid, index_text(title + " " + tags), index_text(body)))
    conn.commit()
    return cid


def delete_card(conn, cid):
    conn.execute("DELETE FROM cards WHERE id=?", (cid,))
    conn.execute("DELETE FROM cards_fts WHERE rowid=?", (cid,))
    conn.commit()


def list_cards(conn):
    return [dict(r) for r in conn.execute("SELECT * FROM cards ORDER BY updated DESC")]


def stats(conn):
    one = lambda sql: conn.execute(sql).fetchone()[0]  # noqa: E731
    owners = [dict(r) for r in conn.execute(
        """SELECT owner, COUNT(*) messages, MIN(m.date) first, MAX(m.date) last
           FROM owners o JOIN messages m ON m.id=o.message_id GROUP BY owner ORDER BY owner""")]
    return {
        "messages": one("SELECT COUNT(*) FROM messages"),
        "threads": one("SELECT COUNT(*) FROM threads"),
        "cards": one("SELECT COUNT(*) FROM cards"),
        "cases": one("SELECT COUNT(*) FROM cases"),
        "cases_ai": one("SELECT COUNT(*) FROM cases WHERE method='AI'"),
        "owners": owners,
        "sources": [dict(r) for r in conn.execute("SELECT * FROM sources ORDER BY id DESC LIMIT 30")],
    }


