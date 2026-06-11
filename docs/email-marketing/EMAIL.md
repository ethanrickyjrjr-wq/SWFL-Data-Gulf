# EMAIL.md — Governing Rules for the SWFL Data Gulf Daily Digest

**This file governs every email this system sends. It is the email equivalent of CLAUDE.md.**
**Never reorder sections. Never invent data. Never skip the log.**

---

## Rule 1 — READ THE PREV-DAY LOG FIRST

Before composing, read `email-logs/YYYY-MM-DD.json` from yesterday.
- If a story was `top_story: true` yesterday → downgrade to brief mention UNLESS it escalated (metric moved >5% or new development)
- If a metric was flagged as stale yesterday → re-check freshness today; if still stale, keep the caveat
- If yesterday had no log (first run or weekend skip) → build fresh with no dedup constraint

---

## Rule 2 — SECTIONS NEVER REORDER

Every issue follows this exact section order:

```
1. HEADER          — logo, date, issue number, freshness_token
2. TOP LINE        — Lee County market pulse (2-3 sentences, from master brain)
3. ZIP FOCUS       — 33908 + nearby ZIPs data table (33919, 33912, 33907, 33931, 33914)
4. LEE COUNTY      — county-wide snapshot (permits, economic activity, CRE)
5. CITY VOICES     — city-pulse signals (max 4 items, priority: breaking > transactions > development)
6. DELTA           — what changed since yesterday (or since last send if weekend gap)
7. HISTORICAL HOOK — one interesting past data point tied to something live today
8. FOOTER          — company info, unsubscribe, CAN-SPAM compliance
```

No section may be omitted except CITY VOICES (if no new signals) and DELTA (if first-ever send).

---

## Rule 3 — CITE EVERYTHING

Every data claim carries its source. No source in the payload → no claim.
Format: `[source]` inline or as a footnote. The freshness_token IS the source for lake data.

---

## Rule 4 — NO INVENTION

Never invent a number. If a ZIP has no data, say so — offer the next closest grain (county).
If a metric is stale beyond its tolerance window, label it `[STALE]` and state the last-updated date.

---

## Rule 5 — FLAG ESCALATION

If a metric moved >5% day-over-day vs the previous log: **bold it** in the email and note the delta.
If a metric crossed a threshold (e.g. DOM > 90 days, inventory up >20% MoM): flag it as a callout block.

---

## Rule 6 — ONE CTA

Maximum one call-to-action per email. Default CTA: `View full report → swfldatagulf.com/r/housing-swfl`
Premium CTA (if relevant breaking news): `See the full picture → swfldatagulf.com/r/master`

---

## Rule 7 — CHARTS ARE TABLES

Email clients block JavaScript. Never embed Recharts/React charts.
Use data tables for numbers. Use Mapbox static map PNG (pre-rendered) for geography.
Exception: pre-rendered PNG bar charts are allowed if the GHA builds them server-side.

---

## Rule 8 — SAVE THE LOG

After every successful send, write `email-logs/YYYY-MM-DD.json` with:
```json
{
  "date": "YYYY-MM-DD",
  "issue": 1,
  "subject": "...",
  "freshness_token": "...",
  "top_story": { "title": "...", "slug": "..." },
  "zip_metrics": { "33908": { "median_sale_price": 0, "dom": 0 }, ... },
  "signals_surfaced": ["...", "..."],
  "cta_url": "...",
  "send_status": "sent | skipped | error",
  "recipients": 1
}
```
This log is the only cross-day memory. If it doesn't exist, the system has no context.

---

## Rule 9 — CAN-SPAM COMPLIANCE (non-negotiable)

Footer must include:
- Physical mailing address
- Company name
- Unsubscribe link (one-click, functional)
- "You received this because..." context

Default footer identity:
```
Gulf Coast Intelligence Group, LLC
2201 McGregor Blvd, Suite 300 · Fort Myers, FL 33901
(239) 555-0147 · hello@swfldatagulf.com
Research Director: Marcus Reid

Data sourced from SWFL Data Gulf (swfldatagulf.com).
Unsubscribe | Privacy Policy
```

---

## Rule 10 — SEND WINDOW

Weekday sends: **6:00 AM ET** (GHA cron: `0 10 * * 1-5` UTC).
No sends on weekends — Saturday/Sunday data gaps are covered in Monday's DELTA section.
Holiday skips: if a GHA run is skipped, Monday covers the gap; no catch-up sends.
