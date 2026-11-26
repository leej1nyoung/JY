"""메일 스레드 → 사례(Case) DB.

사례 하나 = 메일 스레드 하나. (문의 메일과 결과 메일이 같은 스레드에 있으므로
메일 한 통이 아니라 스레드 단위로 정리해야 '이슈 → 조치 → 결과'가 한 줄에 모인다.)

1단계 규칙 추출 (항상, 즉시, AI 필요 없음)
  - 거래처·국가·모델·품번·분류·결과 상태를 사전/정규식으로 뽑는다.
2단계 AI 추출 (선택, 사내 AI가 연결돼 있을 때)
  - 이슈·조치·결과·요약을 사내 AI가 JSON으로 정리한다.
  - AI가 쓴 품번은 메일 원문에 실제로 있는 것만 남긴다 (지어내기 방지).
"""
import csv
import io
import json
import re
from collections import Counter
from datetime import datetime

from .textutil import normalize_subject

# ------------------------------------------------------------------ 기본 규칙 (data/config.json 의 case_rules 로 덮어쓰기)

CASE_RULES = {
    # 거래처 이름: [메일에 나오는 표기들]. 대문자 4글자 이하 표기는 대소문자까지 맞아야 인정.
    "dealers": {
        "TMU": ["TMU", "TechMashUnit", "Techmashunit", "ТехМашЮнит"],
        "TSC": ["TSC"],
        "Ferronordic": ["Ferronordic", "Ферронордик"],
        "Polimetall": ["Polimetall", "Polymetal", "Полиметалл"],
        "HCE-CI": ["HCE-CI", "HCECI"],
        "HDHCEI": ["HDHCEI"],
        "PT SMA": ["PT SMA", "PT. SMA"],
        "PT Vale": ["PT Vale", "PT. Vale"],
        "EEC": ["EEC"],
    },
    "dealer_country": {
        "TMU": "러시아", "TSC": "러시아", "Ferronordic": "러시아", "Polimetall": "러시아",
        "HCE-CI": "중국", "HDHCEI": "인도네시아", "PT SMA": "인도네시아", "PT Vale": "인도네시아",
        "EEC": "필리핀",
    },
    # 보낸 사람 메일 도메인 끝 → 국가
    "domain_country": {".ru": "러시아", ".cn": "중국", ".id": "인도네시아", ".ph": "필리핀",
                       ".vn": "베트남", ".kz": "카자흐스탄", ".uz": "우즈베키스탄"},
    # 품번: 4자리-5자리 (예: 31QE-10010, 31Q6-10130). 앞 4자리가 모두 숫자인 것(날짜·전화번호)은 제외.
    "part_no_regex": r"(?<![0-9A-Za-z])(?![0-9]{4}-)[0-9A-Z]{4}-[0-9A-Z]{5}[A-Z]{0,3}(?![0-9A-Za-z])",
    "model_regex": r"(?<![0-9A-Za-z])(?:HX|HL|HW|HR|HD|HSL|HB|HDF|R)\d{2,4}(?:[A-Z]{1,3})?(?:-\d{1,2}[A-Z]{0,2})?(?![0-9A-Za-z])",
    # 분류: 제목에 나오면 3점, 본문에 나오면 1점. 2점 이상인 것 중 상위 2개.
    "categories": {
        "클레임/워런티": ["warranty", "claim", "클레임", "워런티", "보증", "гаранти", "рекламаци", "failure",
                     "defect", "broken", "불량", "고장", "파손", "crack", "leak", "누유", "damage"],
        "견적/가격": ["price", "quotation", "quote", "견적", "가격", "단가", "특가", "지원가", "discount",
                  "цен", "КП", "offer", "报价", "价格"],
        "오더/백오더": ["P/O", "PO", "오더", "발주", "주문", "backorder", "back order", "B/O", "백오더", "заказ"],
        "납기/선적": ["lead time", "납기", "리드타임", "ETD", "ETA", "shipment", "shipping", "선적", "출고",
                  "출하", "отгрузк", "поставк", "delivery", "포워더", "forwarder"],
        "대금/결제": ["payment", "결제", "대금", "송금", "invoice", "인보이스", "채권", "가수금", "통화대체",
                  "оплат", "счет", "remittance", "L/C"],
        "통관/규제": ["customs", "통관", "전략물자", "HS code", "HS코드", "certificate", "인증", "Chestny",
                  "Честный", "EAC", "таможн", "원산지", "C/O", "sanction", "제재"],
        "품번/기술": ["대체품번", "대체 품번", "alternative", "interchangeab", "supersed", "호환", "spec",
                  "사양", "drawing", "도면", "替代"],
        "텐더": ["tender", "텐더", "입찰", "тендер"],
        "재고/STO": ["재고", "stock", "STO", "장기재고", "재고이체"],
    },
    # 결과 상태: 마지막 메일부터 거꾸로 보며 처음 걸리는 것
    "status_words": {
        "승인": ["approved", "approve", "승인", "одобр", "accepted", "批准"],
        "반려": ["rejected", "reject", "declined", "반려", "거절", "불가", "not acceptable", "отклон", "отказ"],
        "선적·출고": ["shipped", "선적 완료", "선적완료", "출고 완료", "출고완료", "dispatched", "отгружен"],
        "완료": ["completed", "완료", "resolved", "해결", "closed", "done", "выполнен"],
        "취소": ["cancel", "취소", "отмен"],
    },
    "action_words": ["검토", "review", "replace", "교체", "발송", "송부", "send", "재발송", "요청", "request",
                     "신청", "apply", "발행", "협의", "조치", "지원", "support", "credit note", "무상",
                     "free of charge", "FOC", "확인 부탁", "please check", "please confirm", "제출"],
}

