"""Anthropic spend metering + hard per-run budget for ingest pipelines.

Mirrors refinery/agents/anthropic.mts (the TS logger the ops /spend page reads):
same public.api_usage_log table, same $/MTok rates, same cache pricing. Adds the
web-search surcharge the TS side doesn't need yet.

Rates source: platform.claude.com/docs/en/about-claude/pricing — token rates
verified via crawl4ai 07/01/2026 (TS mirror), web-search "$10 per 1,000
searches" verified via crawl4ai 07/05/2026.

Two jobs:
  log_api_usage(...)  — one ledger row per real API call. NEVER throws: a
                        logging failure must not break the pipeline run.
  RunBudget(max_usd)  — hard cost ceiling for one pipeline run. `charge()`
                        raises RunBudgetExceeded the moment cumulative cost
                        crosses the cap → the run dies loudly (GHA red, ops
                        red) instead of silently draining the account.
                        Operator decree 07/05/2026: "X should cost X per run;
                        if it goes over we shut it down."
"""
from __future__ import annotations

import os
import re
from typing import Any

import psycopg

# $/MTok — MUST stay in lockstep with RATES in refinery/agents/anthropic.mts.
RATES: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6": {"in": 3.0, "out": 15.0},
    "claude-haiku-4-5": {"in": 1.0, "out": 5.0},
    "claude-opus-4-8": {"in": 5.0, "out": 25.0},
}
CACHE_READ_FRACTION = 0.1  # 10% of base input rate
CACHE_WRITE_PREMIUM = 1.25  # 25% premium on input rate
SEARCH_RATE_USD = 0.01  # $10 per 1,000 searches (verified 07/05/2026)


class RunBudgetExceeded(RuntimeError):
    """Cumulative run cost crossed the hard cap — refuse all further API calls."""


def _base_model_id(model: str) -> str:
    """Strip a trailing -YYYYMMDD snapshot date so aliases hit the rate table."""
    return re.sub(r"-\d{8}$", "", model)


def compute_cost_usd(model: str, usage: Any, searches: int = 0) -> float:
    """Pure cost calculator. Unrecognized model -> tokens price at 0 (the row
    still logs for manual reconciliation — never invent a rate), but the
    search surcharge always counts."""
    rate = RATES.get(model) or RATES.get(_base_model_id(model))
    in_tok = getattr(usage, "input_tokens", 0) or 0
    out_tok = getattr(usage, "output_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cost = searches * SEARCH_RATE_USD
    if rate:
        cost += (
            (in_tok / 1_000_000) * rate["in"]
            + (out_tok / 1_000_000) * rate["out"]
            + (cache_read / 1_000_000) * rate["in"] * CACHE_READ_FRACTION
            + (cache_write / 1_000_000) * rate["in"] * CACHE_WRITE_PREMIUM
        )
    return cost


def search_count(usage: Any) -> int:
    """web_search_requests from a Messages API usage block (0 when absent)."""
    stu = getattr(usage, "server_tool_use", None)
    return int(getattr(stu, "web_search_requests", 0) or 0)


_INSERT_SQL = """
INSERT INTO public.api_usage_log
  (model, call_type, pack_id, input_tokens, output_tokens,
   cache_read_tokens, cache_creation_tokens, cost_usd, env)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
"""


def log_api_usage(
    model: str,
    call_type: str,
    usage: Any,
    pack_id: str | None = None,
    searches: int = 0,
) -> float:
    """Insert one ledger row; returns the computed cost (for RunBudget.charge).
    Never throws — prints and returns the cost on any DB failure."""
    cost = compute_cost_usd(model, usage, searches)
    if os.environ.get("SKIP_USAGE_LOG") == "1":
        return cost
    conn_str = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if not conn_str:
        print(f"[api-usage] no DB creds in env — UNLOGGED ${cost:.4f} ({call_type})")
        return cost
    try:
        with psycopg.connect(conn_str, connect_timeout=15) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    _INSERT_SQL,
                    (
                        model,
                        call_type,
                        pack_id,
                        getattr(usage, "input_tokens", 0) or 0,
                        getattr(usage, "output_tokens", 0) or 0,
                        getattr(usage, "cache_read_input_tokens", 0) or 0,
                        getattr(usage, "cache_creation_input_tokens", 0) or 0,
                        round(cost, 6),
                        "production" if os.environ.get("GITHUB_ACTIONS") == "true" else "development",
                    ),
                )
            conn.commit()
    except Exception as e:  # noqa: BLE001 — logging must never kill the run
        print(f"[api-usage] ledger insert failed ({call_type}): {e}")
    return cost


class RunBudget:
    """Hard dollar ceiling for one pipeline run.

    cap precedence: explicit env var (per-pipeline override) > default_usd.
    Caps are STRUCTURE-DERIVED ceilings (call count x per-call bound, ~2x the
    expected run cost) — crossing one means the run is misbehaving, not busy.
    """

    def __init__(self, label: str, default_usd: float, env_var: str | None = None):
        self.label = label
        raw = os.environ.get(env_var) if env_var else None
        try:
            self.max_usd = float(raw) if raw else default_usd
        except ValueError:
            self.max_usd = default_usd
        self.spent_usd = 0.0

    def charge(self, cost_usd: float) -> None:
        """Record a call's cost; hard-stop the run the moment the cap breaks."""
        self.spent_usd += cost_usd
        if self.spent_usd > self.max_usd:
            raise RunBudgetExceeded(
                f"{self.label}: run spend ${self.spent_usd:.2f} exceeded the "
                f"${self.max_usd:.2f} cap — shutting down (operator budget "
                "guard, 07/05/2026). Raise the cap via env only if the higher "
                "spend is intended."
            )
