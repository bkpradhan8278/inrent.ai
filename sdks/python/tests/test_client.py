import json

import httpx
import pytest

from inrent import Inrent, InrentError, InrentTimeoutError

COMPLETION = {
    "id": "chatcmpl-1",
    "object": "chat.completion",
    "created": 1,
    "model": "inrent/mock-echo",
    "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}, "finish_reason": "stop"}],
    "usage": {"prompt_tokens": 3, "completion_tokens": 1, "total_tokens": 4},
}


def make(handler, **kw):
    transport = httpx.MockTransport(handler)
    return Inrent(api_key="sk-test", base_url="http://gw.test/v1/", http_client=httpx.Client(transport=transport), **kw)


def test_requires_api_key(monkeypatch):
    monkeypatch.delenv("INRENT_API_KEY", raising=False)
    with pytest.raises(ValueError):
        Inrent()


def test_chat_completion_with_meta():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=COMPLETION, headers={"x-request-id": "req_abc", "x-inrent-provider": "mock", "x-inrent-fallbacks": "1", "x-inrent-cost-usd": "0.000004"})

    client = make(handler)
    r = client.chat.completions.create(model="inrent/auto", messages=[{"role": "user", "content": "hi"}], inrent={"route": "lowest_cost"})
    assert seen["url"] == "http://gw.test/v1/chat/completions"
    assert seen["auth"] == "Bearer sk-test"
    assert seen["body"]["inrent"] == {"route": "lowest_cost"}
    assert r["choices"][0]["message"]["content"] == "hi"
    assert r == COMPLETION  # plain dict semantics
    assert r.meta["request_id"] == "req_abc"
    assert r.meta["provider"] == "mock"
    assert r.meta["fallbacks"] == 1


def test_retries_429_then_succeeds(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, json={"error": {"type": "rate_limit_error", "code": "rate_limit_exceeded", "message": "slow"}}, headers={"retry-after": "1"})
        return httpx.Response(200, json=COMPLETION)

    r = make(handler).chat.completions.create(model="m", messages=[])
    assert r["id"] == "chatcmpl-1"
    assert len(calls) == 2


def test_no_retry_on_4xx_and_error_fields():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(404, json={"error": {"type": "invalid_request_error", "code": "model_not_found", "message": "No such model", "param": "model", "request_id": "req_err"}})

    with pytest.raises(InrentError) as ei:
        make(handler).chat.completions.create(model="nope/model", messages=[])
    e = ei.value
    assert (e.status, e.code, e.param, e.request_id, e.retryable) == (404, "model_not_found", "model", "req_err", False)
    assert len(calls) == 1


def test_server_errors_exhaust_retries(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(503, json={"error": {"code": "no_providers_available", "message": "down"}})

    with pytest.raises(InrentError) as ei:
        make(handler, max_retries=2).models.list()
    assert ei.value.status == 503
    assert len(calls) == 3


def test_timeout(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)

    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(InrentTimeoutError):
        make(handler, max_retries=1).models.list()


def sse(events):
    return "".join(f"data: {e}\n\n" for e in events).encode()


def test_streaming_and_done():
    chunk = lambda c: json.dumps({"choices": [{"index": 0, "delta": {"content": c}, "finish_reason": None}]})
    usage = json.dumps({"choices": [], "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}})
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, content=sse([chunk("Hel"), chunk("lo"), usage, "[DONE]", chunk("ignored")]), headers={"content-type": "text/event-stream", "x-request-id": "req_s"})

    stream = make(handler).chat.completions.create(model="m", messages=[{"role": "user", "content": "x"}], stream=True)
    assert stream.meta["request_id"] == "req_s"
    assert seen["body"]["stream"] is True and seen["body"]["stream_options"] == {"include_usage": True}
    chunks = list(stream)
    text = "".join(c["choices"][0]["delta"].get("content", "") for c in chunks if c["choices"])
    assert text == "Hello"
    assert chunks[-1]["usage"]["total_tokens"] == 3


def test_stream_error_event():
    def handler(request):
        return httpx.Response(200, content=sse([json.dumps({"choices": [{"index": 0, "delta": {"content": "a"}}]}), json.dumps({"error": {"code": "upstream_error", "message": "dropped"}})]), headers={"x-request-id": "req_x"})

    stream = make(handler).chat.completions.create(model="m", messages=[], stream=True)
    with pytest.raises(InrentError) as ei:
        stream.text()
    assert ei.value.code == "upstream_error" and ei.value.request_id == "req_x"


def test_management_unwraps_data_and_encodes_slugs():
    urls = []

    def handler(request):
        urls.append(str(request.url))
        if request.url.path.endswith("/keys"):
            return httpx.Response(201, json={"data": {"id": "k1", "key": "sk-inrent-dev-xyz"}})
        if request.url.path.endswith("/usage"):
            return httpx.Response(200, json={"data": {"days": 7}})
        return httpx.Response(200, json={"id": "openai/gpt-4.1"})

    client = make(handler)
    assert client.keys.create(name="ci", environment="development")["key"] == "sk-inrent-dev-xyz"
    assert client.usage.retrieve(days=7)["days"] == 7
    client.models.retrieve("openai/gpt-4.1")
    assert urls[1] == "http://gw.test/v1/usage?days=7"
    assert urls[2] == "http://gw.test/v1/models/openai/gpt-4.1"
