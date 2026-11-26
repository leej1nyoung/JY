"""메일 → DB 적재."""
import hashlib
from datetime import datetime, timezone, timedelta

from . import readers
from .textutil import clean_text, index_text, normalize_subject, strip_quoted, subject_key

KST = timezone(timedelta(hours=9))


def _kst(dt):
    if dt is None:
        return ""
    if dt.tzinfo is None:
        return dt.strftime("%Y-%m-%d %H:%M")
    return dt.astimezone(KST).strftime("%Y-%m-%d %H:%M")


def _excluded(rec, cfg):
    folder = (rec.get("folder") or "").lower()
    if any(x.lower() in folder for x in cfg["exclude_folders"]):
        return True
    subj = (rec.get("subject") or "").lower()
    if any(x.lower() in subj for x in cfg["exclude_subject_keywords"]):
        return True
    snd = (rec.get("sender_email") or "").lower()
    if snd and any(x.lower() in snd for x in cfg["exclude_senders"]):
        return True
    return False


def _msg_key(rec, body):
    mid = (rec.get("message_id") or "").strip().strip("<>").lower()
    if mid:
        return "mid:" + mid
    h = hashlib.sha1()
    for part in (rec.get("sender_email") or rec.get("sender_name") or "", _kst(rec.get("date")),
                 normalize_subject(rec.get("subject")), body[:1000]):
        h.update(part.encode("utf-8", "ignore"))
        h.update(b"\x00")
    return "h:" + h.hexdigest()


