"""메일 원본 읽기. 모든 리더는 같은 모양의 dict 를 차례로 내보낸다.

{
  "message_id": str, "subject": str, "sender_name": str, "sender_email": str,
  "to": str, "cc": str, "date": datetime|None, "folder": str,
  "body": str (평문), "html": str, "attachments": [파일명, ...],
}

지원 형식
- .pst / .ost : pypff(libpff-python) 우선, 없으면 Windows Outlook(pywin32) 사용 (.pst만)
- .msg        : extract-msg 패키지 필요 (선택)
- .eml        : 표준 라이브러리
- .mbox       : 표준 라이브러리
- .jsonl      : scripts/export_outlook.ps1 로 내보낸 파일 (Python 없는 PC용)
- 폴더         : 안의 위 형식 파일을 모두
"""
import email
import email.policy
import json
import mailbox
import os
from datetime import datetime, timezone, timedelta
from email.utils import getaddresses, parseaddr, parsedate_to_datetime

from .textutil import html_to_text

SUPPORTED = (".pst", ".ost", ".msg", ".eml", ".mbox", ".jsonl")


class ReaderError(Exception):
    pass


def iter_files(path):
    if os.path.isdir(path):
        for root, _dirs, files in os.walk(path):
            for f in sorted(files):
                if f.lower().endswith(SUPPORTED):
                    yield os.path.join(root, f)
    else:
        yield path


def read_any(path, log=print):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".pst", ".ost"):
        return read_pst(path, log)
    if ext == ".eml":
        return read_eml_file(path)
    if ext == ".msg":
        return read_msg_file(path)
    if ext == ".mbox":
        return read_mbox(path)
    if ext == ".jsonl":
        return read_jsonl(path)
    raise ReaderError(f"지원하지 않는 형식입니다: {path}")


# ------------------------------------------------------------------ 공통

