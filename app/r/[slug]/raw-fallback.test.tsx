// app/r/[slug]/raw-fallback.test.tsx
import { test, expect } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { RawFallback } from "./page";

// The parse-failure fallback used to dump the ENTIRE raw brain markdown file
// (source citations, internal pipeline notes, user-saved-reference blocks meant
// for an LLM's eyes only) verbatim inside a <pre> on the live public /r/[slug]
// route. It must never render arbitrary file content again — only a generic,
// content-free notice.

function collectTypes(node: ReactNode, out: unknown[] = []): unknown[] {
  if (node == null || typeof node === "boolean") return out;
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out);
    return out;
  }
  if (typeof node === "object" && "type" in (node as ReactElement)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    out.push(el.type);
    if (el.props && "children" in el.props) collectTypes(el.props.children, out);
  }
  return out;
}

function collectStrings(node: ReactNode, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectStrings(n, out);
    return out;
  }
  if (typeof node === "object" && "props" in (node as ReactElement)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (el.props && "children" in el.props) collectStrings(el.props.children, out);
  }
  return out;
}

test("raw fallback renders no preformatted brain content", () => {
  const secretMarker = "s01 | SWFL CRE corridor profiles — Supabase corridor_profiles (INTERNAL)";
  // Called the same way page.tsx's catch block calls it today — slug + the raw
  // file content read straight off disk. `as never` tolerates either the old
  // (content-accepting) or fixed (content-free) signature.
  const el = RawFallback({ slug: "some-brain", content: secretMarker } as never) as ReactElement;

  const types = collectTypes(el);
  expect(types).not.toContain("pre");

  const strings = collectStrings(el);
  const joined = strings.join(" ");
  expect(joined).not.toContain(secretMarker);
});
