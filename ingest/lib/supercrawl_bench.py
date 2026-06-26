"""Prove-it benchmark for supercrawl — runs old-vs-super on raw:// fixtures (offline).

Run: python -m ingest.lib.supercrawl_bench
Tiers: (1) deterministic table capture, (2) fit-vs-raw markdown denoise, (3) concurrency safety.
Tier 4 (live Crexi yield A/B from a home IP/VPN) is Phase 2 — not here.

This is a local battle-test, NOT a CI gate (it launches a real headless browser).
"""
from ingest.lib.supercrawl import SuperConfig, fetch_many_super, fetch_super, fetch_tables

_TABLE = (
    "raw://<html><body><table><tr><th>City</th><th>PSF</th></tr>"
    "<tr><td>Estero</td><td>28</td></tr><tr><td>FMB</td><td>34</td></tr></table></body></html>"
)
_NOISY = (
    "raw://<html><body><nav>HOME ABOUT CONTACT NEWSLETTER SUBSCRIBE</nav>"
    "<article><h1>SWFL retail</h1><p>Asking rents firmed this quarter across Estero and Bonita.</p>"
    "<a href='https://x.test/a'>read more</a></article>"
    "<footer>(c) 2026 ads ads ads ads cookie consent privacy terms</footer></body></html>"
)


def tier1_tables() -> None:
    t = fetch_tables(_TABLE, score_threshold=1)
    print(
        f"[tier1] tables={len(t)} "
        f"headers={t[0].headers if t else None} rows={t[0].rows if t else None}"
    )


def tier2_fit_vs_raw() -> None:
    raw = fetch_super(_NOISY)
    fit = fetch_super(_NOISY, SuperConfig(fit_markdown=True))
    raw_len = len(raw.markdown)
    fit_len = len(fit.fit_markdown)
    body_kept = "SWFL retail" in (fit.fit_markdown or raw.markdown)
    print(
        f"[tier2] raw_md={raw_len}ch  fit_md={fit_len}ch  "
        f"reduction={1 - fit_len / max(1, raw_len):.0%}  body_kept={body_kept}"
    )


def tier3_concurrency() -> None:
    third = "raw://<html><body><h1>third page</h1><p>distinct fixture</p></body></html>"
    out = fetch_many_super([_TABLE, _NOISY, third], SuperConfig(monitor=True, concurrency=3))
    ok = sum(1 for v in out.values() if v.success)
    peak = [v.dispatch.get("peak_memory") for v in out.values() if v.dispatch]
    print(f"[tier3] urls={len(out)} ok={ok} dispatch_peak_memory={peak}")


if __name__ == "__main__":
    tier1_tables()
    tier2_fit_vs_raw()
    tier3_concurrency()