CATEGORY_LIST = list(CASE_RULES["categories"]) + ["기타"]
STATUS_LIST = ["승인", "반려", "선적·출고", "완료", "취소", "진행 중"]

_SKIP_LINE = re.compile(
    r"(감사합니다|안녕하세요|수고|드림$|best regards|regards,|dear |thank you|thanks|с уважением|"
    r"добрый день|здравствуйте|tel[ .:]|mobile|fax|@|http|www\.|^\s*\[|您好|谢谢)", re.IGNORECASE)


def rules(cfg):
    r = json.loads(json.dumps(CASE_RULES))
    for k, v in (cfg.get("case_rules") or {}).items():
        r[k] = v
    return r


# ------------------------------------------------------------------ 키워드 찾기

def _kw_regex(kw):
    if re.fullmatch(r"[A-Za-z0-9/ .\-]+", kw):
        flags = 0 if (kw.isupper() and len(kw) <= 4) or re.fullmatch(r"[A-Z/]+", kw) else re.IGNORECASE
        return re.compile(r"(?<![A-Za-z])" + re.escape(kw) + r"(?![A-Za-z])", flags)
    return re.compile(re.escape(kw), re.IGNORECASE)


_KW_CACHE = {}


def _has(kw, text):
    rx = _KW_CACHE.get(kw)
    if rx is None:
        rx = _KW_CACHE[kw] = _kw_regex(kw)
    return rx.search(text) is not None


def _count(kw, text):
    rx = _KW_CACHE.get(kw) or _KW_CACHE.setdefault(kw, _kw_regex(kw))
    return len(rx.findall(text))


def _norm_part(p):
    return re.sub(r"[^0-9A-Z]", "", p.upper())


def _sentences(text):
    out = []
    for line in (text or "").split("\n"):
        for s in re.split(r"(?<=[.!?。])\s+", line.strip()):
            s = s.strip(" -•*\t")
            if 8 <= len(s) <= 220 and not _SKIP_LINE.search(s):
                out.append(s)
    return out


# ------------------------------------------------------------------ 규칙 추출

