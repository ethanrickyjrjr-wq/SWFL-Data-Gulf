## Enforced
- Claim: binds month-over-month, not year-over-year (the shared chart producer would otherwise bind
  the first delta column sharing a stem)
  Test: lib/deliverable/recipes/market-pulse.test.ts > "the chip is the MoM move, NOT the YoY sitting next to it in the table"
- Claim: the ranked frame draws at most 8 rows — a 10+-ZIP place cannot show every bar
  Test: lib/deliverable/recipes/market-pulse.test.ts > "given MORE than 8 real ZIP moves, momChartSpec's own items are capped at 8 — not just the title"

## Unenforced
- [none found this pilot — the row-cap gap flagged in the spec's Open Risks was closed in this
  same build, Task 6]
