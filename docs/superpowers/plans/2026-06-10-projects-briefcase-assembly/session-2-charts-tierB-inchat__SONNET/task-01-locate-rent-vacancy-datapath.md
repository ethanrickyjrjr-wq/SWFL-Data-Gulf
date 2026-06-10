# Task 01 — Wire fixture data paths for all Tier-B charts

**Why this task changed:** The original task sent you on a hunt for "live" data paths and blocked on a prohibition on fixture data. That prohibition is **OVERRIDDEN by operator decree (2026-06-10)**: fixture-backed charts are fully deliverable. A chart carries an as-of date (captured from the fixture's own date field) — that is the only honesty mechanism required. No `freshness_token` required on charts, no live-brain precondition, no gating.

**This is a read + findings note, no code yet. Output a short findings note that Task 02 consumes.**

- [ ] **Step 1: Read `corridor-rents.json` end-to-end.**

```bash
cat fixtures/corridor-rents.json | head -80
```

Record: corridors covered, rent field names, vacancy field names, and the `as_of` / date field that will label every chart built from this fixture.

- [ ] **Step 2: Find the ZHVI fixture path.**

```bash
ls fixtures/ | grep -iE 'zhvi|home.value|hpi'
grep -rIl 'ZHVIAreaChart\|zhvi' app/ components/ lib/ | head
```

Open the file that `ZHVIAreaChart` actually loads. Record: fixture path, series shape (date → value), and the as-of date field.

- [ ] **Step 3: Find the corridor scatter fixture path.**

```bash
grep -rIl 'CorridorMarketScatter\|corridor.*scatter\|scatter.*corridor' app/ components/ | head
```

Open that file to find where it loads data. Record: fixture path and the x-axis, y-axis, label field names.

- [ ] **Step 4: Confirm vacancy data is in the rents fixture.** Per operator: "data exists in the rents fixture, no chart draws it today." Verify the vacancy field name in `corridor-rents.json`.

- [ ] **Step 5: Confirm ChartBlockView area + scatter renderers are stubs.** Per operator: "ChartBlockView's area and scatter renderers currently stub to an HTML table." Open `components/charts/ChartBlockView.tsx` and verify which chart types render a real chart vs. fall through to an HTML table. Task 02 wires the real renderers.

- [ ] **Step 6: Locate the flood-AAL source.** Plan says "from env brain detail table via `fetchBrain`." Confirm `fetchBrain` exists and the env brain exposes an AAL-by-ZIP detail_table; record the exact accessor.

- [ ] **Step 7: Write the findings note** at `docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-2-charts-tierB-inchat__SONNET/FINDINGS-datapaths.md` listing, per scope (`asking-rent`, `vacancy`, `zhvi`, `corridor-scatter`, `flood-aal`): fixture or live-brain source, exact path/accessor, as-of date field, and confirmed deliverable (no deferred scopes except `flood-aal` if its env brain accessor doesn't resolve).

- [ ] **Step 8: Commit the findings note.**

```bash
git add docs/superpowers/plans/2026-06-10-projects-briefcase-assembly/session-2-charts-tierB-inchat__SONNET/FINDINGS-datapaths.md
git commit -m "docs(charts): fixture data-path findings for all Tier-B chart scopes"
```