def _thread_id(conn, rec, date):
    subj = normalize_subject(rec.get("subject"))
    key = subject_key(rec.get("subject"))
    if len(key) < 4:  # "문의", "RE:" 처럼 너무 짧은 제목은 보낸 사람까지 묶어 구분
        key = f"{key}|{(rec.get('sender_email') or rec.get('sender_name') or '').lower()}|{date[:7]}"
    row = conn.execute("SELECT id FROM threads WHERE subject_key=?", (key,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute(
        "INSERT INTO threads(subject_key, subject, first_date, last_date, msg_count) VALUES (?,?,?,?,0)",
        (key, subj or "(제목 없음)", date, date),
    )
    return cur.lastrowid


def _touch_thread(conn, tid, date, sender):
    t = conn.execute("SELECT first_date, last_date, participants FROM threads WHERE id=?", (tid,)).fetchone()
    parts = [p for p in (t["participants"] or "").split("|") if p]
    if sender and sender not in parts and len(parts) < 40:
        parts.append(sender)
    firsts = [x for x in (t["first_date"], date) if x]
    lasts = [x for x in (t["last_date"], date) if x]
    first = min(firsts) if firsts else ""
    last = max(lasts) if lasts else ""
    conn.execute(
        "UPDATE threads SET first_date=?, last_date=?, msg_count=msg_count+1, participants=? WHERE id=?",
        (first, last, "|".join(parts), tid),
    )


def ingest_path(conn, path, owner, cfg, since=None, log=print, progress=None, limit=None):
    """path(파일 또는 폴더)의 메일을 owner 의 메일함으로 적재한다."""
    totals = {"seen": 0, "added": 0, "merged": 0, "skipped": 0, "dup": 0, "files": 0}
    for fp in readers.iter_files(path):
        r = ingest_file(conn, fp, owner, cfg, since, log, progress, limit)
        totals["files"] += 1
        for k in ("seen", "added", "merged", "skipped", "dup"):
            totals[k] += r[k]
    return totals


def ingest_file(conn, fp, owner, cfg, since=None, log=print, progress=None, limit=None):
    started = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    src_id = conn.execute(
        "INSERT INTO sources(path, owner, started, status) VALUES (?,?,?,'running')", (fp, owner, started)
    ).lastrowid
    conn.commit()
    c = {"seen": 0, "added": 0, "merged": 0, "skipped": 0, "dup": 0}
    since_s = since.strftime("%Y-%m-%d") if since else ""
    touched = set()
    maxc = int(cfg.get("max_body_chars", 20000))
    log(f"[{owner}] 읽는 중: {fp}")
    try:
        for rec in readers.read_any(fp, log):
            if limit and c["added"] >= limit:
                log(f"  시험용 제한 {limit}통에 도달해 멈춤")
                break
            c["seen"] += 1
            date = _kst(rec.get("date"))
            if _excluded(rec, cfg) or (since_s and date and date < since_s):
                c["skipped"] += 1
                continue
            body = clean_text(readers.to_plain(rec))[:maxc]
            key = _msg_key(rec, body)
            row = conn.execute("SELECT id FROM messages WHERE msg_key=?", (key,)).fetchone()
            if row:
                cur = conn.execute(
                    "INSERT OR IGNORE INTO owners(message_id, owner, source) VALUES (?,?,?)", (row["id"], owner, fp)
                )
                c["merged" if cur.rowcount else "dup"] += 1
            else:
                body_new = strip_quoted(body)[:maxc]
                tid = _thread_id(conn, rec, date)
                atts = "\n".join(a for a in rec.get("attachments") or [] if a)
                sender = rec.get("sender_name") or rec.get("sender_email") or ""
                mid = conn.execute(
                    """INSERT INTO messages(msg_key, thread_id, subject, sender_name, sender_email, to_text,
                       cc_text, date, folder, body, body_new, attachments) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (key, tid, rec.get("subject") or "", sender, rec.get("sender_email") or "",
                     rec.get("to") or "", rec.get("cc") or "", date, rec.get("folder") or "",
                     body, body_new, atts),
                ).lastrowid
                conn.execute("INSERT INTO owners(message_id, owner, source) VALUES (?,?,?)", (mid, owner, fp))
                conn.execute(
                    "INSERT INTO messages_fts(rowid, subj, body) VALUES (?,?,?)",
                    (mid, index_text(rec.get("subject") or ""),
                     index_text(" ".join([sender, rec.get("to") or "", body_new, atts]))),
                )
                _touch_thread(conn, tid, date, sender)
                touched.add(tid)
                c["added"] += 1
            if c["seen"] % 500 == 0:
                conn.commit()
                conn.execute("UPDATE sources SET seen=?, added=?, merged=?, skipped=? WHERE id=?",
                             (c["seen"], c["added"], c["merged"], c["skipped"], src_id))
                if progress:
                    progress(fp, c)
                else:
                    log(f"  … {c['seen']}통 처리 (신규 {c['added']}, 다른 메일함과 겹침 {c['merged']}, "
                        f"이미 있음 {c['dup']}, 제외 {c['skipped']})")
        status, err = "done", None
    except Exception as e:  # 파일 하나가 망가져도 지금까지 읽은 건 남긴다
        status, err = "error", f"{type(e).__name__}: {e}"
        log(f"  ! 오류: {err}")
    if touched:  # 새 메일이 들어간 스레드는 사례 DB도 바로 갱신 (규칙 추출, 빠름)
        from . import cases
        cases.build(conn, cfg, tids=sorted(touched), log=lambda *_: None)
    conn.execute(
        "UPDATE sources SET finished=?, seen=?, added=?, merged=?, skipped=?, status=?, error=? WHERE id=?",
        (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), c["seen"], c["added"], c["merged"], c["skipped"],
         status, err, src_id),
    )
    conn.commit()
    if progress:
        progress(fp, c)
    log(f"  완료: {c['seen']}통 중 신규 {c['added']}, 다른 사람 메일함과 겹침 {c['merged']}, "
        f"이미 있음(같은 메일 반복) {c['dup']}, 제외(폴더·제목·기간 규칙) {c['skipped']}")
    if err:
        raise readers.ReaderError(err)
    return c


def remove_owner(conn, owner):
    """한 사람의 메일함을 통째로 뺀다. 다른 사람 메일함에도 있는 메일은 남긴다."""
    ids = [r[0] for r in conn.execute("SELECT message_id FROM owners WHERE owner=?", (owner,))]
    conn.execute("DELETE FROM owners WHERE owner=?", (owner,))
    removed = 0
    for mid in ids:
        if not conn.execute("SELECT 1 FROM owners WHERE message_id=?", (mid,)).fetchone():
            conn.execute("DELETE FROM messages_fts WHERE rowid=?", (mid,))
            row = conn.execute("SELECT thread_id FROM messages WHERE id=?", (mid,)).fetchone()
            conn.execute("DELETE FROM messages WHERE id=?", (mid,))
            if row:
                conn.execute("UPDATE threads SET msg_count=msg_count-1 WHERE id=?", (row[0],))
            removed += 1
    conn.execute("DELETE FROM cases WHERE thread_id IN (SELECT id FROM threads WHERE msg_count<=0)")
    conn.execute("DELETE FROM threads WHERE msg_count<=0")
    conn.commit()
    return removed
