"""ingest.lib.local_llm — local Ollama batch-worker primitive (zero cloud spend).

The ONE root for calling a locally-served model from ingest. Every call:
  - constrains the model to a JSON Schema via Ollama's `format` parameter
    (verified 08/30/2026 against ollama/ollama docs/api.md: "format can be `json`
    or a JSON schema"), then RE-VALIDATES the reply with `jsonschema` — the
    server-side constraint is the belt, the validator is the braces;
  - logs one `api_usage_log` row through `ingest.lib.api_usage.log_api_usage`
    at $0 (local models are not in RATES, and that helper prices unknown models
    at 0 while still writing the row — the ops /spend page sees the volume);
  - raises loudly on transport, empty-content, or schema failure. It never
    "parses to {}" — a silent empty answer is the failure mode this exists to kill.

Why a closed-set helper: the first caller (condo_baseline_swfl) needs a model to
PICK ONE of N offered candidates (or "none"), never to invent a name. Encoding
the candidate ids as a schema `enum` means the model literally cannot hallucinate
a match; a second model judges the same choice and disagreement is surfaced as
`needs_review`, not resolved by trusting either one.

Runtime facts (verified live 08/30/2026, Ollama 0.33.1, RTX 4060 Ti 16 GB):
  - gpt-oss:20b with `think: false` returns EMPTY content (it emits into the
    reasoning channel and stops); `think: "low"` returns the schema-valid JSON.
  - gemma4:12b needs no `think` key.
  - Tool-result messages use `tool_name` (not `tool_call_id`) — not used here,
    noted so the next tool-using caller does not relearn it.

Env:
  LOCAL_LLM_URL       base URL (default http://localhost:11434)
  LOCAL_LLM_MODEL     primary model tag (default gpt-oss:20b)
  LOCAL_LLM_JUDGE     judge model tag (default gemma4:12b)
  LOCAL_LLM_DISABLED  "1" → callers must skip the LLM band (CI / cloud runners
                      with no Ollama). `is_disabled()` is the single check.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Sequence

import requests
from jsonschema import Draft202012Validator, ValidationError

from ingest.lib.api_usage import log_api_usage

DEFAULT_URL = "http://localhost:11434"
DEFAULT_MODEL = "gpt-oss:20b"
DEFAULT_JUDGE = "gemma4:12b"
DEFAULT_TIMEOUT_S = 300

# Per-model-family `think` default. Keyed on the tag prefix before ":".
# gpt-oss MUST think (see module docstring); everything else omits the key.
THINK_BY_FAMILY: dict[str, str | bool] = {"gpt-oss": "low"}


class LocalLLMError(RuntimeError):
    """Base for every failure raised by this module."""


class LocalLLMUnavailable(LocalLLMError):
    """Ollama is unreachable or the requested model is not pulled."""


class LocalLLMSchemaError(LocalLLMError):
    """The model's reply was empty, not JSON, or failed schema validation."""


@dataclass
class _Usage:
    """Duck-typed usage block for `log_api_usage` (mirrors the Anthropic shape)."""

    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


def is_disabled() -> bool:
    return os.environ.get("LOCAL_LLM_DISABLED") == "1"


def _family(model: str) -> str:
    return model.split(":", 1)[0]


def default_think(model: str) -> str | bool | None:
    return THINK_BY_FAMILY.get(_family(model))


class OllamaClient:
    """Thin, synchronous client for one model on one Ollama server."""

    def __init__(
        self,
        model: str | None = None,
        *,
        base_url: str | None = None,
        think: str | bool | None = None,
        timeout_s: int = DEFAULT_TIMEOUT_S,
        call_type: str = "ingest_local_llm",
    ) -> None:
        self.model = model or os.environ.get("LOCAL_LLM_MODEL", DEFAULT_MODEL)
        self.base_url = (base_url or os.environ.get("LOCAL_LLM_URL", DEFAULT_URL)).rstrip("/")
        self.think = think if think is not None else default_think(self.model)
        self.timeout_s = timeout_s
        self.call_type = call_type

    # ── preflight ────────────────────────────────────────────────────────────

    def available_models(self) -> list[str]:
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=10)
            resp.raise_for_status()
        except requests.RequestException as e:
            raise LocalLLMUnavailable(
                f"Ollama not reachable at {self.base_url} ({type(e).__name__}: {e}). "
                "Is `ollama serve` running? On a runner without Ollama set LOCAL_LLM_DISABLED=1."
            ) from e
        return [m.get("name", "") for m in resp.json().get("models", [])]

    def ensure_model(self) -> None:
        names = self.available_models()
        if self.model not in names:
            raise LocalLLMUnavailable(
                f"model {self.model!r} is not pulled on {self.base_url} "
                f"(have: {', '.join(names) or 'none'}). Run: ollama pull {self.model}"
            )

    # ── core call ────────────────────────────────────────────────────────────

    def chat_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        temperature: float = 0.0,
        retries: int = 1,
        pack_id: str | None = None,
    ) -> dict[str, Any]:
        """One schema-constrained chat turn → validated dict. Raises on any failure.

        `retries` re-asks once with the validation error appended to the user
        message — enough to recover a truncated brace, not enough to loop.
        """
        validator = Draft202012Validator(schema)
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        last_err: Exception | None = None
        for attempt in range(retries + 1):
            payload: dict[str, Any] = {
                "model": self.model,
                "messages": messages,
                "stream": False,
                "format": schema,
                "options": {"temperature": temperature},
            }
            if self.think is not None:
                payload["think"] = self.think
            t0 = time.monotonic()
            try:
                resp = requests.post(f"{self.base_url}/api/chat", json=payload, timeout=self.timeout_s)
                resp.raise_for_status()
            except requests.RequestException as e:
                raise LocalLLMUnavailable(
                    f"{self.model}: /api/chat failed ({type(e).__name__}: {e})"
                ) from e
            data = resp.json()
            if "error" in data:
                raise LocalLLMError(f"{self.model}: Ollama error: {data['error']}")
            usage = _Usage(
                input_tokens=int(data.get("prompt_eval_count") or 0),
                output_tokens=int(data.get("eval_count") or 0),
            )
            log_api_usage(model=self.model, call_type=self.call_type, usage=usage, pack_id=pack_id)
            content = (data.get("message") or {}).get("content") or ""
            elapsed = time.monotonic() - t0
            try:
                if not content.strip():
                    raise LocalLLMSchemaError(
                        f"{self.model}: empty content (think={self.think!r}, {elapsed:.1f}s). "
                        "gpt-oss needs think='low' — see ingest/lib/local_llm.py."
                    )
                parsed = json.loads(content)
                validator.validate(parsed)
                return parsed
            except (json.JSONDecodeError, ValidationError, LocalLLMSchemaError) as e:
                last_err = e
                if attempt < retries:
                    messages = messages + [
                        {"role": "assistant", "content": content},
                        {
                            "role": "user",
                            "content": (
                                "Your previous reply did not satisfy the required JSON schema: "
                                f"{getattr(e, 'message', str(e))[:300]}. Reply again with ONLY the JSON object."
                            ),
                        },
                    ]
                    continue
        raise LocalLLMSchemaError(
            f"{self.model}: schema-invalid reply after {retries + 1} attempt(s): {last_err}"
        )


