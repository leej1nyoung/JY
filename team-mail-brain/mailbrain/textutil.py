"""텍스트 처리: 색인용 토큰화, 회신 인용문 제거, 제목 정규화, HTML→텍스트.

한국어·중국어는 띄어쓰기/조사 때문에 단어 단위 검색이 잘 안 맞는다
("러시아에" 와 "러시아"). 그래서 한글·한자는 2글자씩 끊어(bi-gram) 색인한다.
영문·러시아어·숫자·품번(31QE-10010)은 단어 단위로 색인한다.
"""
import html
import re
from html.parser import HTMLParser

_HANGUL = "가-힣"
_CJK = "一-鿿㐀-䶿"
_WORD = "0-9A-Za-zÀ-ɏЀ-ӿ"

_TOKEN_RE = re.compile(
    rf"[{_HANGUL}]+|[{_CJK}]+|[{_WORD}]+(?:[-_./][{_WORD}]+)*"
)
_SPLIT_RE = re.compile(r"[-_./]")


def _ngrams(run):
    if len(run) == 1:
        return [run]
    return [run[i:i + 2] for i in range(len(run) - 1)]


def tokens(text):
    """색인/검색 공통 토큰 목록."""
    out = []
    for m in _TOKEN_RE.finditer(text or ""):
        w = m.group(0)
        c = w[0]
        if "가" <= c <= "힣" or "㐀" <= c <= "鿿":
            out.extend(_ngrams(w))
        else:
            w = w.lower()
            if _SPLIT_RE.search(w):
                parts = [p for p in _SPLIT_RE.split(w) if p]
                out.append("".join(parts))  # 31QE-10010 -> 31qe10010
                out.extend(parts)
            else:
                out.append(w)
    return out


def index_text(text):
    return " ".join(tokens(text))


# ---------------------------------------------------------------- 질문 → 검색어

# 질문 문장에서 검색에 쓸모없는 말 (조사·어미를 뗀 뒤 비교)
STOPWORDS = set("""
유사사례 유사 사례 비슷한 비슷 경우 혹시 어떻게 이렇게 저렇게 그렇게 이런 저런 그런
있어 있나 있나요 있을까 있을까요 있는지 있으면 없어 없나 했어 했나 했는지 하는데 하려고
하려는데 팔려고 팔려는데 보내려고 하면 해야 해야해 해야하나 되나 되나요 될까 될까요 건가
관련 관련해서 대해 대해서 대한 경우에 때 문의 질문 알려줘 알려주세요 찾아줘 찾아주세요
받은 받는 받아 받았 했던 해본 하는 있는 했다 한다 된다 누가 누구 뭐 무엇 어디 언제 왜 좀 그냥 다른 사람 우리 우리팀 팀에서 처리 진행 방법
the a an of to for in on is are was any how what who case cases similar there have has
""".split())

_PARTICLES = ("에서는", "에게서", "으로는", "이라도", "에서", "에게", "으로", "까지", "부터",
              "처럼", "보다", "하고", "이랑", "은", "는", "이", "가", "을", "를", "에",
              "의", "로", "와", "과", "도", "만", "랑")
_ENDINGS = ("하려고", "하는데", "했는데", "하려면", "하면", "해서", "했어", "했나", "할까",
            "려고", "는데", "어요", "나요", "까요", "니까")


def _strip_korean(word):
    for suf in _ENDINGS + _PARTICLES:
        if len(word) > len(suf) + 1 and word.endswith(suf):
            return word[: -len(suf)]
    return word


def query_groups(query, synonyms=None):
    """질문 문장 → [[단어, 동의어...], ...]. 묶음 하나가 질문의 '개념' 하나."""
    words = []
    for m in _TOKEN_RE.finditer(query or ""):
        w = m.group(0)
        if "가" <= w[0] <= "힣":
            w = _strip_korean(w)
        lw = w.lower()
        if lw in STOPWORDS or (len(w) < 2 and not w.isdigit()):
            continue
        if lw not in [x.lower() for x in words]:
            words.append(w)
    groups = []
    for w in words:
        lw = w.lower()
        g = [w]
        for syn in synonyms or []:
            sl = [s.lower() for s in syn]
            if any(lw == s or (len(lw) >= 2 and lw in s) for s in sl):
                g.extend(s for s in syn if s.lower() not in [x.lower() for x in g])
        # 같은 동의어 묶음에 걸린 단어는 하나의 개념으로 합친다
        for prev in groups:
            if set(x.lower() for x in prev) & set(x.lower() for x in g[1:] or [w]) and len(g) > 1:
                prev.extend(x for x in g if x.lower() not in [p.lower() for p in prev])
                break
        else:
            groups.append(g)
    return groups


