# Product Brief

## What we're building

**SWFL Data Gulf** — a real-time analyst-grade data product for Southwest
Florida (Lee, Collier, Charlotte counties). Covers housing, commercial real
estate, building permits, traffic, tourism, hurricane risk, logistics, and
macro context. **Every number has a source citation. Nothing is invented.**

## How it's accessed

- **Through AI assistants** (Claude, ChatGPT, Cursor, etc.) via the MCP
  protocol — this is the inline widget surface.
- **Through a web app** — full report pages at `/r/{report_id}`.
- **Through a landing page** where new users install the integration.

## Who it's for

Analysts, investors, developers, and smart locals who want **real answers
about SWFL**. Not vibes, not guesses. They will come back weekly. They run
this on a second monitor.

## Design philosophy

> Make people go "wow, that's cool AND informative" at the same time.

Data should feel like it's **surfacing** — like something emerging from
deep water. Not bouncing, not flashy. **Deliberate, smooth, surgical.** The
most important insight hits first. The hierarchy is ruthless.

> What if a premium research firm had the soul of a great data visualization studio?

## Hard "do nots"

- Don't lead with filler. A traffic chart is not the hook.
- Don't look like a government data portal.
- Don't look like a tourist brochure.
- Don't use stock-chart cliches (red/green candles, ticker tape).
- Don't over-animate. Every animation must earn its place.

## Hard "dos"

- Let the data speak through the design.
- Make the hierarchy feel inevitable — the eye lands where it should.
- Use animation to **reveal insight**, not to decorate.
- Design for someone who will come back every week.

---

## Data shape — how components receive their data

Every report carries:

- **Direction** — `bullish` / `bearish` / `mixed` / `neutral`. This is the headline verdict.
- **Key metrics** — each with a value, trend direction, and source URL.
- **Drivers** — what's pushing the direction.
- **Caveats** — known limitations, data gaps.
- **Freshness token** — when this data was last computed.

### Canonical mock data (use this in every build)

When you need realistic placeholder content, use this verbatim. Don't invent
alternate numbers — all builds should reference a single example so work
composes coherently.

```json
{
  "id": "master",
  "direction": "mixed",
  "conclusion": "SWFL housing is cooling on demand metrics while supply tightens; commercial real estate diverges sharply by corridor with industrial outperforming office and retail.",
  "key_metrics": [
    {
      "label": "Median DOM, Lee single-family",
      "value": 51,
      "unit": "days",
      "trend": "up",
      "delta": "+6 vs prior month",
      "source_url": "https://www.leepa.org/"
    },
    {
      "label": "Cap rate, Lee multifamily",
      "value": 5.42,
      "unit": "%",
      "trend": "up",
      "delta": "+18 bps QoQ",
      "source_url": "https://www.leepa.org/"
    },
    {
      "label": "Building permits MTD, Lee",
      "value": 1247,
      "unit": "permits",
      "trend": "down",
      "delta": "-12% YoY",
      "source_url": "https://aca-prod.accela.com/LEECOUNTY/"
    },
    {
      "label": "Naples RevPAR",
      "value": 312,
      "unit": "USD",
      "trend": "up",
      "delta": "+4% YoY",
      "source_url": "https://floridarevenue.com/"
    },
    {
      "label": "Hurricane season probability",
      "value": 67,
      "unit": "%",
      "trend": "neutral",
      "delta": "vs 30-yr avg",
      "source_url": "https://www.noaa.gov/"
    }
  ],
  "drivers": [
    "Builder pipeline slowing — permits down 12% YoY across Lee while existing-home inventory rises.",
    "Industrial cap rates compressing on logistics corridors; office cap rates widening.",
    "Tourism strength holding NOI in Naples luxury segment despite cooler resi demand."
  ],
  "caveats": [
    "Cap rate sample size for Lee multifamily is small (n=12 transactions this quarter).",
    "FEMA NFIP claims data lags by ~45 days; flood-veto rules may shift on next refresh."
  ],
  "freshness_token": "SWFL-7421-v5-20260522"
}
```

### Scatter plot data shape

```json
{
  "points": [
    { "id": "north-naples",      "label": "North Naples",       "capRate": 6.8, "vacancy": 4.2, "absorption": 12400, "category": "A" },
    { "id": "estero",            "label": "Estero",             "capRate": 6.1, "vacancy": 5.8, "absorption": 9800,  "category": "B" },
    { "id": "downtown-fort-myers","label": "Downtown Ft. Myers","capRate": 7.4, "vacancy": 8.1, "absorption": 6200,  "category": "C" },
    { "id": "cape-coral",        "label": "Cape Coral",         "capRate": 6.9, "vacancy": 6.3, "absorption": 8100,  "category": "B" },
    { "id": "bonita-springs",    "label": "Bonita Springs",     "capRate": 5.9, "vacancy": 3.8, "absorption": 14200, "category": "A" },
    { "id": "immokalee",         "label": "Immokalee",          "capRate": 8.1, "vacancy": 11.2,"absorption": 3400,  "category": "D" },
    { "id": "marco-island",      "label": "Marco Island",       "capRate": 5.4, "vacancy": 2.9, "absorption": 9600,  "category": "A" },
    { "id": "lehigh-acres",      "label": "Lehigh Acres",       "capRate": 7.8, "vacancy": 9.4, "absorption": 4800,  "category": "C" }
  ]
}
```

### Verdict bars data shape

```json
{
  "sectors": [
    { "id": "commercial-re",  "label": "Commercial RE",  "magnitude": 0.62, "direction": "bullish"  },
    { "id": "housing",        "label": "Housing",        "magnitude": 0.38, "direction": "bearish"  },
    { "id": "hospitality",    "label": "Hospitality",    "magnitude": 0.71, "direction": "bullish"  },
    { "id": "environment",    "label": "Environment",    "magnitude": 0.45, "direction": "mixed"    },
    { "id": "infrastructure", "label": "Infrastructure", "magnitude": 0.53, "direction": "neutral"  }
  ]
}
```

### Metric cards data shape

```json
{
  "cards": [
    { "id": "cap-rate",       "value": 6.5,  "unit": "%",    "label": "Median cap rate"       },
    { "id": "asking-rent",    "value": 28.40,"unit": "$/sf",  "label": "Asking rent"           },
    { "id": "survival-rate",  "value": 78.1, "unit": "%",    "label": "Franchise survival"    },
    { "id": "freight-zscore", "value": 1.26, "unit": "",     "label": "Freight z-score"       }
  ]
}
```

## Tiers (three views of the same report)

- **Tier 1** — Conversational, 2-5 sentence summary. Executive glance.
- **Tier 2** — Structured. Conclusion + metrics table + caveats. **The main view.**
- **Tier 3** — Raw audit with full citation table. For people verifying every number.

All three are tabs/views on the same page, not separate pages.
