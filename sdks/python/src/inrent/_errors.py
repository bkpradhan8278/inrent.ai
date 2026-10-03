from __future__ import annotations

from typing import Any, Mapping, Optional


class InrentError(Exception):
    """Error returned by the INRENT API, or raised for timeouts and connection failures.

    Attributes:
        status: HTTP status code (0 for network errors and timeouts).
        code: machine-readable code, e.g. ``insufficient_credits`` or ``model_not_found``.
        type: error class, e.g. ``invalid_request_error``.
        request_id: the ``req_…`` ID to include when contacting support.
        retryable: whether retrying the same request may succeed.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: str,
        type: str = "api_error",
        param: Optional[str] = None,
        request_id: Optional[str] = None,
        retryable: Optional[bool] = None,
        headers: Optional[Mapping[str, str]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.type = type
        self.param = param
        self.request_id = request_id
        self.headers = dict(headers or {})
        self.retryable = retryable if retryable is not None else (status in (0, 408, 409, 429) or status >= 500)

    def __repr__(self) -> str:
        return f"InrentError(status={self.status}, code={self.code!r}, request_id={self.request_id!r}, message={self.message!r})"

    @classmethod
    def from_response(cls, status: int, body: Any, headers: Mapping[str, str]) -> "InrentError":
        err = body.get("error") if isinstance(body, dict) else None
        err = err if isinstance(err, dict) else {}
        return cls(
            err.get("message") or f"Request failed with status {status}",
            status=status,
            code=err.get("code") or f"http_{status}",
            type=err.get("type") or ("api_error" if status >= 500 else "invalid_request_error"),
            param=err.get("param"),
            request_id=err.get("request_id") or headers.get("x-request-id"),
            headers=headers,
        )


class InrentTimeoutError(InrentError):
    def __init__(self, timeout: float) -> None:
        super().__init__(f"Request timed out after {timeout}s", status=0, code="timeout", type="api_connection_error", retryable=True)


class InrentConnectionError(InrentError):
    def __init__(self, cause: BaseException) -> None:
        super().__init__(f"Could not reach the INRENT API: {cause}", status=0, code="connection_error", type="api_connection_error", retryable=True)
