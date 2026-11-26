"""python -m unittest discover -s tests   (team-mail-brain 폴더에서 실행)"""
import base64
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.request
from email.message import EmailMessage

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mailbrain import ingest, search  # noqa: E402
from mailbrain.db import DEFAULT_CONFIG, connect  # noqa: E402
from mailbrain.textutil import normalize_subject, query_groups, strip_quoted, tokens  # noqa: E402

CFG = json.loads(json.dumps(DEFAULT_CONFIG))


def eml(path, subject, frm, to, date, body, mid=None, attach=None):
    m = EmailMessage()
    m["Subject"], m["From"], m["To"], m["Date"] = subject, frm, to, date
    if mid:
        m["Message-ID"] = mid
    m.set_content(body)
    if attach:
        m.add_attachment(b"x", maintype="application", subtype="pdf", filename=attach)
    with open(path, "wb") as f:
        f.write(m.as_bytes())


OIL_1 = """황용님 안녕하세요.

러시아 TSC향 엔진오일(HD-OIL 15W40) 수출 건 관련하여 전략물자관리원에 비해당 판정을 신청했습니다.
Yes-Trade에서 MSDS와 제품 사양서를 첨부해 접수했고, 판정까지 약 2주 걸린다고 합니다.

감사합니다. 이진영 드림.
"""
OIL_2 = """판정서 수령했습니다. 비해당으로 나와서 선적 진행 가능합니다.
품번 31QE-10010 동봉 출하 예정입니다.

-----Original Message-----
From: 이진영
Sent: Monday, March 3, 2026 10:00 AM
To: 황용
Subject: 러시아 오일 수출 전략물자 판정

러시아 TSC향 엔진오일 수출 건 관련하여 ...
"""


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.conn = connect(os.path.join(self.tmp, "brain.db"))
        a = os.path.join(self.tmp, "lee")
        b = os.path.join(self.tmp, "park")
        os.makedirs(a)
        os.makedirs(b)
        eml(f"{a}/1.eml", "러시아 오일 수출 전략물자 판정", "이진영 <jy@hd.com>", "황용 <hy@hce.cn>",
            "Mon, 03 Mar 2026 10:00:00 +0900", OIL_1, "<oil-1@hd.com>")
        eml(f"{a}/2.eml", "RE: 러시아 오일 수출 전략물자 판정", "이진영 <jy@hd.com>", "황용 <hy@hce.cn>",
            "Tue, 17 Mar 2026 15:00:00 +0900", OIL_2, "<oil-2@hd.com>", attach="판정서_비해당.pdf")
        # 같은 메일이 박지환 메일함에도 (참조로 받음)
        eml(f"{b}/1.eml", "러시아 오일 수출 전략물자 판정", "이진영 <jy@hd.com>", "황용 <hy@hce.cn>",
            "Mon, 03 Mar 2026 10:00:00 +0900", OIL_1, "<oil-1@hd.com>")
        eml(f"{b}/2.eml", "FW: Chestny Znak маркировка", "Ryzhov <r@tsc.ru>", "박지환 <pj@hd.com>",
            "Wed, 05 Feb 2026 09:00:00 +0300",
            "Добрый день, по маркировке Честный знак для масла нужны коды. Please advise label format.",
            "<cz@tsc.ru>")
        eml(f"{b}/3.eml", "印尼 替代品号 询问", "Angga <a@hdhcei.id>", "박지환 <pj@hd.com>",
            "Wed, 05 Nov 2025 09:00:00 +0700", "请确认替代品号 11QE-00101 的库存和交期。", "<id-1@x>")
        os.makedirs(f"{b}/Deleted Items")
        eml(f"{b}/Deleted Items/x.eml", "러시아 오일 개인", "x <x@x.com>", "y <y@y.com>",
            "Wed, 05 Nov 2025 09:00:00 +0700", "지운 편지함 메일", "<del@x>")
        self.r1 = ingest.ingest_path(self.conn, a, "이진영", CFG, log=lambda *_: None)
        self.r2 = ingest.ingest_path(self.conn, b, "박지환", CFG, log=lambda *_: None)

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)


class TextTests(unittest.TestCase):
    def test_korean_bigram_partial_match(self):
        self.assertTrue(set(tokens("전략물자")) <= set(tokens("전략물자관리원에")))

    def test_part_number(self):
        t = tokens("31QE-10010 동봉")
        self.assertIn("31qe10010", t)
        self.assertIn("10010", t)

    def test_subject(self):
        self.assertEqual(normalize_subject("RE: FW: 회신: 答复: Ответ: 견적 요청"), "견적 요청")
        self.assertEqual(normalize_subject("RE[2]: Quote"), "Quote")

    def test_strip_quoted(self):
        new = strip_quoted(OIL_2)
        self.assertIn("판정서 수령", new)
        self.assertNotIn("Original Message", new)

    def test_strip_korean_outlook_header(self):
        body = "확인했습니다. 다음 주 출하 예정이며 서류는 따로 보내드리겠습니다.\n\n보낸 사람: 황용\n보낸 날짜: 2026년 3월 3일\n받는 사람: 이진영\n\n이전 내용"
        self.assertNotIn("이전 내용", strip_quoted(body))

    def test_query_groups(self):
        g = query_groups("러시아에 오일 팔려고 하는데 전략물자 판정 유사사례 있어?", CFG["synonyms"])
        heads = [x[0] for x in g]
        self.assertIn("러시아", heads)
        self.assertIn("오일", heads)
        self.assertIn("전략물자", heads)
        self.assertNotIn("유사사례", heads)
        self.assertNotIn("있어", heads)


