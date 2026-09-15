# Wiki Index

Compiled knowledge for this repo, mirroring the pattern on Ricky's Chief of Staff desk
(`chief-of-staff/wiki/`, a sister repo) — read the page, not the raw run logs. Bootstrapped
2026-09-15 from a pipeline-health investigation branch and an MCP/diversification session done
from the Chief of Staff side. `LOG.md` has the history; `_TEMPLATE.md` has the page shape.

This repo's own `_ASSISTANT/*-HANDOFF.md` files are dated, one-off task handoffs — this wiki is
the compiled, cross-referenced, living version of the parts worth keeping past one task.

## Pages

- [Pipeline health](pipeline-health.md) — what breaks in the 113 GitHub Actions workflows and why:
  SteadyAPI out on Ricky's word, listing spine reverts to the proven scrape source, Anthropic key
  needs credit, master brain unrebuilt since 08-19, three ghost registry entries, Fedora's job is
  the residential-IP runner not the scheduler, 75 recorded ceilings are the more-data list · active
  · 2026-09-15
- [MCP connector](mcp-connector.md) — `swfl_fetch`/`swfl_reconcile` were already live and
  sophisticated, just invisible; PR #204 adds a public `/connect` page and a 15/month keyless usage
  cap, not yet merged; Carbon Arc comparison (Lenses + MCP + SDK, three doors not one) · active ·
  2026-09-15
- [Diversification](diversification.md) — five brains with a buyer outside real estate; condo SIRS
  compliance scoped as the first target (row-level data confirmed in `data_lake.dbpr_sirs_submissions`,
  positive-signal-only caveat); waiting on Ricky's free-vs-gated call · active · 2026-09-15

## Related (sister repo)

Ricky's Chief of Staff desk (`github.com/ethanrickyjrjr-wq/chief-of-staff`) holds the operation-wide
wiki, including the exhaustive version of pipeline health, the full Carbon Arc site crawl, and
[Florida public records](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/florida-public-records.md) /
[SWFL Data Gulf](https://github.com/ethanrickyjrjr-wq/chief-of-staff/blob/master/wiki/swfl-data-gulf.md) —
read those for the business-decision layer (pricing, buyer asks, revenue). This wiki holds the
engineering/product layer specific to this codebase.
