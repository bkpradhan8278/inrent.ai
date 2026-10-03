"""Optional checks against a running gateway: INRENT_LIVE_API_KEY=… pytest"""

import os

import pytest

from inrent import Inrent, InrentError

KEY = os.environ.get("INRENT_LIVE_API_KEY")
pytestmark = pytest.mark.skipif(not KEY, reason="set INRENT_LIVE_API_KEY to run live tests")


@pytest.fixture()
def client():
    with Inrent(api_key=KEY, base_url=os.environ.get("INRENT_LIVE_BASE_URL", "http://localhost:8080/v1"), max_retries=0) as c:
        yield c


def test_chat_stream_embeddings(client):
    r = client.chat.completions.create(model="inrent/mock-echo", messages=[{"role": "user", "content": "ping"}])
    assert "ping" in r["choices"][0]["message"]["content"]
    assert r.meta["request_id"].startswith("req_")
    with client.chat.completions.create(model="inrent/mock-echo", messages=[{"role": "user", "content": "stream"}], stream=True) as s:
        assert "stream" in s.text()
    e = client.embeddings.create(model="inrent/mock-embed", input=["a", "b"])
    assert len(e["data"]) == 2


def test_management_and_errors(client):
    assert "inference" in client.keys.current()["permissions"]
    assert client.usage.retrieve(days=7)["days"] == 7
    assert any(m["id"] == "inrent/auto" for m in client.models.list()["data"])
    with pytest.raises(InrentError) as ei:
        client.chat.completions.create(model="nope/missing", messages=[{"role": "user", "content": "x"}])
    assert ei.value.status == 404
