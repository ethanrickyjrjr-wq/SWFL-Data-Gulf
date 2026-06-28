import { test, expect } from "bun:test";
import { refreshStaleLakeContext } from "./build-doc";

// With no figures there is nothing stale → forced=[] and (includeGapProbe=false) no
// gap probe → the web lane is never called (no network), and the context is just the dossier.
test("no stale figures → held context, no web refresh, no network", async () => {
  const r = await refreshStaleLakeContext({
    figures: [],
    dossier: "DOSSIER_TEXT",
    prompt: "",
    today: new Date("2026-06-28T00:00:00Z"),
    includeGapProbe: false,
  });
  expect(r.lakeContext).toContain("DOSSIER_TEXT");
  expect(r.webRefreshed).toEqual([]);
  expect(r.web.verified).toEqual([]);
});