# ── closed-set selection ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class Candidate:
    id: str
    text: str


@dataclass
class ChoiceResult:
    choice: str | None  # candidate id, or None for "none"
    confidence: float
    reason: str
    model: str
    raw: dict[str, Any] = field(default_factory=dict)


NONE_ID = "none"


def choice_schema(candidate_ids: Sequence[str]) -> dict[str, Any]:
    ids = list(candidate_ids)
    if NONE_ID in ids:
        raise ValueError(f"candidate id {NONE_ID!r} is reserved")
    return {
        "type": "object",
        "properties": {
            "choice": {"type": "string", "enum": ids + [NONE_ID]},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reason": {"type": "string"},
        },
        "required": ["choice", "confidence", "reason"],
        "additionalProperties": False,
    }


_CHOICE_SYSTEM = (
    "You are a careful records clerk. You will be shown a QUERY record and a short list of "
    "CANDIDATE records. Pick the ONE candidate that refers to the same real-world entity as the "
    "query, or answer \"none\" if no candidate does. Prefer \"none\" over a guess: a wrong match "
    "is worse than no match. Use only the text shown; do not rely on outside knowledge. "
    "Reply with JSON only."
)


def closed_set_choice(
    client: OllamaClient,
    *,
    task: str,
    query: str,
    candidates: Sequence[Candidate],
    pack_id: str | None = None,
) -> ChoiceResult:
    """Ask `client` to pick one of `candidates` (or none) for `query`."""
    if not candidates:
        return ChoiceResult(choice=None, confidence=1.0, reason="no candidates offered", model=client.model)
    lines = [f"TASK: {task}", "", f"QUERY: {query}", "", "CANDIDATES:"]
    lines += [f"{c.id}: {c.text}" for c in candidates]
    lines.append("")
    lines.append('Answer with {"choice": <candidate id or "none">, "confidence": 0..1, "reason": <one sentence>}.')
    reply = client.chat_json(
        system=_CHOICE_SYSTEM,
        user="\n".join(lines),
        schema=choice_schema([c.id for c in candidates]),
        pack_id=pack_id,
    )
    choice = reply["choice"]
    return ChoiceResult(
        choice=None if choice == NONE_ID else choice,
        confidence=float(reply["confidence"]),
        reason=str(reply["reason"]),
        model=client.model,
        raw=reply,
    )


@dataclass
class JudgedChoice:
    primary: ChoiceResult
    judge: ChoiceResult | None
    agree: bool

    @property
    def accepted(self) -> str | None:
        """The candidate id only when both models chose the same non-none id."""
        if self.judge is None or not self.agree:
            return None
        return self.primary.choice


def judged_choice(
    primary: OllamaClient,
    judge: OllamaClient | None,
    *,
    task: str,
    query: str,
    candidates: Sequence[Candidate],
    pack_id: str | None = None,
) -> JudgedChoice:
    """Primary picks; judge independently picks; `accepted` only on agreement.

    Two "none" answers also count as agreement (agree=True, accepted=None) — the
    caller records that as a confident non-match, distinct from needs_review.
    """
    p = closed_set_choice(primary, task=task, query=query, candidates=candidates, pack_id=pack_id)
    if judge is None:
        return JudgedChoice(primary=p, judge=None, agree=False)
    j = closed_set_choice(judge, task=task, query=query, candidates=candidates, pack_id=pack_id)
    return JudgedChoice(primary=p, judge=j, agree=(p.choice == j.choice))


def make_clients(
    *,
    primary_model: str | None = None,
    judge_model: str | None = None,
    call_type: str = "ingest_local_llm",
) -> tuple[OllamaClient, OllamaClient]:
    """Primary + judge clients from env, both preflighted. Raises LocalLLMUnavailable."""
    primary = OllamaClient(primary_model, call_type=call_type)
    judge = OllamaClient(judge_model or os.environ.get("LOCAL_LLM_JUDGE", DEFAULT_JUDGE), call_type=call_type)
    primary.ensure_model()
    judge.ensure_model()
    return primary, judge
