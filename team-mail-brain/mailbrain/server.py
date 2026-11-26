"""팀 공용 웹 화면 (표준 라이브러리만 사용)."""
import base64
import hmac
import json
import os
import queue
import re
import threading
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

from . import ingest, llm, search
from .db import ConnPool, connect

STATIC = os.path.join(os.path.dirname(__file__), "static")


class Jobs:
    """적재 작업은 한 번에 하나씩 (SQLite 쓰기 충돌 방지)."""

    def __init__(self, db_path, cfg, keep_uploads):
        self.q = queue.Queue()
        self.items = []
        self.lock = threading.Lock()
        self.db_path, self.cfg, self.keep = db_path, cfg, keep_uploads
        threading.Thread(target=self._run, daemon=True).start()

    def add(self, path, owner, since):
        job = {"id": len(self.items) + 1, "file": os.path.basename(path), "owner": owner, "since": since,
               "status": "대기", "seen": 0, "added": 0, "merged": 0, "skipped": 0, "dup": 0, "error": None,
               "queued": datetime.now().strftime("%H:%M:%S")}
        with self.lock:
            self.items.append(job)
        self.q.put((job, path))
        return job

    def list(self):
        with self.lock:
            return [dict(j) for j in self.items[-30:]][::-1]

    def _run(self):
        conn = connect(self.db_path)
        while True:
            job, path = self.q.get()
            job["status"] = "처리 중"

            def progress(_fp, c, job=job):
                job.update({k: c[k] for k in ("seen", "added", "merged", "skipped", "dup")})

            try:
                since = datetime.strptime(job["since"], "%Y-%m-%d") if job["since"] else None
                ingest.ingest_file(conn, path, job["owner"], self.cfg, since, log=lambda *_: None,
                                   progress=progress)
                job["status"] = "완료"
                if not self.keep:
                    try:
                        os.remove(path)  # 원본 PST는 남기지 않는다 (DB에 필요한 것만 남음)
                    except OSError:
                        pass
            except Exception as e:
                job["status"], job["error"] = "오류", str(e)[:500]


def make_handler(pool, cfg, jobs, upload_dir, password):
    class H(BaseHTTPRequestHandler):
        server_version = "MailBrain/1.0"

        def log_message(self, fmt, *args):  # 조용히
            pass

        # ------------------------------------------------ 공통
        def _auth(self):
            if not password:
                return True
            h = self.headers.get("Authorization", "")
            if h.startswith("Basic "):
                try:
                    _u, _, p = base64.b64decode(h[6:]).decode("utf-8").partition(":")
                    if hmac.compare_digest(p, password):
                        return True
                except Exception:
                    pass
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="team-brain", charset="UTF-8"')
            self.end_headers()
            return False

        def _json(self, obj, code=200):
            data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n).decode("utf-8")) if n else {}

        def _route(self, method):
            if not self._auth():
                return
            u = urlparse(self.path)
            qs = {k: v[0] for k, v in parse_qs(u.query).items()}
            conn = pool.get()
            try:
                if method == "GET" and u.path in ("/", "/index.html"):
                    with open(os.path.join(STATIC, "index.html"), "rb") as f:
                        data = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                elif method == "GET" and u.path == "/api/search":
                    self._json(search.search(conn, qs.get("q", ""), cfg, qs.get("owner") or None,
                                             qs.get("from") or None, qs.get("to") or None,
                                             int(qs.get("limit", 20)), int(qs.get("offset", 0))))
                elif method == "POST" and u.path == "/api/ask":
                    b = self._body()
                    res = search.search(conn, b.get("q", ""), cfg, b.get("owner") or None)
                    try:
                        res["answer"] = llm.ask(conn, cfg, b.get("q", ""), res)
                    except llm.LLMError as e:
                        res["answer_error"] = str(e)
                    self._json(res)
                elif method == "GET" and (m := re.fullmatch(r"/api/thread/(\d+)", u.path)):
                    t = search.get_thread(conn, int(m.group(1)))
                    self._json(t or {"error": "없음"}, 200 if t else 404)
                elif method == "POST" and u.path == "/api/hide":
                    b = self._body()
                    if b.get("thread_id"):
                        conn.execute("UPDATE threads SET hidden=1 WHERE id=?", (int(b["thread_id"]),))
                    if b.get("message_id"):
                        conn.execute("UPDATE messages SET hidden=1 WHERE id=?", (int(b["message_id"]),))
                    conn.commit()
                    self._json({"ok": True})
                elif method == "GET" and u.path == "/api/cards":
                    self._json(search.list_cards(conn))
                elif method == "POST" and u.path == "/api/cards":
                    try:
                        cid = search.save_card(conn, self._body(), datetime.now().strftime("%Y-%m-%d %H:%M"))
                        self._json({"id": cid})
                    except ValueError as e:
                        self._json({"error": str(e)}, 400)
                elif method == "DELETE" and (m := re.fullmatch(r"/api/cards/(\d+)", u.path)):
                    search.delete_card(conn, int(m.group(1)))
                    self._json({"ok": True})
                elif method == "GET" and u.path == "/api/stats":
                    s = search.stats(conn)
                    s["llm"] = bool((cfg.get("llm") or {}).get("enabled"))
                    self._json(s)
                elif method == "GET" and u.path == "/api/jobs":
                    self._json(jobs.list())
                elif method == "PUT" and u.path == "/api/upload":
                    self._upload()
                else:
                    self._json({"error": "not found"}, 404)
            except Exception as e:
                traceback.print_exc()
                self._json({"error": f"{type(e).__name__}: {e}"}, 500)

        def _upload(self):
            owner = unquote(self.headers.get("X-Owner", "")).strip()
            name = os.path.basename(unquote(self.headers.get("X-Filename", "")).replace("\\", "/"))
            since = unquote(self.headers.get("X-Since", "")).strip()
            if not owner or not name:
                return self._json({"error": "이름과 파일이 필요합니다"}, 400)
            if not name.lower().endswith((".pst", ".ost", ".jsonl", ".mbox", ".eml", ".msg")):
                return self._json({"error": "PST / OST / JSONL / MBOX / EML / MSG 파일만 올릴 수 있습니다"}, 400)
            if since and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", since):
                return self._json({"error": "기간 형식은 YYYY-MM-DD"}, 400)
            safe_owner = re.sub(r"[^\w가-힣.-]", "_", owner)
            d = os.path.join(upload_dir, safe_owner)
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, f"{int(time.time())}_{re.sub(r'[^\w가-힣.() -]', '_', name)}")
            remaining = int(self.headers.get("Content-Length") or 0)
            with open(path, "wb") as f:
                while remaining > 0:
                    chunk = self.rfile.read(min(1 << 20, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
            if remaining:
                os.remove(path)
                return self._json({"error": "업로드가 중간에 끊겼습니다"}, 400)
            self._json(jobs.add(path, owner, since))

        def do_GET(self):
            self._route("GET")

        def do_POST(self):
            self._route("POST")

        def do_PUT(self):
            self._route("PUT")

        def do_DELETE(self):
            self._route("DELETE")

    return H


def serve(db_path, cfg, data_dir, host="127.0.0.1", port=8765, password=None, keep_uploads=False):
    pool = ConnPool(db_path)
    upload_dir = os.path.join(data_dir, "uploads")
    jobs = Jobs(db_path, cfg, keep_uploads)
    httpd = ThreadingHTTPServer((host, port), make_handler(pool, cfg, jobs, upload_dir, password))
    return httpd
