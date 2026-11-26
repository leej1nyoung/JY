"""(선택) 사내 LLM으로 검색된 사례를 요약해 답하기.

메일 내용이 회사 밖으로 나가지 않도록, 접속 주소가 로컬/사내망(사설 IP)일 때만 호출한다.
LLM이 꺼져 있거나 실패해도 검색 결과는 그대로 보여 준다.
"""
import ipaddress
import json
import os
import socket
import urllib.request
from urllib.parse import urlparse


class LLMError(Exception):
    pass


def _is_internal(url):
    host = urlparse(url).hostname or ""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError as e:
        raise LLMError(f"LLM 주소를 찾을 수 없습니다: {host}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not (ip.is_private or ip.is_loopback or ip.is_link_local):
            return False
    return True


SYSTEM = """너는 HD건설기계 AM영업팀의 업무 사례 검색 도우미다.
아래 [사례]는 팀원들의 실제 메일에서 찾은 것이다. 반드시 [사례]에 있는 내용만 근거로 답한다.
- 질문과 비슷한 사례가 있으면: 어떤 건이었는지, 어떤 절차·부서·서류를 거쳤는지, 결과가 어땠는지를 짧게 정리한다.
- 문장마다 근거 사례 번호를 [사례 2]처럼 붙인다.
- 누가 담당했는지(메일함 주인, 주고받은 사람)를 알려 주고 "자세한 건 OOO님께 확인"을 덧붙인다.
- 사례에 없는 절차·수치·규정은 지어내지 않는다. 모르면 "메일에서는 확인되지 않음"이라고 쓴다.
- 품번·금액·날짜는 원문 그대로 쓴다.
- 한국어로, 핵심만 짧게."""


def build_context(conn, result, max_threads=6, max_msgs=3, max_chars=1500):
    parts = []
    for i, t in enumerate(result["threads"][:max_threads], 1):
        msgs = conn.execute(
            "SELECT sender_name, date, body_new FROM messages WHERE thread_id=? AND hidden=0 ORDER BY date",
            (t["id"],)).fetchall()
        # 처음 메일 + 마지막 메일 + 가장 잘 맞은 메일
        pick = []
        if msgs:
            pick = [msgs[0]] + ([msgs[-1]] if len(msgs) > 1 else [])
        if t.get("best_message"):
            b = conn.execute("SELECT sender_name, date, body_new FROM messages WHERE id=?",
                             (t["best_message"],)).fetchone()
            if b and b not in pick:
                pick.insert(1, b)
        body = "\n---\n".join(f"({m['date']} {m['sender_name']})\n{(m['body_new'] or '')[:max_chars]}"
                              for m in pick[:max_msgs])
        parts.append(
            f"[사례 {i}] 제목: {t['subject']}\n기간: {t['first_date']} ~ {t['last_date']} / 메일 {t['count']}통\n"
            f"메일함 주인: {', '.join(t['owners'])} / 주고받은 사람: {', '.join(t['participants'])}\n"
            f"첨부: {', '.join(t['attachments'][:6]) or '없음'}\n{body}")
    for c in result.get("cards") or []:
        parts.insert(0, f"[노하우 카드] {c['title']} (작성 {c['author']})\n{c['body']}")
    return "\n\n".join(parts)


def chat(cfg, msgs, json_mode=False):
    """사내 LLM 한 번 호출 → 답 문자열."""
    lc = cfg.get("llm") or {}
    if not lc.get("enabled"):
        raise LLMError("사내 AI가 꺼져 있습니다 (data/config.json 의 llm.enabled)")
    url = lc["url"].rstrip("/")
    if not lc.get("allow_external") and not _is_internal(url):
        raise LLMError("보안: 사내망/로컬이 아닌 AI 주소로는 메일을 보내지 않습니다. "
                       "회사가 승인한 주소라면 llm.allow_external 을 true 로 바꾸세요.")
    headers = {"Content-Type": "application/json"}
    key = os.environ.get(lc.get("api_key_env") or "", "")
    kind = lc.get("kind", "ollama")
    if kind == "azure":
        endpoint = (f"{url}/openai/deployments/{lc['model']}/chat/completions"
                    f"?api-version={lc.get('api_version', '2024-10-21')}")
        payload = {"messages": msgs, "temperature": 0}
        if key:
            headers["api-key"] = key
    elif kind == "openai":
        endpoint = url + ("/chat/completions" if url.endswith("/v1") else "/v1/chat/completions")
        payload = {"model": lc["model"], "messages": msgs, "temperature": 0}
    else:
        endpoint = url + "/api/chat"
        payload = {"model": lc["model"], "messages": msgs, "stream": False, "options": {"temperature": 0}}
        if json_mode:
            payload["format"] = "json"
    if json_mode and kind in ("openai", "azure"):
        payload["response_format"] = {"type": "json_object"}
    if key and kind != "azure":
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(endpoint, json.dumps(payload).encode("utf-8"), headers)
    # 사내 AI는 프록시를 거치지 않는다
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=int(lc.get("timeout", 120))) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        raise LLMError(f"사내 AI 호출 실패: {e}") from e
    if "choices" in data:
        return data["choices"][0]["message"]["content"] or ""
    return (data.get("message") or {}).get("content", "")


def ask(conn, cfg, question, result):
    context = build_context(conn, result)
    if not context:
        return "관련 사례를 찾지 못했습니다."
    return chat(cfg, [{"role": "system", "content": SYSTEM},
                      {"role": "user", "content": f"[사례]\n{context}\n\n[질문]\n{question}"}])