def _thread_messages(conn, tid):
    return conn.execute(
        """SELECT id, subject, sender_name, sender_email, date, body_new, attachments
           FROM messages WHERE thread_id=? AND hidden=0 ORDER BY date""", (tid,)).fetchall()


def extract_rule(conn, tid, cfg, msgs=None):
    R = rules(cfg)
    t = conn.execute("SELECT * FROM threads WHERE id=?", (tid,)).fetchone()
    msgs = msgs if msgs is not None else _thread_messages(conn, tid)
    subject = normalize_subject(t["subject"])
    body = "\n".join(f"{m['subject']}\n{m['body_new']}\n{m['attachments'] or ''}" for m in msgs)
    full = subject + "\n" + body

    dealers = [name for name, aliases in R["dealers"].items() if any(_has(a, full) for a in aliases)]
    countries = [R["dealer_country"][d] for d in dealers if d in R["dealer_country"]]
    for m in msgs:
        em = (m["sender_email"] or "").lower()
        for dom, c in R["domain_country"].items():
            if em.endswith(dom):
                countries.append(c)
    parts = Counter(p.upper() for p in re.findall(R["part_no_regex"], full.upper())
                    if sum(ch.isdigit() for ch in p.split("-", 1)[1]) >= 3)
    models = Counter(re.findall(R["model_regex"], full.upper()))

    scores = {}
    for cat, kws in R["categories"].items():
        s = sum(3 * _count(k, subject) + min(_count(k, body), 3) for k in kws)
        if s >= 2:
            scores[cat] = s
    cats = [c for c, _ in sorted(scores.items(), key=lambda x: -x[1])[:2]] or ["기타"]

    status, result = "진행 중", ""
    for m in reversed(msgs):
        for sent in _sentences(m["body_new"]):
            for st, kws in R["status_words"].items():
                if any(_has(k, sent) for k in kws):
                    status, result = st, sent
                    break
            if result:
                break
        if result:
            break

    actions = []
    for m in msgs[1:] or msgs:
        for sent in _sentences(m["body_new"]):
            if sent != result and any(_has(k, sent) for k in R["action_words"]):
                actions.append(sent)
                break
        if len(actions) >= 2:
            break

    owners = [r[0] for r in conn.execute(
        """SELECT o.owner FROM owners o JOIN messages m ON m.id=o.message_id WHERE m.thread_id=?
           GROUP BY o.owner ORDER BY COUNT(*) DESC""", (tid,))]
    return {
        "thread_id": tid,
        "subject": subject,
        "first_date": t["first_date"],
        "last_date": t["last_date"],
        "msg_count": len(msgs),
        "dealer": ", ".join(dealers),
        "country": ", ".join(dict.fromkeys(countries)),
        "model": ", ".join(m for m, _ in models.most_common(3)),
        "part_no": ", ".join(p for p, _ in parts.most_common(8)),
        "category": ", ".join(cats),
        "status": status,
        "issue": subject,
        "action": " / ".join(actions),
        "result": result,
        "summary": "",
        "owners": ", ".join(owners),
        "method": "규칙",
    }


# ------------------------------------------------------------------ AI 추출

AI_SYSTEM = """너는 건설기계 부품 해외영업팀의 메일 스레드를 '사례 DB' 한 줄로 정리하는 도우미다.
반드시 아래 키를 가진 JSON 객체 하나만 출력한다. 설명 문장은 쓰지 않는다.
{
 "dealer": "거래처 이름 (메일에 나온 표기 그대로, 없으면 빈 문자열)",
 "country": "국가 (한국어, 예: 러시아)",
 "model": "장비 모델 (예: HL775-9S, 없으면 빈 문자열)",
 "part_no": ["메일에 실제로 적힌 품번만, 예: 31Q6-10130"],
 "category": "다음 중 하나: %s",
 "issue": "무슨 문제/요청이었는지 한 문장 (30자 안팎)",
 "action": "우리 쪽이 한 조치를 짧은 명사구로 (예: 워런티 검토, 대체품 무상 공급, 견적 제출)",
 "result": "결과 한 문장. 메일에서 결론이 안 보이면 '메일상 결론 없음'",
 "status": "다음 중 하나: %s",
 "summary": "이 사례를 처음 보는 팀원이 이해하도록 한국어 2~3문장. 누가 무엇을 요청했고, 어느 부서와 어떻게 처리했고, 결과가 어땠는지."
}
규칙: 메일에 없는 사실·품번·수치·날짜를 지어내지 않는다. 품번·금액은 원문 그대로 쓴다.
""" % (", ".join(CATEGORY_LIST), ", ".join(STATUS_LIST))


