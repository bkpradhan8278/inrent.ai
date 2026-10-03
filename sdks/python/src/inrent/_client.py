from __future__ import annotations

import json
import os
import random
import time
from typing import Any, Dict, Iterator, List, Mapping, Optional, Union
from urllib.parse import quote

import httpx

from ._errors import InrentConnectionError, InrentError, InrentTimeoutError

__version__ = "0.1.0"
DEFAULT_BASE_URL = "https://api.inrent.ai/v1"


def _quote(segment: str) -> str:
    return quote(segment, safe="")


def response_meta(headers: Mapping[str, str], status: int) -> Dict[str, Any]:
    """INRENT response metadata from headers (request ID, provider, cost, fallbacks…)."""

    def num(name: str) -> Optional[float]:
        v = headers.get(name)
        try:
            return float(v) if v not in (None, "") else None
        except ValueError:
            return None

    fallbacks = num("x-inrent-fallbacks")
    return {
        "request_id": headers.get("x-request-id"),
        "trace_id": headers.get("x-inrent-trace-id"),
        "provider": headers.get("x-inrent-provider"),
        "model": headers.get("x-inrent-model"),
        "fallbacks": int(fallbacks) if fallbacks is not None else None,
        "billing_mode": headers.get("x-inrent-billing-mode"),
        "cost_usd": headers.get("x-inrent-cost-usd"),
        "status": status,
    }


class Response(dict):  # type: ignore[type-arg]
    """A plain ``dict`` of the JSON response, with INRENT metadata on ``.meta``."""

    meta: Dict[str, Any]


def _wrap(data: Any, meta: Dict[str, Any]) -> Any:
    if isinstance(data, dict):
        r = Response(data)
        r.meta = meta
        return r
    return data


class Stream:
    """Iterator over server-sent events. Use as ``for chunk in stream`` or ``with stream: …``."""

    def __init__(self, response: httpx.Response, meta: Dict[str, Any]) -> None:
        self._response = response
        self.meta = meta

    def __iter__(self) -> Iterator[Dict[str, Any]]:
        try:
            data_lines: List[str] = []
            for line in self._response.iter_lines():
                if line == "":
                    if data_lines:
                        data = "\n".join(data_lines)
                        data_lines = []
                        if data == "[DONE]":
                            return
                        yield from self._parse(data)
                    continue
                if line.startswith("data:"):
                    data_lines.append(line[6:] if line[5:6] == " " else line[5:])
            if data_lines:
                data = "\n".join(data_lines)
                if data != "[DONE]":
                    yield from self._parse(data)
        finally:
            self._response.close()

    def _parse(self, data: str) -> Iterator[Dict[str, Any]]:
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            return
        if isinstance(event, dict) and isinstance(event.get("error"), dict):
            err = event["error"]
            raise InrentError(
                err.get("message") or "The stream ended with an error.",
                status=200,
                code=err.get("code") or "stream_error",
                type=err.get("type") or "api_error",
                request_id=self.meta.get("request_id"),
                retryable=False,
            )
        yield event

    def text(self) -> str:
        """Concatenates the text deltas of a streamed chat completion."""
        out = []
        for chunk in self:
            choices = chunk.get("choices") or []
            if choices:
                out.append((choices[0].get("delta") or {}).get("content") or "")
        return "".join(out)

    def close(self) -> None:
        self._response.close()

    def __enter__(self) -> "Stream":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()