def _parse_date(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    s = str(v).strip()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        pass
    try:
        return parsedate_to_datetime(s)
    except Exception:
        return None


def _decode(b):
    if b is None:
        return ""
    if isinstance(b, str):
        return b
    for enc in ("utf-8", "cp949", "gb18030", "cp1251", "latin-1"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("utf-8", "replace")


def _addr_text(value):
    pairs = getaddresses([value or ""])
    return "; ".join(n or a for n, a in pairs if n or a)


def _from_email_message(msg, folder=""):
    body, html_body, atts = "", "", []
    for part in msg.walk() if msg.is_multipart() else [msg]:
        if part.is_multipart():
            continue
        fn = part.get_filename()
        disp = (part.get("Content-Disposition") or "").lower()
        ctype = part.get_content_type()
        if fn or "attachment" in disp:
            if fn:
                atts.append(str(fn))
            continue
        try:
            payload = part.get_content()
        except Exception:
            payload = _decode(part.get_payload(decode=True))
        if isinstance(payload, bytes):
            payload = _decode(payload)
        if ctype == "text/plain" and not body:
            body = payload
        elif ctype == "text/html" and not html_body:
            html_body = payload
    name, addr = parseaddr(str(msg.get("From", "")))
    return {
        "message_id": str(msg.get("Message-ID", "") or "").strip(),
        "subject": str(msg.get("Subject", "") or ""),
        "sender_name": name or addr,
        "sender_email": addr.lower(),
        "to": _addr_text(str(msg.get("To", "") or "")),
        "cc": _addr_text(str(msg.get("Cc", "") or "")),
        "date": _parse_date(msg.get("Date")),
        "folder": folder,
        "body": body,
        "html": html_body,
        "attachments": atts,
    }


def read_eml_file(path):
    with open(path, "rb") as f:
        msg = email.message_from_binary_file(f, policy=email.policy.default)
    yield _from_email_message(msg, folder=os.path.basename(os.path.dirname(path)))


def read_mbox(path):
    box = mailbox.mbox(path, factory=lambda f: email.message_from_binary_file(f, policy=email.policy.default))
    for msg in box:
        yield _from_email_message(msg, folder=os.path.basename(path))


def read_jsonl(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            atts = d.get("attachments") or []
            if isinstance(atts, str):
                atts = [a for a in atts.split("\n") if a]
            yield {
                "message_id": d.get("message_id") or "",
                "subject": d.get("subject") or "",
                "sender_name": d.get("sender_name") or "",
                "sender_email": (d.get("sender_email") or "").lower(),
                "to": d.get("to") or "",
                "cc": d.get("cc") or "",
                "date": _parse_date(d.get("date")),
                "folder": d.get("folder") or "",
                "body": d.get("body") or "",
                "html": d.get("html") or "",
                "attachments": atts,
            }


def read_msg_file(path):
    try:
        import extract_msg
    except ImportError as e:
        raise ReaderError(".msg 파일을 읽으려면 'pip install extract-msg' 가 필요합니다.") from e
    m = extract_msg.Message(path)
    try:
        yield {
            "message_id": (m.messageId or "") if hasattr(m, "messageId") else "",
            "subject": m.subject or "",
            "sender_name": parseaddr(m.sender or "")[0] or (m.sender or ""),
            "sender_email": parseaddr(m.sender or "")[1].lower(),
            "to": m.to or "",
            "cc": m.cc or "",
            "date": _parse_date(m.date),
            "folder": os.path.basename(os.path.dirname(path)),
            "body": m.body or "",
            "html": "",
            "attachments": [getattr(a, "longFilename", None) or getattr(a, "shortFilename", "") or "" for a in m.attachments],
        }
    finally:
        m.close()


# ------------------------------------------------------------------ PST / OST

def read_pst(path, log=print):
    try:
        import pypff  # noqa: F401
        return _read_pst_pypff(path)
    except ImportError:
        pass
    if os.name == "nt" and path.lower().endswith(".pst"):
        try:
            import win32com.client  # noqa: F401
            return _read_pst_outlook(path, log)
        except ImportError:
            pass
    raise ReaderError(
        "PST를 읽을 라이브러리가 없습니다. 아래 중 하나를 설치하세요.\n"
        "  pip install libpff-python   (권장, Outlook 없이도 동작)\n"
        "  pip install pywin32         (Windows + Outlook 설치 PC)\n"
        "또는 scripts\\export_outlook.ps1 로 JSONL을 만들어 넣으세요."
    )


# MAPI 속성 태그 (상위 16비트)
_PR_SUBJECT = 0x0037
_PR_SENDER_NAME = 0x0C1A
_PR_SENDER_EMAIL = 0x0C1F
_PR_SENDER_SMTP = 0x5D01
_PR_DISPLAY_TO = 0x0E04
_PR_DISPLAY_CC = 0x0E03
_PR_MESSAGE_ID = 0x1035
_PR_MESSAGE_CLASS = 0x001A
_PR_ATTACH_LONG_FILENAME = 0x3707
_PR_ATTACH_FILENAME = 0x3704


def _rs_props(item, wanted):
    """item 의 record set 에서 원하는 MAPI 속성을 문자열로 꺼낸다."""
    found = {}
    try:
        for rs in item.record_sets:
            for e in rs.entries:
                try:
                    t = e.entry_type
                except Exception:
                    continue
                if t in wanted and t not in found:
                    try:
                        v = e.data_as_string
                    except Exception:
                        v = None
                    if v:
                        found[t] = v
    except Exception:
        pass
    return found


def _pff_time(m):
    for attr in ("delivery_time", "client_submit_time", "creation_time"):
        try:
            v = getattr(m, attr)
        except Exception:
            v = None
        if v and v.year > 1990:
            return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v
    return None


def _read_pst_pypff(path):
    import pypff

    f = pypff.file()
    f.set_ascii_codepage("cp949")  # 오래된 ANSI PST의 한글 깨짐 방지
    f.open(path)
    try:
        root = f.get_root_folder()
        stack = [(root, "")]
        while stack:
            folder, fpath = stack.pop()
            try:
                n_sub = folder.number_of_sub_folders
            except Exception:
                n_sub = 0
            for i in range(n_sub):
                try:
                    sub = folder.get_sub_folder(i)
                    stack.append((sub, f"{fpath}/{sub.name or ''}".strip("/")))
                except Exception:
                    continue
            try:
                n_msg = folder.number_of_sub_messages
            except Exception:
                n_msg = 0
            for i in range(n_msg):
                try:
                    m = folder.get_sub_message(i)
                    rec = _pff_message(m, fpath)
                except Exception:
                    continue
                if rec:
                    yield rec
    finally:
        f.close()


def _pff_message(m, folder):
    props = _rs_props(m, {_PR_SENDER_NAME, _PR_SENDER_EMAIL, _PR_SENDER_SMTP, _PR_DISPLAY_TO,
                          _PR_DISPLAY_CC, _PR_MESSAGE_ID, _PR_MESSAGE_CLASS})
    mclass = (props.get(_PR_MESSAGE_CLASS) or "IPM.Note").upper()
    if not mclass.startswith(("IPM.NOTE", "IPM.SCHEDULE.MEETING")):
        return None  # 일정·연락처·작업 등은 제외
    headers = _decode(_safe(lambda: m.transport_headers))
    hmsg = email.message_from_string(headers, policy=email.policy.compat32) if headers else None

    def h(name):
        return str(hmsg.get(name, "") or "") if hmsg else ""

    sender_name = _safe(lambda: m.sender_name) or props.get(_PR_SENDER_NAME, "")
    hname, haddr = parseaddr(h("From"))
    sender_email = props.get(_PR_SENDER_SMTP) or haddr or props.get(_PR_SENDER_EMAIL, "")
    if "@" not in (sender_email or ""):
        sender_email = haddr or ""
    body = _decode(_safe(lambda: m.plain_text_body))
    html_body = "" if body else _decode(_safe(lambda: m.html_body))
    atts = []
    try:
        for i in range(m.number_of_attachments):
            a = m.get_attachment(i)
            name = _safe(lambda: a.long_filename)
            if not name:
                p = _rs_props(a, {_PR_ATTACH_LONG_FILENAME, _PR_ATTACH_FILENAME})
                name = p.get(_PR_ATTACH_LONG_FILENAME) or p.get(_PR_ATTACH_FILENAME)
            if name:
                atts.append(name)
    except Exception:
        pass
    return {
        "message_id": props.get(_PR_MESSAGE_ID) or h("Message-ID"),
        "subject": _safe(lambda: m.subject) or "",
        "sender_name": sender_name or hname,
        "sender_email": (sender_email or "").lower(),
        "to": props.get(_PR_DISPLAY_TO) or _addr_text(h("To")),
        "cc": props.get(_PR_DISPLAY_CC) or _addr_text(h("Cc")),
        "date": _pff_time(m) or _parse_date(h("Date")),
        "folder": folder,
        "body": body,
        "html": html_body,
        "attachments": atts,
    }


def _safe(fn):
    try:
        return fn()
    except Exception:
        return None


def _read_pst_outlook(path, log=print):
    """Windows에 설치된 Outlook을 통해 PST를 읽는다 (pywin32 필요)."""
    import win32com.client

    ol = win32com.client.Dispatch("Outlook.Application")
    ns = ol.GetNamespace("MAPI")
    full = os.path.abspath(path)
    ns.AddStoreEx(full, 1)
    store = None
    for s in ns.Stores:
        try:
            if s.FilePath and os.path.abspath(s.FilePath).lower() == full.lower():
                store = s
        except Exception:
            continue
    if store is None:
        raise ReaderError("Outlook에서 PST를 열지 못했습니다: " + path)
    root = store.GetRootFolder()
    try:
        yield from iter_outlook_folder(root, "")
    finally:
        try:
            ns.RemoveStore(root)
        except Exception:
            log("PST 연결 해제 실패 (Outlook에서 직접 닫아 주세요)")


def iter_outlook_folder(folder, fpath):
    for item in folder.Items:
        try:
            if item.Class != 43:  # olMail
                continue
            atts = [item.Attachments.Item(i + 1).FileName for i in range(item.Attachments.Count)]
            try:
                mid = item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x1035001F")
            except Exception:
                mid = ""
            try:
                smtp = item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x5D01001F")
            except Exception:
                smtp = item.SenderEmailAddress or ""
            dt = item.ReceivedTime if fpath and "보낸" not in fpath and "sent" not in fpath.lower() else item.SentOn
            dt = datetime(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second,
                          tzinfo=timezone(timedelta(hours=9)))
            yield {
                "message_id": mid or "",
                "subject": item.Subject or "",
                "sender_name": item.SenderName or "",
                "sender_email": (smtp or "").lower(),
                "to": item.To or "",
                "cc": item.CC or "",
                "date": dt,
                "folder": fpath,
                "body": item.Body or "",
                "html": "",
                "attachments": atts,
            }
        except Exception:
            continue
    for sub in folder.Folders:
        yield from iter_outlook_folder(sub, f"{fpath}/{sub.Name}".strip("/"))


def to_plain(rec):
    return rec.get("body") or html_to_text(rec.get("html") or "")
