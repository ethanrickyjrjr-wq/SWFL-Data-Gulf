<p align="center">
  <img src="public/logo-name.png" alt="SWFL Data Gulf" width="480" />
</p>

<p align="center">
  <strong>Verified Southwest Florida market data, turned into client-ready work.</strong><br/>
  Live at <a href="https://www.swfldatagulf.com">swfldatagulf.com</a>
</p>

---

## What this is

SWFL Data Gulf takes the market data that Southwest Florida professionals spend hours hunting down — sale prices, rents, permits, flood risk, traffic, commercial corridors — verifies it against the original sources, and turns it into finished work: branded emails, social posts, charts, and area reports that are ready to send. Every number in every deliverable is cited to a named source and stamped with the date it was true.

It serves three ways:

- **Build** — produce client-ready emails, posts, charts, and reports in the browser, in minutes.
- **Ask** — question the data directly on the site and get grounded, cited answers.
- **Connect** — plug the whole dataset into your own AI assistant and use it there.

---

## What you can build

The build studio covers the work a listing actually generates over its life — announcement, open house, price change, under contract, just sold — plus recurring market updates for a ZIP, corridor, or farm area. Each one comes out branded to you, editable before it goes anywhere, and sourced line by line. Social posts render sized for each platform. Charts are drawn from real series — price by ZIP, vacancy by corridor, permit volume over time — never sketched from vibes.

Reports are made to be interrogated, not just read: point at a figure on a report page and ask about it, chart it, or compare it against another area, and the answer comes grounded in that report's own sourced data.

---

## Where every number comes from

Every figure is filled from four lanes, tried in order:

1. **Our own data** — the live Southwest Florida data lake, built from the sources below.
2. **Your upload** — a document or figure you hand in, used as given and attributed to you.
3. **A named public source** — fetched live and cited, when neither of the above holds it.
4. **A value you type in** — labeled as yours.

What never happens is an invented number. That rule is enforced in code at build time — a deliverable with an unsourced figure fails to build. A data gap becomes an honest empty slot or a fetch, never a guess.

---

## Data that behaves honestly

- Every number carries its source and an as-of date.
- Confidence decays as data ages — nothing pretends to be fresher than it is.
- Below a minimum sample size, the platform declines to state a figure rather than fabricate one.
- When sources disagree, the disagreement is surfaced instead of silently averaged.
- Rates and percentages are quoted as published, never recomputed from raw counts.
- No AI does arithmetic here. Every calculation is deterministic, tested code; language models only write narrative on top of numbers that are already locked and cited.

---

## The sources

Federal, state, and county records, pulled on schedule by dedicated pipelines: FRED, BLS, Census ACS, SBA, FEMA and NOAA, FBI crime data, FDOT traffic, Florida DBPR licensing, Lee and Collier county property appraisers, recorded deeds, building permits, tourist development tax receipts, RSW passenger traffic, Zillow rent indexes, and a verified inventory of 27 commercial corridors, among others. Each pipeline's freshness is monitored daily.

---

## Use it inside your own AI

The full dataset is served over the [Model Context Protocol](https://modelcontextprotocol.io), so any MCP-compatible assistant (Claude, Cursor, and others) can query it directly:

```bash
# Claude Code
claude mcp add --transport http swfl https://www.swfldatagulf.com/api/mcp

# Claude Desktop / any MCP client — add to your MCP config:
# { "swfl": { "type": "http", "url": "https://www.swfldatagulf.com/api/mcp" } }
```

Then ask: _"What's the flood-adjusted investment picture for ZIP 33931?"_ — and your assistant answers from live, cited data. The sourcing rules travel inside every payload, so the answers stay grounded in your AI too: cite or don't claim, mark anything inferred, never fill a gap with a guess.

---

## Coverage

Lee County and Collier County, Florida — county, corridor, and ZIP grain. Named towns and beaches (Fort Myers, Cape Coral, Naples, Bonita Springs, Estero, Fort Myers Beach, Marco Island, and the rest) resolve to their ZIPs.

---

## Built with

Next.js and TypeScript on Vercel, Supabase Postgres, Python ingest pipelines, DuckDB for analytics, and scheduled GitHub Actions keeping every source fresh. Deterministic math throughout; models write prose, not numbers.

---

## License

The source is public to read; it is not open source. All rights reserved — no license is granted to use, copy, modify, or deploy this software or its data products without written permission. See [LICENSE](LICENSE).

---

## Contact

`support@swfldatagulf.com`
