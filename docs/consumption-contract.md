# SWFL Intelligence Lake — Consumption Contract (v1.1)

> The protocol an agent follows when consuming the SWFL Intelligence Lake. Paste the
> relevant parts into a Project's Custom Instructions (primary-trust invocation).
> Companion to `brain-url-spec-v1.md`, which defines the payload format.

## The core rule: pointer-not-payload

To prevent model hallucination and stale-memory shadowing, an agent interacting with the
SWFL Intelligence Lake MUST follow this protocol.

### 1. Mandatory start-of-chat fetch

Never use lake data from memory, project files, or prior messages. At the start of every
conversation, fetch the Master Index fresh:

```
https://brain-platform-amber.vercel.app/api/b/master
```

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
