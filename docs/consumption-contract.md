# SWFL Intelligence Lake — Consumption Contract (v1.2)

> The protocol an agent follows when consuming the SWFL Intelligence Lake. Paste the
> block below into a Project's Custom Instructions (primary-trust invocation).
> Companion to `brain-url-spec-v1.md`, which defines the payload format.

## Paste this into Project Custom Instructions

A bare URL in the instructions is **not enough** — Claude's Project layer caches
fetched content, so sessions silently answer from a stale copy (the API itself sends
`no-store`; the cache is consumption-side and HTTP headers can't reach it). This block
is what forces a live read and makes staleness self-evident. Copy it verbatim:

```text
SWFL Intelligence Lake — data protocol (always follow):

1. FETCH FRESH. Before answering any franchise or CRE question, fetch
   https://brain-platform-amber.vercel.app/api/b/master?v=2 in THIS conversation.
   Never answer from memory, project knowledge, earlier messages, or a cached
   copy — only from a fetch made in this conversation.
2. PROVE IT'S LIVE. The payload frontmatter carries a `freshness_token`
   (format SWFL-7421-v{n}-{YYYYMMDD}). Quote it verbatim in your first
   response. If you cannot fetch, say so — never answer from stale context.
3. ROUTE, DON'T GUESS. The master index is a directory. When it gives a
   count but points to a sub-brain for the names/detail, fetch that sub-brain
   (franchise-outcomes, cre-swfl) before answering. Do not infer the detail.
4. READ RATES AS WRITTEN. Survival rates are stated explicitly and are always
   over RESOLVED loans. Never recompute a rate from loan counts; never treat a
   "total loans" number as a denominator.
```

Why each line earns its place: (1) defeats the consumption-side cache — the actual
failure mode observed in the wild; (2) makes a stale read visible — the user can eyeball
the quoted token; (3) stops the model answering record-level questions from master-only
aggregates; (4) closes the inference gap that made "0% survival" get recomputed as 50%.

## The core rule: pointer-not-payload

To prevent model hallucination and stale-memory shadowing, an agent interacting with the
SWFL Intelligence Lake MUST follow this protocol.

### 1. Mandatory start-of-chat fetch

Never use lake data from memory, project files, or prior messages. At the start of every
conversation, fetch the Master Index fresh:

```
https://brain-platform-amber.vercel.app/api/b/master?v=2
```

(The `?v=2` query string is a Claude-Projects cache-bust — Vercel's route ignores
query params and serves the same payload, but Claude's consumption-side cache keys on
the full URL string, so changing it forces a live re-fetch in stale Projects. Bump it
again if the cache traps you again later.)

### 2. The freshness guard (freshness_token)

Every brain payload carries the same freshness token in two places (see
`brain-url-spec-v1.md` parts 0 and 1):

- **`freshness_token` frontmatter field** — the authoritative value. This is what an
  agent quotes. It is YAML, so it survives HTML→markdown conversion (e.g. WebFetch) and
  lands in the model's high-attention context.
- **Leading `<!-- FRESHNESS: v{n} | Token: ... -->` HTML comment** — a secondary
  human/`curl` check. Note that WebFetch and similar tools **strip HTML comments**, so
  this copy is not always visible to an agent — do not rely on it; rely on the field.

The token format is `SWFL-7421-v{version}-{YYYYMMDD}` (`7421` is the fixed SWFL-lake
constant). On the first response, **quote the `freshness_token`** to prove a live fetch.
If you find `SWFL-7421-v2-...` when the work expects `v4`, the payload is stale — re-fetch
before proceeding.

### 3. Routing over retrieval

If the Master Index gives aggregate stats but points to a sub-brain for names/narrative,
fetch the sub-brain URL immediately. Do not guess.

- Franchise Outcomes: `https://brain-platform-amber.vercel.app/api/b/franchise-outcomes`
- CRE SWFL Corridors: `https://brain-platform-amber.vercel.app/api/b/cre-swfl`

### 4. Zero-inference hardening

- Denominator for survival is always `/ resolved loans`.
- Survival rates must be read as explicit percentages from the payload
  (e.g. "13 brands at 0% survival") — never inferred from charge-off counts vs. total
  loans.

## Verification question (clean-room check)

> "Fetch the master index and sub-brains. How many franchise brands currently have a 0%
> survival rate, and which ones were recovered by the 'Round 2' explicit rate fix?"

Expected, as of the v4/v5/v2 state: **13** zero-survival brands; the four recovered by the
Round 2 explicit-rate fix (resolved-loan count < total-loan count) are **Zoom Room,
4Ever Young, Aire Serv, and BURGERIM**.