def _thread_text(msgs, max_chars=8000):
    blocks = [f"[{m['date']} / {m['sender_name']}]\n제목: {m['subject']}\n{(m['body_new'] or '')[:1800]}"
              + (f"\n첨부: {m['attachments'].replace(chr(10), ', ')}" if m["attachments"] else "")
              for m in msgs]
    text = "\n\n".join(blocks)
    if len(text) > max_chars and len(blocks) > 4:
        text = "\n\n".join(blocks[:2] + ["(… 중간 메일 생략 …)"] + blocks[-3:])
    return text[:max_chars]


def _parse_json(s):
    s = (s or "").strip()
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if not m:
        raise ValueError("AI 응답에 JSON이 없습니다")
    return json.loads(m.group(0))


def extract_ai(conn, tid, cfg, rule=None, msgs=None):
    from . import llm
    msgs = msgs if msgs is not None else _thread_messages(conn, tid)
    rule = rule or extract_rule(conn, tid, cfg, msgs)
    text = _thread_text(msgs)
    hint = (f"(참고: 프로그램이 찾은 후보 — 거래처: {rule['dealer'] or '없음'}, 품번: {rule['part_no'] or '없음'}, "
            f"모델: {rule['model'] or '없음'})")
    raw = llm.chat(cfg, [{"role": "system", "content": AI_SYSTEM},
                         {"role": "user", "content": f"{hint}\n\n[메일 스레드]\n{text}"}], json_mode=True)
    d = _parse_json(raw)
    out = dict(rule)

    def s(key, n=300):
        v = d.get(key)
        if isinstance(v, list):
            v = ", ".join(str(x) for x in v)
        return str(v or "").strip()[:n]

    # 품번은 원문에 실제로 있는 것만 (AI가 지어낸 품번 차단)
    have = _norm_part("\n".join(f"{m['subject']} {m['body_new']} {m['attachments'] or ''}" for m in msgs))
    ai_parts = d.get("part_no") or []
    if isinstance(ai_parts, str):
        ai_parts = re.split(r"[,;\s]+", ai_parts)
    ok = [p.strip().upper() for p in ai_parts if p and len(_norm_part(p)) >= 6 and _norm_part(p) in have]
    out["part_no"] = ", ".join(dict.fromkeys(ok + [p for p in rule["part_no"].split(", ") if p]))[:300]
    for k in ("dealer", "country", "model"):
        out[k] = s(k, 120) or rule[k]
    cat = s("category", 40)
    out["category"] = cat if cat in CATEGORY_LIST else rule["category"]
    st = s("status", 20)
    out["status"] = st if st in STATUS_LIST else rule["status"]
    out["issue"] = s("issue") or rule["issue"]
    out["action"] = s("action", 120) or rule["action"]
    out["result"] = s("result") or rule["result"]
    out["summary"] = s("summary", 800)
    out["method"] = "AI"
    return out


# ------------------------------------------------------------------ 저장 / 일괄 생성

FIELDS = ["thread_id", "subject", "first_date", "last_date", "msg_count", "dealer", "country", "model",
          "part_no", "category", "status", "issue", "action", "result", "summary", "owners", "method"]