_CYR = re.compile(r"^[\u0400-\u04ff]+$")


def stem(word):
    """러시아어는 어미가 바뀌므로(масло/масла) 끝 글자를 떼고 앞부분으로 찾는다."""
    w = word.lower()
    if _CYR.match(w) and len(w) >= 5:
        return w[:-2] if len(w) >= 8 else w[:-1]
    return w


def query_terms(query, synonyms=None):
    return [w for g in query_groups(query, synonyms) for w in g]


# ---------------------------------------------------------------- 제목

_PREFIX_RE = re.compile(
    r"^\s*(?:(?:re|fw|fwd|aw|wg|sv|tr|rv|ответ|отв|пересл|fwd?|회신|답장|전달|답변|"
    r"答复|回复|回覆|转发|轉寄|轉發)\s*(?:\[\d+\]|\(\d+\))?\s*[:：]\s*)+",
    re.IGNORECASE,
)


def normalize_subject(subject):
    s = subject or ""
    prev = None
    while prev != s:
        prev = s
        s = _PREFIX_RE.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def subject_key(subject):
    return normalize_subject(subject).lower()


# ---------------------------------------------------------------- 본문

class _Html2Text(HTMLParser):
    BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "table", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script", "head"):
            self._skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")
        elif tag in ("td", "th"):
            self.parts.append("\t")

    def handle_endtag(self, tag):
        if tag in ("style", "script", "head") and self._skip:
            self._skip -= 1
        elif tag in ("p", "div", "tr", "table"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_to_text(src):
    if not src:
        return ""
    p = _Html2Text()
    try:
        p.feed(src)
        p.close()
        text = "".join(p.parts)
    except Exception:
        text = html.unescape(re.sub(r"<[^>]+>", " ", src))
    return clean_text(text)


def clean_text(text):
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


_SEP_RE = re.compile(
    r"^\s*(?:-{2,}\s*(?:original message|원본 메시지|원래 메시지|forwarded message|전달된 메시지|"
    r"原始邮件|原始郵件|转发的邮件|исходное сообщение|пересылаемое сообщение)\s*-*"
    r"|_{10,}"
    r"|on .{5,200}wrote:"
    r"|20\d\d[-./년].{0,80}(?:작성|wrote)\s*:?)\s*$",
    re.IGNORECASE,
)
_FROM_RE = re.compile(r"^\s*\**\s*(?:from|보낸 사람|보낸사람|발신|发件人|寄件者|от|von)\s*\**\s*[:：]", re.IGNORECASE)
_HDR_RE = re.compile(
    r"^\s*\**\s*(?:sent|date|to|subject|cc|보낸 날짜|날짜|받는 사람|받는사람|수신|제목|참조|"
    r"发送时间|日期|收件人|主题|抄送|отправлено|дата|кому|тема|копия)\s*\**\s*[:：]",
    re.IGNORECASE,
)


def strip_quoted(body):
    """회신/전달 메일에서 '새로 쓴 부분'만 남긴다.

    새로 쓴 부분이 거의 없으면(본문 없이 전달만 한 경우) 원문 전체를 돌려준다.
    """
    lines = (body or "").split("\n")
    cut = None
    for i, line in enumerate(lines):
        if _SEP_RE.match(line):
            cut = i
            break
        if _FROM_RE.match(line):
            nxt = lines[i + 1:i + 6]
            if sum(1 for n in nxt if _HDR_RE.match(n)) >= 1:
                cut = i
                break
    new = lines if cut is None else lines[:cut]
    new = [ln for ln in new if not ln.lstrip().startswith(">")]
    text = clean_text("\n".join(new))
    if len(re.sub(r"\s", "", text)) < 30:
        return clean_text(body)
    return text


def snippet(text, terms, width=90):
    """원문에서 검색어가 처음 나오는 부분 주변을 잘라 온다."""
    text = re.sub(r"\s+", " ", text or "").strip()
    low = text.lower()
    best = -1
    for t in terms:
        p = low.find(t.lower())
        if p >= 0 and (best < 0 or p < best):
            best = p
    if best < 0:
        return text[: width * 2]
    start = max(0, best - width)
    end = min(len(text), best + width)
    return ("…" if start else "") + text[start:end] + ("…" if end < len(text) else "")
