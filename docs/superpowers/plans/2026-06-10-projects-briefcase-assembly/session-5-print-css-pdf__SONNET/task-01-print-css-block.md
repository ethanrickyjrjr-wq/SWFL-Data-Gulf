# Task 01 — `@media print` block in `app/globals.css`

**Files:** Modify `app/globals.css` (net-new print block). Add a shared `.print-hide` class to the floating chrome components (FAB, dock, ticker, briefcase, action strips, buttons).

- [ ] **Step 1:** Add a `.print-hide` className to: Ask-AI FAB, dock, the news/ticker, the briefcase button+tray, every page's action strip / "Save as PDF" / "Build" buttons.

- [ ] **Step 2:** Add the print block:

```css
@media print {
  .print-hide { display: none !important; }
  html, body { background: #fff !important; color: #000 !important; }
  /* keep provenance + freshness tokens visible — they ARE the deliverable's value */
  .citation, .freshness-token, .source-line { display: block !important; color: #000 !important; }
  .report-item, .project-item, figure { break-inside: avoid; }
  .chart, .chart-block { width: 100% !important; }
  a[href]::after { content: ""; } /* don't append raw URLs inline; citations already show them */
}
```

Match the real class names in `ReportShell`/`ChartBlockView`/project pages — grep for the citation/freshness/source elements and align the selectors (`feedback_fill-in-commands-dont-template`).

- [ ] **Step 2b:** Confirm `break-inside: avoid` keeps each item whole across page breaks and charts go full-width.

- [ ] **Step 3: Commit.** `git add app/globals.css && git commit -m "feat(pdf): print stylesheet — hide chrome, keep citations+token, page-break items"`
