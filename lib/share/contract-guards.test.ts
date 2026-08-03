// lib/share/contract-guards.test.ts
// Guards for two spec invariants (share-by-link growth loop,
// .superpowers/sdd/2026-08-03-share-growth-loop/) that had no test enforcing them,
// flagged as Important findings in the final review:
//
//   1. Failure mode 3 — `ref=share` is a WRITE-ONLY growth marker (see
//      lib/share/share-link.ts). Nothing outside the share modules may READ it —
//      reading it for auth/tier/content would let the param double as a bypass.
//   2. Failure mode 2 — the share CTA on `/p/[id]` must NEVER render for the
//      deliverable owner (it's the "build your own" pitch for a viewer, not the
//      owner). Every `<ShareCta` render must be gated behind `{!isOwner && ...}`.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");

/** Forward-slash relative path from repo root, for stable cross-platform comparisons. */
function rel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

/** Recursively collect *.ts / *.tsx under a repo-relative dir, skipping node_modules,
 *  dotfolders, *.test.* files, and (for this guard) lib/share/ itself. */
function collect(dirRel: string): string[] {
  const root = join(REPO_ROOT, dirRel);
  const out: string[] = [];
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        walk(abs);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(abs);
      }
    }
  };
  walk(root);
  return out;
}

/** File text with block + full-line comments stripped, so a comment that merely
 *  MENTIONS a reading pattern (like this file does) never counts as a violation. */
function codeOnly(f: string): string {
  return readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

describe("ref=share is write-only (spec failure mode 3)", () => {
  // Patterns that read the "ref" query key off a Next.js `searchParams` object
  // (App Router's `URLSearchParams`-like prop or hook) or a `params` prop —
  // anchored on those two identifiers so unrelated identifiers (`useRef`,
  // `fileRef`, `prefer`, a forwardRef `props.ref`) never match.
  const READ_PATTERNS: RegExp[] = [
    /searchParams\s*\.\s*get\(\s*["'`]ref["'`]\s*\)/,
    /searchParams\s*\[\s*["'`]ref["'`]\s*\]/,
    /searchParams\s*\.\s*ref\b/,
    /params\s*\.\s*ref\b/,
    /params\s*\[\s*["'`]ref["'`]\s*\]/,
    // Destructuring — the idiomatic App Router read in Next 16: `const { ref } = await searchParams;`
    /\{[^{}]*\bref\b[^{}]*\}\s*=\s*(?:await\s+)?\w*[Pp]arams\b/,
  ];

  // Pre-existing, unrelated reader — verified 08/03/2026 (RULE 0.5 probe, not memory):
  // `/welcome` reads a generic `?ref=` for prospect ARRIVAL ATTRIBUTION
  // (`logArrival(ref)`, lib/prospects/arrival-event.ts), a different feature that
  // predates and is unrelated to the share-link `ref=share` marker. It never gates
  // auth/tier/content — it only feeds an analytics event. Do NOT grow this list for
  // any file under the share surface (app/p/[id]/**) or anything that touches
  // auth/tier/content; that would be exactly the violation this guard exists to catch.
  const KNOWN_UNRELATED_READERS = new Set(["app/welcome/page.tsx"]);

  const candidates = ["app", "lib"]
    .flatMap(collect)
    .filter((abs) => !rel(abs).startsWith("lib/share/"));

  test("no file outside lib/share/ reads the `ref` query param", () => {
    const violations = candidates
      .map((abs) => ({ file: rel(abs), src: codeOnly(abs) }))
      .filter(({ file, src }) => {
        if (KNOWN_UNRELATED_READERS.has(file)) return false;
        return READ_PATTERNS.some((re) => re.test(src));
      })
      .map(({ file }) => file)
      .sort();

    expect(
      violations,
      `ref=share must stay write-only (spec failure mode 3) — a reader outside ` +
        `lib/share/ can turn the growth marker into an auth/tier/content bypass. ` +
        `Offenders:\n  ${violations.join("\n  ")}`,
    ).toEqual([]);
  });

  test("READ_PATTERNS match real readers and not lookalike identifiers", () => {
    // Synthetic strings, not a real repo file — so a legitimate future refactor of
    // any specific file (e.g. /welcome no longer reading `ref`) can never turn this
    // canary red. Proves both halves of the contract: the patterns actually catch a
    // realistic reader, AND they don't false-positive on useRef/fileRef/prefer/forwardRef.
    const hits = [
      'const r = searchParams.get("ref");',
      'const r = searchParams["ref"];',
      "const r = params.ref;",
      "const { ref } = await searchParams;",
    ];
    for (const src of hits) {
      expect(READ_PATTERNS.some((re) => re.test(src))).toBe(true);
    }

    const misses = [
      "const fileRef = useRef(null);",
      "const prefer = opts.prefer;",
      "<input ref={inputRef} />",
      "const config = { preferred: true };",
    ];
    for (const src of misses) {
      expect(READ_PATTERNS.some((re) => re.test(src))).toBe(false);
    }
  });
});

describe("share CTA is always owner-gated (spec failure mode 2)", () => {
  test("every <ShareCta render on /p/[id] is behind {!isOwner && ...}", () => {
    const pagePath = join(REPO_ROOT, "app/p/[id]/page.tsx");
    const src = readFileSync(pagePath, "utf8");

    const totalRenders = (src.match(/<ShareCta\b/g) ?? []).length;
    const ownerGated = (src.match(/\{!isOwner\s*&&\s*<ShareCta\s*\/>\}/g) ?? []).length;

    expect(totalRenders).toBeGreaterThanOrEqual(1);
    expect(
      ownerGated,
      `Found ${totalRenders} <ShareCta render(s) but only ${ownerGated} owner-gated ` +
        `as {!isOwner && <ShareCta />} — a future branch could render the "build your ` +
        `own" pitch to the deliverable's OWNER, which is the nag failure mode the spec calls out.`,
    ).toBe(totalRenders);
  });
});
