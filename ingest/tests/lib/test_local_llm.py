"""ingest.lib.local_llm — offline tests (requests is mocked; no Ollama needed)."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from ingest.lib import local_llm as ll

SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}},
    "required": ["ok"],
    "additionalProperties": False,
}


def _resp(content: str, *, prompt=10, evals=5, error=None):
    r = MagicMock()
    r.raise_for_status = MagicMock()
    body = {"message": {"role": "assistant", "content": content},
            "prompt_eval_count": prompt, "eval_count": evals}
    if error:
        body = {"error": error}
    r.json = MagicMock(return_value=body)
    return r


@pytest.fixture(autouse=True)
def _no_ledger(monkeypatch):
    monkeypatch.setenv("SKIP_USAGE_LOG", "1")


def test_think_default_per_family():
    assert ll.OllamaClient("gpt-oss:20b").think == "low"
    assert ll.OllamaClient("gemma4:12b").think is None
    assert ll.OllamaClient("gpt-oss:20b", think=False).think is False


def test_chat_json_sends_schema_and_think_and_validates():
    with patch("ingest.lib.local_llm.requests.post", return_value=_resp('{"ok": true}')) as post:
        out = ll.OllamaClient("gpt-oss:20b", base_url="http://x:1").chat_json(
            system="s", user="u", schema=SCHEMA)
    assert out == {"ok": True}
    payload = post.call_args.kwargs["json"]
    assert payload["format"] == SCHEMA
    assert payload["think"] == "low"
    assert payload["stream"] is False
    assert payload["options"]["temperature"] == 0.0


def test_empty_content_raises_schema_error_after_retry():
    with patch("ingest.lib.local_llm.requests.post", return_value=_resp("")) as post:
        with pytest.raises(ll.LocalLLMSchemaError, match="empty content"):
            ll.OllamaClient("gpt-oss:20b", base_url="http://x:1").chat_json(
                system="s", user="u", schema=SCHEMA)
    assert post.call_count == 2  # one retry with the error appended


def test_schema_invalid_then_valid_recovers_on_retry():
    with patch("ingest.lib.local_llm.requests.post",
               side_effect=[_resp('{"ok": "yes"}'), _resp('{"ok": false}')]) as post:
        out = ll.OllamaClient("gemma4:12b", base_url="http://x:1").chat_json(
            system="s", user="u", schema=SCHEMA)
    assert out == {"ok": False}
    second_msgs = post.call_args_list[1].kwargs["json"]["messages"]
    assert second_msgs[-1]["role"] == "user" and "did not satisfy" in second_msgs[-1]["content"]


def test_ollama_error_envelope_raises():
    with patch("ingest.lib.local_llm.requests.post", return_value=_resp("", error="model not found")):
        with pytest.raises(ll.LocalLLMError, match="model not found"):
            ll.OllamaClient("nope:1b", base_url="http://x:1").chat_json(
                system="s", user="u", schema=SCHEMA)


def test_ensure_model_lists_tags():
    tags = MagicMock()
    tags.raise_for_status = MagicMock()
    tags.json = MagicMock(return_value={"models": [{"name": "gemma4:12b"}]})
    with patch("ingest.lib.local_llm.requests.get", return_value=tags):
        ll.OllamaClient("gemma4:12b", base_url="http://x:1").ensure_model()
        with pytest.raises(ll.LocalLLMUnavailable, match="not pulled"):
            ll.OllamaClient("gpt-oss:20b", base_url="http://x:1").ensure_model()


def test_choice_schema_is_closed_set():
    s = ll.choice_schema(["c1", "c2"])
    assert s["properties"]["choice"]["enum"] == ["c1", "c2", "none"]
    with pytest.raises(ValueError):
        ll.choice_schema(["none"])


def test_judged_choice_accepts_only_on_agreement():
    cands = [ll.Candidate("c1", "A"), ll.Candidate("c2", "B")]
    p = ll.OllamaClient("gpt-oss:20b", base_url="http://x:1")
    j = ll.OllamaClient("gemma4:12b", base_url="http://x:1")
    agree = [_resp(json.dumps({"choice": "c1", "confidence": 0.9, "reason": "r"}))] * 2
    with patch("ingest.lib.local_llm.requests.post", side_effect=agree):
        jc = ll.judged_choice(p, j, task="t", query="q", candidates=cands)
    assert jc.agree and jc.accepted == "c1"

    disagree = [_resp(json.dumps({"choice": "c1", "confidence": 0.9, "reason": "r"})),
                _resp(json.dumps({"choice": "c2", "confidence": 0.9, "reason": "r"}))]
    with patch("ingest.lib.local_llm.requests.post", side_effect=disagree):
        jc = ll.judged_choice(p, j, task="t", query="q", candidates=cands)
    assert not jc.agree and jc.accepted is None

    both_none = [_resp(json.dumps({"choice": "none", "confidence": 0.8, "reason": "r"}))] * 2
    with patch("ingest.lib.local_llm.requests.post", side_effect=both_none):
        jc = ll.judged_choice(p, j, task="t", query="q", candidates=cands)
    assert jc.agree and jc.accepted is None and jc.primary.choice is None


def test_is_disabled_env(monkeypatch):
    monkeypatch.delenv("LOCAL_LLM_DISABLED", raising=False)
    assert ll.is_disabled() is False
    monkeypatch.setenv("LOCAL_LLM_DISABLED", "1")
    assert ll.is_disabled() is True