class IngestTests(Base):
    def test_dedupe_and_owners(self):
        self.assertEqual(self.r1["added"], 2)
        self.assertEqual(self.r2["merged"], 1)  # 같은 메일은 합침
        self.assertEqual(self.r2["skipped"], 1)  # 지운 편지함
        n = self.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        self.assertEqual(n, 4)

    def test_thread_grouping(self):
        t = self.conn.execute("SELECT * FROM threads WHERE subject='러시아 오일 수출 전략물자 판정'").fetchone()
        self.assertEqual(t["msg_count"], 2)

    def test_reingest_is_idempotent(self):
        r = ingest.ingest_path(self.conn, os.path.join(self.tmp, "lee"), "이진영", CFG, log=lambda *_: None)
        self.assertEqual(r["added"], 0)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 4)

    def test_remove_owner_keeps_shared(self):
        ingest.remove_owner(self.conn, "박지환")
        n = self.conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        self.assertEqual(n, 2)  # 이진영 메일함 것은 남음

    def test_jsonl(self):
        p = os.path.join(self.tmp, "x.jsonl")
        with open(p, "w", encoding="utf-8") as f:
            f.write(json.dumps({"message_id": "j1", "subject": "PT Vale 텐더 서류", "sender_name": "강필성",
                                "date": "2026-01-10T09:00:00+09:00", "folder": "받은 편지함",
                                "body": "원산지증명 서류 준비 필요합니다", "attachments": "CO.pdf\nPL.xlsx"},
                               ensure_ascii=False) + "\n")
        ingest.ingest_path(self.conn, p, "강필성", CFG, log=lambda *_: None)
        r = search.search(self.conn, "텐더 원산지증명", CFG)
        self.assertEqual(r["threads"][0]["subject"], "PT Vale 텐더 서류")
        self.assertIn("CO.pdf", r["threads"][0]["attachments"])


class SearchTests(Base):
    def test_natural_question(self):
        r = search.search(self.conn, "러시아에 오일 팔려고 하는데 전략물자 판정 받은 유사사례 있어?", CFG)
        top = r["threads"][0]
        self.assertEqual(top["subject"], "러시아 오일 수출 전략물자 판정")
        self.assertEqual(set(top["owners"]), {"이진영", "박지환"})
        self.assertEqual(r["experts"][0]["owner"], "이진영")
        self.assertIn("전략물자", top["snippet"])

    def test_russian_and_synonym(self):
        r = search.search(self.conn, "Честный знак", CFG)
        self.assertIn("Chestny", r["threads"][0]["subject"])
        r = search.search(self.conn, "러시아 오일 라벨", CFG)  # 오일 → масло 동의어
        self.assertTrue(any("Chestny" in t["subject"] for t in r["threads"]))

    def test_chinese_and_part_no(self):
        r = search.search(self.conn, "替代品号", CFG)
        self.assertIn("印尼", r["threads"][0]["subject"])
        r = search.search(self.conn, "11QE-00101", CFG)
        self.assertIn("印尼", r["threads"][0]["subject"])
        r = search.search(self.conn, "31QE-10010", CFG)
        self.assertIn("전략물자", r["threads"][0]["subject"])

    def test_owner_filter_and_hide(self):
        r = search.search(self.conn, "오일", CFG, owner="박지환")
        self.assertTrue(all("박지환" in t["owners"] for t in r["threads"]))
        tid = r["threads"][0]["id"]
        self.conn.execute("UPDATE threads SET hidden=1 WHERE id=?", (tid,))
        r2 = search.search(self.conn, "오일", CFG, owner="박지환")
        self.assertNotIn(tid, [t["id"] for t in r2["threads"]])

    def test_cards_first(self):
        search.save_card(self.conn, {"title": "러시아향 오일 전략물자 비해당 판정 받는 법", "tags": "러시아,오일",
                                     "body": "Yes-Trade 신청, MSDS 첨부, 약 2주", "author": "이진영"}, "2026-11-26")
        r = search.search(self.conn, "오일 전략물자 어떻게 해?", CFG)
        self.assertEqual(len(r["cards"]), 1)

    def test_empty_query_recent(self):
        r = search.search(self.conn, "", CFG)
        self.assertEqual(r["threads"][0]["subject"], "러시아 오일 수출 전략물자 판정")


class ServerTests(Base):
    def test_http(self):
        from mailbrain.server import serve
        httpd = serve(os.path.join(self.tmp, "brain.db"), CFG, self.tmp, "127.0.0.1", 0, password="pw")
        port = httpd.server_address[1]
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        auth = {"Authorization": "Basic " + base64.b64encode(b"u:pw").decode()}
        try:
            with self.assertRaises(urllib.error.HTTPError):
                opener.open(f"http://127.0.0.1:{port}/api/stats")
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/search?q=" +
                                         urllib.parse.quote("전략물자"), headers=auth)
            r = json.loads(opener.open(req).read())
            self.assertGreater(len(r["threads"]), 0)
            tid = r["threads"][0]["id"]
            t = json.loads(opener.open(urllib.request.Request(f"http://127.0.0.1:{port}/api/thread/{tid}",
                                                              headers=auth)).read())
            self.assertEqual(len(t["messages"]), 2)
            html = opener.open(urllib.request.Request(f"http://127.0.0.1:{port}/", headers=auth)).read()
            self.assertIn("AM영업팀 브레인".encode(), html)
        finally:
            httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