class Inrent:
    """INRENT API client.

    >>> client = Inrent()  # reads INRENT_API_KEY
    >>> r = client.chat.completions.create(model="inrent/auto", messages=[{"role": "user", "content": "Hi"}])
    >>> r["choices"][0]["message"]["content"], r.meta["request_id"]
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = 600.0,
        max_retries: int = 2,
        default_headers: Optional[Mapping[str, str]] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        key = api_key or os.environ.get("INRENT_API_KEY")
        if not key:
            raise ValueError("Missing API key. Pass api_key=… or set the INRENT_API_KEY environment variable.")
        self.base_url = (base_url or os.environ.get("INRENT_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self._headers = {
            "authorization": f"Bearer {key}",
            "x-inrent-client": f"inrent-sdk-python/{__version__}",
            **(default_headers or {}),
        }
        self._http = http_client or httpx.Client(timeout=timeout)
        self.chat = _Chat(self)
        self.completions = _Completions(self)
        self.responses = _Responses(self)
        self.embeddings = _Embeddings(self)
        self.images = _Images(self)
        self.models = _Models(self)
        self.keys = _Keys(self)
        self.usage = _Usage(self)
        self.requests = _Requests(self)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "Inrent":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def _backoff(self, attempt: int, headers: Optional[Mapping[str, str]]) -> float:
        retry_after = headers.get("retry-after") if headers else None
        if retry_after:
            try:
                return min(max(float(retry_after), 0.0), 60.0)
            except ValueError:
                pass
        base = min(0.5 * (2**attempt), 8.0)
        return base / 2 + random.random() * base / 2

    def request(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        params: Optional[Mapping[str, Any]] = None,
        stream: bool = False,
        timeout: Optional[float] = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        query = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in (params or {}).items() if v is not None}
        headers = {**self._headers, "accept": "text/event-stream" if stream else "application/json"}
        attempt = 0
        while True:
            try:
                req = self._http.build_request(method, url, json=body, params=query, headers=headers, timeout=timeout or self.timeout)
                res = self._http.send(req, stream=stream)
            except httpx.TimeoutException as e:
                if attempt < self.max_retries:
                    time.sleep(self._backoff(attempt, None))
                    attempt += 1
                    continue
                raise InrentTimeoutError(timeout or self.timeout) from e
            except httpx.TransportError as e:
                if attempt < self.max_retries:
                    time.sleep(self._backoff(attempt, None))
                    attempt += 1
                    continue
                raise InrentConnectionError(e) from e

            if res.status_code >= 400:
                if stream:
                    res.read()
                try:
                    payload = res.json()
                except ValueError:
                    payload = None
                res.close()
                err = InrentError.from_response(res.status_code, payload, res.headers)
                if err.retryable and attempt < self.max_retries:
                    time.sleep(self._backoff(attempt, res.headers))
                    attempt += 1
                    continue
                raise err

            meta = response_meta(res.headers, res.status_code)
            if stream:
                return Stream(res, meta)
            try:
                return _wrap(res.json(), meta)
            except ValueError as e:
                raise InrentError("Could not parse the API response.", status=res.status_code, code="invalid_response", request_id=meta["request_id"], retryable=False) from e


class _Resource:
    def __init__(self, client: Inrent) -> None:
        self._client = client


class _ChatCompletions(_Resource):
    def create(self, *, model: str, messages: List[Dict[str, Any]], stream: bool = False, timeout: Optional[float] = None, **params: Any) -> Any:
        """Creates a chat completion. Returns a ``dict`` (with ``.meta``) or a :class:`Stream` when ``stream=True``.

        INRENT routing options go in ``inrent={"route": "lowest_latency", "fallback_models": [...]}``.
        """
        body: Dict[str, Any] = {"model": model, "messages": messages, **params}
        if stream:
            body["stream"] = True
            body["stream_options"] = {"include_usage": True, **(params.get("stream_options") or {})}
        return self._client.request("POST", "/chat/completions", body=body, stream=stream, timeout=timeout)


class _Chat(_Resource):
    def __init__(self, client: Inrent) -> None:
        super().__init__(client)
        self.completions = _ChatCompletions(client)


class _Completions(_Resource):
    def create(self, *, model: str, prompt: Union[str, List[str]], stream: bool = False, **params: Any) -> Any:
        body = {"model": model, "prompt": prompt, **params, **({"stream": True} if stream else {})}
        return self._client.request("POST", "/completions", body=body, stream=stream)


class _Responses(_Resource):
    def create(self, *, model: str, input: Any, stream: bool = False, **params: Any) -> Any:
        body = {"model": model, "input": input, **params, **({"stream": True} if stream else {})}
        return self._client.request("POST", "/responses", body=body, stream=stream)


class _Embeddings(_Resource):
    def create(self, *, model: str, input: Union[str, List[str]], **params: Any) -> Any:
        return self._client.request("POST", "/embeddings", body={"model": model, "input": input, **params})


class _Images(_Resource):
    def generate(self, *, model: str, prompt: str, **params: Any) -> Any:
        return self._client.request("POST", "/images/generations", body={"model": model, "prompt": prompt, **params})


class _Models(_Resource):
    def list(self) -> Any:
        return self._client.request("GET", "/models")

    def retrieve(self, model: str) -> Any:
        return self._client.request("GET", "/models/" + "/".join(_quote(p) for p in model.split("/")))


class _Keys(_Resource):
    def current(self) -> Any:
        """The key making the request: limits, balance and spend."""
        return self._client.request("GET", "/key")["data"]

    def list(self, *, include_revoked: bool = False) -> Any:
        return self._client.request("GET", "/keys", params={"include_revoked": include_revoked or None})

    def create(self, *, name: str, **params: Any) -> Any:
        """Creates a key (needs ``keys:write``). The secret is in ``["key"]`` and is returned only once."""
        return self._client.request("POST", "/keys", body={"name": name, **params})["data"]

    def revoke(self, key_id: str) -> Any:
        return self._client.request("DELETE", f"/keys/{_quote(key_id)}")


class _Usage(_Resource):
    def retrieve(self, *, days: Optional[int] = None, project_id: Optional[str] = None) -> Any:
        return self._client.request("GET", "/usage", params={"days": days, "project_id": project_id})["data"]


class _Requests(_Resource):
    def list(self, *, limit: Optional[int] = None, cursor: Optional[str] = None, model: Optional[str] = None, status: Optional[str] = None) -> Any:
        return self._client.request("GET", "/requests", params={"limit": limit, "cursor": cursor, "model": model, "status": status})

    def retrieve(self, request_id: str) -> Any:
        return self._client.request("GET", f"/requests/{_quote(request_id)}")["data"]
