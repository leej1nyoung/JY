"""SQLite 저장소. 파일 하나(brain.db)에 모든 것이 들어간다."""
import json
import os
import sqlite3
import threading

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY,
  subject_key TEXT UNIQUE,
  subject TEXT,
  first_date TEXT,
  last_date TEXT,
  msg_count INTEGER DEFAULT 0,
  participants TEXT DEFAULT '',
  hidden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  msg_key TEXT UNIQUE,
  thread_id INTEGER REFERENCES threads(id),
  subject TEXT,
  sender_name TEXT,
  sender_email TEXT,
  to_text TEXT,
  cc_text TEXT,
  date TEXT,
  folder TEXT,
  body TEXT,
  body_new TEXT,
  attachments TEXT,
  hidden INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS ix_messages_date ON messages(date);

-- 같은 메일이 여러 사람 메일함에 있을 수 있다
CREATE TABLE IF NOT EXISTS owners (
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  owner TEXT,
  source TEXT,
  PRIMARY KEY (message_id, owner)
);
CREATE INDEX IF NOT EXISTS ix_owners_owner ON owners(owner);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subj, body, tokenize = 'unicode61 remove_diacritics 2'
);

-- 노하우 카드: 사람이 직접 정리한 사례 (가장 먼저 검색된다)
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER,
  title TEXT,
  body TEXT,
  tags TEXT,
  author TEXT,
  created TEXT,
  updated TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
  title, body, tokenize = 'unicode61 remove_diacritics 2'
);

-- 사례 DB: 스레드 하나 = 사례 하나 (규칙 또는 사내 AI가 자동 정리)
CREATE TABLE IF NOT EXISTS cases (
  thread_id INTEGER PRIMARY KEY REFERENCES threads(id) ON DELETE CASCADE,
  subject TEXT, first_date TEXT, last_date TEXT, msg_count INTEGER,
  dealer TEXT, country TEXT, model TEXT, part_no TEXT, category TEXT, status TEXT,
  issue TEXT, action TEXT, result TEXT, summary TEXT, owners TEXT, method TEXT, updated TEXT
);
CREATE INDEX IF NOT EXISTS ix_cases_last ON cases(last_date);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  path TEXT,
  owner TEXT,
  started TEXT,
  finished TEXT,
  seen INTEGER DEFAULT 0,
  added INTEGER DEFAULT 0,
  merged INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  status TEXT,
  error TEXT
);
"""

DEFAULT_CONFIG = {
    # 가져오지 않을 폴더 (이름에 아래 글자가 들어가면 제외)
    "exclude_folders": [
        "Deleted Items", "지운 편지함", "삭제된 항목", "Junk", "정크", "스팸", "Spam",
        "Drafts", "임시 보관함", "Outbox", "보낼 편지함", "Calendar", "일정", "Contacts",
        "연락처", "Tasks", "작업", "Notes", "메모", "RSS", "Conversation History", "대화 기록",
        "Sync Issues", "동기화 문제",
    ],
    # 제목에 아래 글자가 들어간 메일은 가져오지 않음 (개인·공지성 메일 거르기)
    "exclude_subject_keywords": [
        "[광고]", "(광고)", "급여명세", "연말정산", "건강검진", "개인정보",
        "비밀번호", "password", "unsubscribe", "뉴스레터", "newsletter",
    ],
    # 이 주소/도메인에서 온 메일은 가져오지 않음 (사내 공지 시스템 등)
    "exclude_senders": ["noreply", "no-reply", "donotreply", "mailer-daemon"],
    # 같은 뜻의 말 묶음. 검색할 때 서로 함께 찾아 준다.
    "synonyms": [
        ["전략물자", "전략물자관리원", "KOSTI", "비해당", "해당판정", "export control", "yestrade", "옐로우북"],
        ["러시아", "Russia", "РФ", "Россия", "R향"],
        ["백오더", "B/O", "backorder", "back order"],
        ["인코텀즈", "Incoterms", "FOB", "CIF", "CFR", "DAP", "EXW", "FCA"],
        ["통관", "customs", "таможня", "세관"],
        ["오일", "윤활유", "oil", "lubricant", "масло"],
        ["텐더", "tender", "입찰", "тендер"],
        ["견적", "quotation", "quote", "offer", "RFQ", "报价"],
        ["리드타임", "lead time", "L/T", "납기"],
        ["채권", "미수금", "receivable", "가수금"],
    ],
    # 사내 LLM 연결 (선택). 반드시 사내망/로컬 주소만 넣을 것.
    "llm": {
        "enabled": False,
        "kind": "ollama",            # "ollama" 또는 "openai" (OpenAI 호환 사내 게이트웨이)
        "url": "http://127.0.0.1:11434",
        "model": "qwen2.5:14b",
        "api_key_env": "MAILBRAIN_LLM_KEY",
        "timeout": 120,
        "api_version": "2024-10-21",   # kind 가 "azure" 일 때만
    },
    # 사례 DB 자동 분류 규칙 (거래처 표기·국가·분류 키워드 등). 비워 두면 기본값 사용.
    # 바꾸고 싶은 항목만 넣으면 된다. 예: {"dealers": {"TMU": ["TMU", "TechMashUnit"], ...}}
    "case_rules": {},
    "max_body_chars": 20000,
}


def load_config(data_dir):
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    path = os.path.join(data_dir, "config.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8-sig") as f:
            user = json.load(f)
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    else:
        os.makedirs(data_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=2)
    return cfg


def connect(db_path):
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=60, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        conn.executescript(SCHEMA)
    except sqlite3.OperationalError as e:
        if "fts5" in str(e).lower():
            raise RuntimeError("이 Python의 SQLite에 전문검색(FTS5) 기능이 없습니다. "
                               "python.org 에서 받은 Python 3.10 이상을 써 주세요.") from e
        raise
    return conn


class ConnPool:
    """스레드마다 연결 하나 (웹 서버용)."""

    def __init__(self, db_path):
        self.db_path = db_path
        self.local = threading.local()
        connect(db_path).close()

    def get(self):
        c = getattr(self.local, "conn", None)
        if c is None:
            c = connect(self.db_path)
            self.local.conn = c
        return c
