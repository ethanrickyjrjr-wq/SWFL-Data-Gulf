import { test, expect } from "bun:test";
import { scrubBrainSlugs } from "@/refinery/render/speaker.mts";
import { scrubSlugStream } from "./stream";

// The live bug (07/09/2026): master.md names its upstream brains by internal id in the
// dossier prose, buildDossier carried that text into the grounding block, and the prompt
// told the model to "name the specific datasets we hold for that topic." The model
// complied, using the only names it had — our slugs. `display-leak.test.mts` is a
// build-time test over code-authored strings and structurally cannot catch a slug the
// model emits at runtime.

async function* chunks(...parts: string[]): AsyncIterable<string> {
  for (const p of parts) yield p;
}

async function collect(src: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const s of src) out += s;
  return out;
}

// --- Layer 1: the map ---

test("a known slug maps to its customer-facing label", () => {
  expect(scrubBrainSlugs("Per listing-momentum-swfl, price cuts rose.")).toBe(
    "Per SWFL listing momentum, price cuts rose.",
  );
});

test("every slug in one sentence is replaced", () => {
  const out = scrubBrainSlugs(
    "market-heat-swfl and market-temperature-swfl and active-listings-swfl agree.",
  );
  expect(out).not.toContain("-swfl");
});

test("an unrecognized *-swfl token is rewritten, never deleted", () => {
  // Strip-to-nothing leaves "I also track , which reads…" in the user's face — worse
  // than the leak. An unmapped brain still yields readable English.
  const out = scrubBrainSlugs("I also track brand-new-brain-swfl, which reads high.");
  expect(out).toBe("I also track brand new brain, which reads high.");
});

test("a compound filename is not mangled", () => {
  // The `(?![-\w])` lookahead. Without it: "the SWFL flood + environmental read-spike-findings.md".
  expect(scrubBrainSlugs("see docs/env-swfl-spike-findings.md")).toBe(
    "see docs/env-swfl-spike-findings.md",
  );
});

test("text with no slug is returned untouched", () => {
  const clean = "Median sale price rose 4.2% across Lee County.";
  expect(scrubBrainSlugs(clean)).toBe(clean);
});

// --- Layer 2: the streamed output ---

test("a slug split across two SSE chunks is still scrubbed", async () => {
  // The reason layer 2 is a tail-buffered generator and not a per-chunk .replace():
  // the model streams "listing-momentum-" then "swfl" and neither chunk matches alone.
  const out = await collect(scrubSlugStream(chunks("Per listing-momentum-", "swfl, cuts rose.")));
  expect(out).toBe("Per SWFL listing momentum, cuts rose.");
});

test("a slug split across three chunks at hyphen boundaries is still scrubbed", async () => {
  const out = await collect(scrubSlugStream(chunks("market", "-heat", "-swfl is hot")));
  expect(out).toBe("the SWFL market-heat read is hot");
});

test("a slug that ends the stream is flushed and scrubbed", async () => {
  const out = await collect(scrubSlugStream(chunks("The source is ", "housing-swfl")));
  expect(out).toBe("The source is SWFL housing market");
});

test("the stream is byte-identical when no slug appears", async () => {
  const parts = ["Median sale price ", "rose 4.2% across ", "Lee County."];
  expect(await collect(scrubSlugStream(chunks(...parts)))).toBe(parts.join(""));
});

test("an empty stream yields nothing", async () => {
  expect(await collect(scrubSlugStream(chunks()))).toBe("");
});
