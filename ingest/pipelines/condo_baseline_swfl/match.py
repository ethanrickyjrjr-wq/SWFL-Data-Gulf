"""Association entity resolution: DBPR SIRS filings ↔ county building baseline.

Ladder (per DBPR filing, county-scoped):
  1. exact          normalized names equal
  2. token_overlap  one candidate scores ≥ DETERMINISTIC_ACCEPT with the runner-up
                    ≤ RUNNER_UP_MAX (unambiguous)
  3. llm_tiebreak   ≥1 candidate but ambiguous → closed-set choice by the primary
                    model, independently judged by a second model; ACCEPTED ONLY
                    ON AGREEMENT
  4. needs_review   the two models disagreed (or the LLM band is disabled/failed)
  5. unmatched      no candidate cleared CANDIDATE_MIN — nothing to choose from,
                    the model is never asked

Rule inherited from ingest/pipelines/community_profiles/build_master_list.py:
"a null county is honest, a wrong one is an invented fact". Here the analogue is
that a NULL match is honest; the model cannot emit a name that was not offered
(schema enum), and one model alone never decides.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Iterable

from ingest.lib.local_llm import (
    Candidate,
    LocalLLMError,
    OllamaClient,
    judged_choice,
)

from .constants import (
    CANDIDATE_MIN,
    DETERMINISTIC_ACCEPT,
    LLM_TASK,
    MAX_CANDIDATES,
    PACK_ID,
    RUNNER_UP_MAX,
)

# Tokens that carry no identity. Deliberately narrow: "AT", "OF THE", phase and
# building numbers are all kept because they distinguish real associations
# ("CAPISTRANO AT GREY OAKS" vs "GREY OAKS").
_STOP = {
    "A", "AN", "THE", "OF",
    "CONDO", "CONDOS", "CONDOMINIUM", "CONDOMINIUMS", "CONDOMINUM",
    "ASSOCIATION", "ASSOC", "ASSN", "INC", "INCORPORATED",
    "COOPERATIVE", "CO-OP", "COOP",
}
_NON_ALNUM = re.compile(r"[^A-Z0-9 ]+")


def normalize_assoc_name(name: str | None) -> str | None:
    if not name:
        return None
    s = name.upper().replace("&", " AND ")
    s = _NON_ALNUM.sub(" ", s)
    toks = [t for t in s.split() if t not in _STOP]
    return " ".join(toks) or None


def _tokens(norm: str | None) -> frozenset[str]:
    return frozenset(norm.split()) if norm else frozenset()


def jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


# ── Index of building associations ──────────────────────────────────────────


@dataclass
class AssocEntry:
    norm: str
    county: str
    raw_names: set[str] = field(default_factory=set)
    addresses: set[str] = field(default_factory=set)
    cities: set[str] = field(default_factory=set)
    zips: set[str] = field(default_factory=set)
    building_count: int = 0
    tokens: frozenset[str] = frozenset()

    def describe(self) -> str:
        name = sorted(self.raw_names)[0] if self.raw_names else self.norm
        addr = "; ".join(sorted(a for a in self.addresses if a)[:2])
        city = ", ".join(sorted(c for c in self.cities if c))
        zips = ", ".join(sorted(z for z in self.zips if z))
        bits = [name]
        if addr:
            bits.append(addr)
        if city:
            bits.append(city)
        if zips:
            bits.append(f"zip {zips}")
        bits.append(f"{self.building_count} building(s)")
        return " | ".join(bits)


def build_assoc_index(buildings: Iterable[dict[str, Any]]) -> dict[str, dict[str, AssocEntry]]:
    """{county: {assoc_name_norm: AssocEntry}} from normalized building rows."""
    idx: dict[str, dict[str, AssocEntry]] = {}
    for b in buildings:
        norm = b.get("assoc_name_norm")
        if not norm:
            continue
        county = b["county"]
        e = idx.setdefault(county, {}).get(norm)
        if e is None:
            e = AssocEntry(norm=norm, county=county, tokens=_tokens(norm))
            idx[county][norm] = e
        if b.get("association_name"):
            e.raw_names.add(b["association_name"])
        if b.get("street_address"):
            e.addresses.add(b["street_address"])
        if b.get("city"):
            e.cities.add(b["city"])
        if b.get("zip"):
            e.zips.add(str(b["zip"]))
        e.building_count += 1
    return idx


# ── Candidate scoring ────────────────────────────────────────────────────────


def score_candidates(
    query_norms: Iterable[str | None], entries: dict[str, AssocEntry]
) -> list[tuple[AssocEntry, float]]:
    """Best Jaccard over every query variant (association name, project name)."""
    qtoks = [_tokens(q) for q in query_norms if q]
    if not qtoks:
        return []
    scored: list[tuple[AssocEntry, float]] = []
    for e in entries.values():
        s = max(jaccard(q, e.tokens) for q in qtoks)
        if s >= CANDIDATE_MIN:
            scored.append((e, s))
    scored.sort(key=lambda t: (-t[1], t[0].norm))
    return scored[:MAX_CANDIDATES]


# ── Matching ─────────────────────────────────────────────────────────────────


@dataclass
class MatchStats:
    exact: int = 0
    token_overlap: int = 0
    llm_tiebreak: int = 0
    llm_agreed_none: int = 0
    needs_review: int = 0
    unmatched: int = 0
    llm_calls: int = 0
    llm_errors: int = 0

    def as_dict(self) -> dict[str, int]:
        return self.__dict__.copy()


def _query_text(r: dict[str, Any]) -> str:
    assoc = (r.get("association_name") or "").strip()
    proj = (r.get("project_name") or "").strip()
    bits = [assoc]
    if proj and proj.upper() != assoc.upper():
        bits.append(f"project: {proj}")
    loc = " ".join(str(x) for x in (r.get("city"), r.get("zip")) if x)
    if loc:
        bits.append(loc)
    return " | ".join(bits)


def match_filings(
    filings: Iterable[dict[str, Any]],
    index: dict[str, dict[str, AssocEntry]],
    *,
    primary: OllamaClient | None,
    judge: OllamaClient | None,
    matched_at: datetime,
) -> tuple[list[dict[str, Any]], MatchStats]:
    """One xref row per DBPR filing. `primary=None` disables the LLM band."""
    stats = MatchStats()
    out: list[dict[str, Any]] = []
    for r in filings:
        county = r["county_normalized"]
        entries = index.get(county, {})
        q_assoc = normalize_assoc_name(r.get("association_name"))
        q_proj = normalize_assoc_name(r.get("project_name"))
        row: dict[str, Any] = {
            "dbpr_row_hash": r["row_hash"],
            "database_period": r["database_period"],
            "county": county,
            "dbpr_association_name": r.get("association_name"),
            "dbpr_project_name": r.get("project_name"),
            "dbpr_query_norm": q_assoc or q_proj,
            "assoc_name_norm": None,
            "match_method": "unmatched",
            "confidence": 0.0,
            "candidates": None,
            "primary_model": None,
            "judge_model": None,
            "reason": None,
            "matched_at": matched_at,
        }

        # 1. exact
        hit = entries.get(q_assoc) if q_assoc else None
        if hit is None and q_proj:
            hit = entries.get(q_proj)
        if hit is not None:
            row.update(assoc_name_norm=hit.norm, match_method="exact", confidence=1.0,
                       reason="normalized names equal")
            stats.exact += 1
            out.append(row)
            continue

        scored = score_candidates([q_assoc, q_proj], entries)
        row["candidates"] = json.dumps([{"norm": e.norm, "score": round(s, 3)} for e, s in scored])
        if not scored:
            stats.unmatched += 1
            out.append(row)
            continue

        # 2. unambiguous token overlap
        top_e, top_s = scored[0]
        runner = scored[1][1] if len(scored) > 1 else 0.0
        if top_s >= DETERMINISTIC_ACCEPT and runner <= RUNNER_UP_MAX:
            row.update(assoc_name_norm=top_e.norm, match_method="token_overlap",
                       confidence=round(top_s, 3), reason=f"jaccard {top_s:.2f}, runner-up {runner:.2f}")
            stats.token_overlap += 1
            out.append(row)
            continue

        # 3. LLM closed-set tiebreak, judged
        if primary is None:
            row.update(match_method="needs_review", reason="ambiguous; LLM band disabled")
            stats.needs_review += 1
            out.append(row)
            continue
        cands = [Candidate(id=f"c{i + 1}", text=e.describe()) for i, (e, _) in enumerate(scored)]
        by_id = {f"c{i + 1}": e for i, (e, _) in enumerate(scored)}
        try:
            jc = judged_choice(primary, judge, task=LLM_TASK, query=_query_text(r),
                               candidates=cands, pack_id=PACK_ID)
            stats.llm_calls += 2 if judge is not None else 1
        except LocalLLMError as e:
            stats.llm_errors += 1
            stats.needs_review += 1
            row.update(match_method="needs_review", reason=f"LLM error: {e}"[:500])
            out.append(row)
            continue
        row["primary_model"] = jc.primary.model
        row["judge_model"] = jc.judge.model if jc.judge else None
        judge_reason = jc.judge.reason if jc.judge else "no judge"
        if jc.agree and jc.primary.choice is None:
            # both said none — a confident non-match, not a review item
            row.update(match_method="unmatched", confidence=jc.primary.confidence,
                       reason=f"both models chose none: {jc.primary.reason}"[:500])
            stats.llm_agreed_none += 1
            stats.unmatched += 1
        elif jc.accepted:
            conf = min(jc.primary.confidence, jc.judge.confidence if jc.judge else 1.0)
            row.update(assoc_name_norm=by_id[jc.accepted].norm, match_method="llm_tiebreak",
                       confidence=round(conf, 3),
                       reason=f"primary: {jc.primary.reason} / judge: {judge_reason}"[:500])
            stats.llm_tiebreak += 1
        else:
            p = jc.primary.choice or "none"
            j = (jc.judge.choice if jc.judge else None) or "none"
            row.update(match_method="needs_review",
                       reason=f"models disagree: primary={p} ({jc.primary.reason}) "
                              f"judge={j} ({judge_reason})"[:500])
            stats.needs_review += 1
        out.append(row)
    return out, stats