def save(conn, c):
    c = dict(c)
    c["updated"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    cols = FIELDS + ["updated"]
    conn.execute(
        f"INSERT OR REPLACE INTO cases({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
        [c.get(k, "") for k in cols])


def build(conn, cfg, tids=None, use_ai=False, limit=None, rebuild=False, progress=None, log=print):
    """사례 DB 만들기. use_ai=False 면 규칙만 (수만 건도 몇십 초)."""
    if tids is None:
        tids = [r[0] for r in conn.execute("SELECT id FROM threads WHERE hidden=0 ORDER BY last_date DESC")]
    stat = {"total": len(tids), "done": 0, "ai": 0, "ai_skipped": 0, "ai_failed": 0, "last_error": ""}
    fails_in_row = 0
    for tid in tids:
        msgs = _thread_messages(conn, tid)
        if not msgs:
            conn.execute("DELETE FROM cases WHERE thread_id=?", (tid,))
            continue
        prev = conn.execute("SELECT method, msg_count FROM cases WHERE thread_id=?", (tid,)).fetchone()
        if prev and prev["method"] == "AI" and prev["msg_count"] == len(msgs) and not rebuild:
            stat["ai_skipped"] += 1
            stat["done"] += 1
            continue  # 이미 AI로 정리했고 그 뒤로 새 메일 없음
        case = extract_rule(conn, tid, cfg, msgs)
        if prev and prev["method"] == "AI" and not use_ai and not rebuild:
            stat["done"] += 1
            continue  # 규칙으로 덮어써서 AI 결과를 잃지 않게 (새 메일이 붙은 건 다음 AI 정리 때 갱신)
        if use_ai and (limit is None or stat["ai"] + stat["ai_failed"] < limit):
            try:
                case = extract_ai(conn, tid, cfg, case, msgs)
                stat["ai"] += 1
                fails_in_row = 0
            except Exception as e:
                stat["ai_failed"] += 1
                stat["last_error"] = str(e)[:300]
                fails_in_row += 1
                if fails_in_row >= 3:
                    save(conn, case)
                    conn.commit()
                    raise RuntimeError(f"사내 AI 호출이 연속 3번 실패해서 멈췄습니다: {e}") from e
        save(conn, case)
        stat["done"] += 1
        if stat["done"] % 200 == 0 or use_ai:
            conn.commit()
            if progress:
                progress(stat)
            elif stat["done"] % 200 == 0:
                log(f"  … {stat['done']}/{stat['total']}")
    conn.commit()
    if progress:
        progress(stat)
    return stat


# ------------------------------------------------------------------ 조회 / 요약

def _where(f):
    sql, args = ["t.hidden=0"], []
    for key in ("dealer", "country", "category", "model", "part_no"):
        v = (f.get(key) or "").strip()
        if v:
            if key == "part_no":
                sql.append("REPLACE(c.part_no,'-','') LIKE ?")
                args.append(f"%{_norm_part(v)}%")
            else:
                sql.append(f"c.{key} LIKE ?")
                args.append(f"%{v}%")
    if f.get("status"):
        sql.append("c.status = ?")
        args.append(f["status"])
    if f.get("method"):
        sql.append("c.method = ?")
        args.append(f["method"])
    if f.get("from"):
        sql.append("c.last_date >= ?")
        args.append(f["from"])
    if f.get("to"):
        sql.append("c.first_date <= ?")
        args.append(f["to"] + " 23:59")
    for w in (f.get("q") or "").split():
        sql.append("(c.subject || ' ' || c.issue || ' ' || c.action || ' ' || c.result || ' ' || c.summary "
                   "|| ' ' || c.part_no || ' ' || c.dealer || ' ' || c.model) LIKE ?")
        args.append(f"%{w}%")
    if f.get("owner"):
        sql.append("c.owners LIKE ?")
        args.append(f"%{f['owner']}%")
    return " AND ".join(sql), args


def query(conn, f, limit=100, offset=0):
    where, args = _where(f)
    base = f"FROM cases c JOIN threads t ON t.id=c.thread_id WHERE {where}"
    total = conn.execute(f"SELECT COUNT(*) {base}", args).fetchone()[0]
    rows = [dict(r) for r in conn.execute(
        f"SELECT c.* {base} ORDER BY c.last_date DESC LIMIT ? OFFSET ?", args + [limit, offset])]
    allrows = [dict(r) for r in conn.execute(f"SELECT c.* {base} ORDER BY c.last_date DESC LIMIT 5000", args)]
    return {"total": total, "cases": rows, "summary": summarize(allrows)}


def summarize(rows):
    """'총 7건 / 주요 품번 / 공통 조치 / 결과 / 최근 사례' 요약."""
    def top(key, n=5, split=True, only_ai=False):
        c = Counter()
        for r in rows:
            if only_ai and r.get("method") != "AI":
                continue
            vals = [v.strip() for v in (r.get(key) or "").split(",")] if split else [(r.get(key) or "").strip()]
            c.update(v for v in vals if v)
        return [{"value": k, "count": v} for k, v in c.most_common(n)]

    return {
        "total": len(rows),
        "part_no": top("part_no"),
        "model": top("model", 3),
        "dealer": top("dealer", 3),
        "category": top("category", 4),
        "status": top("status", 6, split=False),
        "action": top("action", 4, split=False, only_ai=True),
        "recent": [{"thread_id": r["thread_id"], "date": (r["last_date"] or "")[:10], "subject": r["subject"],
                    "status": r["status"]} for r in sorted(rows, key=lambda r: r["last_date"] or "", reverse=True)[:3]],
        "ai_count": sum(1 for r in rows if r.get("method") == "AI"),
    }


def summary_for_threads(conn, tids):
    if not tids:
        return summarize([])
    rows = []
    for i in range(0, len(tids), 500):
        chunk = tids[i:i + 500]
        rows += [dict(r) for r in conn.execute(
            f"SELECT * FROM cases WHERE thread_id IN ({','.join('?' * len(chunk))})", chunk)]
    return summarize(rows)


def facets(conn):
    out = {}
    for key in ("dealer", "country", "category"):
        c = Counter()
        for (v,) in conn.execute(f"SELECT {key} FROM cases"):
            c.update(x.strip() for x in (v or "").split(",") if x.strip())
        out[key] = [k for k, _ in c.most_common(60)]
    out["status"] = STATUS_LIST
    out["counts"] = {
        "cases": conn.execute("SELECT COUNT(*) FROM cases").fetchone()[0],
        "ai": conn.execute("SELECT COUNT(*) FROM cases WHERE method='AI'").fetchone()[0],
        "threads": conn.execute("SELECT COUNT(*) FROM threads WHERE hidden=0").fetchone()[0],
    }
    return out


def export(conn, fmt, f=None):
    where, args = _where(f or {})
    rows = [dict(r) for r in conn.execute(
        f"SELECT c.* FROM cases c JOIN threads t ON t.id=c.thread_id WHERE {where} ORDER BY c.last_date DESC", args)]
    if fmt == "jsonl":
        return "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    buf = io.StringIO()
    heads = {"thread_id": "사례번호", "first_date": "시작일", "last_date": "최근일", "dealer": "거래처",
             "country": "국가", "model": "모델", "part_no": "품번", "category": "분류", "status": "결과상태",
             "issue": "이슈", "action": "조치", "result": "결과", "summary": "요약", "subject": "메일 제목",
             "msg_count": "메일수", "owners": "메일함", "method": "정리방식"}
    order = ["thread_id", "first_date", "last_date", "dealer", "country", "model", "part_no", "category",
             "status", "issue", "action", "result", "summary", "subject", "msg_count", "owners", "method"]
    w = csv.writer(buf)
    w.writerow([heads[k] for k in order])
    for r in rows:
        w.writerow([r.get(k, "") for k in order])
    return "﻿" + buf.getvalue()  # 엑셀에서 한글 안 깨지게
