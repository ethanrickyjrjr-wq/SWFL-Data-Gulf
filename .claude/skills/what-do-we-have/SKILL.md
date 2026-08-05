---
name: what-do-we-have
description: Use BEFORE building anything, before answering "do we have X", before writing a new doc/spec/script, and before concluding we lack a capability, dataset, or piece of research. Searches the complete map of all 1,534 documents in this repo — including _RESEARCH/, which is gitignored and therefore INVISIBLE to every repo-wide Grep, so "my search found nothing" is NOT evidence of absence. Triggers on "do we have", "is there research on", "have we already", "did we build", "before I build", "I'll create a new", "I couldn't find anything about".
allowed-tools: Read Grep Glob
---

# What do we already have?

You are about to build, answer, or declare something absent. **The answer is very often already
written and already paid for.** This skill exists because that keeps not happening.

## The one fact that changes your search

**`_RESEARCH/` is gitignored. A repo-wide `Grep` CANNOT see any of its 80 files.** Neither can
`Glob` in the normal case. So the sentence *"I searched and found nothing, so we don't have it"* is
**invalid** in this repo unless you searched `INDEX.md` below or passed `path=_RESEARCH` explicitly.

Measured 08/05/2026: of 1,534 docs, **240 have zero inbound references** — nothing in the repo
points at them. They are unreachable except through this index.

## How to use it

`INDEX.md` in this skill directory lists **every** document — path, title, and a one-line hook —
grouped by area. It is ~366KB, so **GREP IT, DO NOT READ IT WHOLE**:

```
Grep pattern="<your topic>" path=".claude/skills/what-do-we-have/INDEX.md" output_mode="content"
```

Search several ways before giving up — the vocabulary in a two-month-old handoff is rarely the
vocabulary in your prompt. Try the domain noun (`baths`, `comps`, `egress`), the vendor
(`apify`, `steadyapi`, `census`), and the shape (`handoff`, `audit`, `spec`, `postmortem`).

Then **open the file you found and read it** before writing anything new.

## Markers in the index

- **[ORPHAN]** — nothing in the repo points at this file. It is invisible unless you arrive through
  this index. It is also a **deletion candidate**: if it is dead, propose removing it (operator
  sign-off required — RULE 1). Dead docs are not neutral; they are the noise that buries the live ones.
- **[weak]** — reachable only by bare filename, which in practice leads nowhere.

## Where the authoritative maps live

This index tells you a document EXISTS. These tell you which one WINS — always prefer them:

- `docs/standards/data-roots.md` — which table/root feeds any SWFL number. One root per concept.
- `_RESEARCH/INDEX.md` — the curated research index. Its own rule: *a research file not listed in
  this index does not exist.* 18 files are currently missing from it, which is why the generated
  index you are reading exists alongside it rather than instead of it.
- `docs/standards/repo-inventory-audit.md` — sources, free-text columns, LLM call sites.
- `ingest/cadence_registry.yaml` — what runs when, and `source_ceiling`: what a source was proven to
  carry that we never pulled.

## Keeping it true

`INDEX.md` is **generated — never edit it by hand.** A map a human must remember to update is a map
that lies, and every hand-maintained index in this repo has gone stale.

```
node scripts/doc-index.mjs          # regenerate this index
node scripts/doc-reachability.mjs   # re-measure orphans; --check is a ratchet
```
