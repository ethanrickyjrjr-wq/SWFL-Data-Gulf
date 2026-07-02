// lib/deliverable/url-lint.ts
//
// The fake-link tripwire (spec: invention-surface-guards §C). Every href/src in
// compiled customer output must appear VERBATIM in the allowed set — payload,
// brand record, or user input — because a constructed URL one character off 404s
// and nothing can prove it live at build time. Outside anchor: OWASP LLM05:2025
// Improper Output Handling (allowlist-validate model output before downstream use).
//
// PURE — no I/O. Callers assemble the allowed set from what they hold:
//   interactive render → strip + warn;  unattended send → fail the build.

export interface UrlViolation {
  attr: "href" | "src";
  url: string;
}

export interface HtmlUrlLintResult {
  ok: boolean;
  violations: UrlViolation[];
  stripped: string;
}

export interface TextUrlLintResult {
  ok: boolean;
  violations: string[];
  stripped: string;
}

/** Hosts we own — compiled-in links (view-online, unsubscribe) are allowed by host. */
const PLATFORM_HOSTS = new Set(["swfldatagulf.com", "www.swfldatagulf.com"]);

/** Schemes that carry no fetchable claim to mint. */
const SAFE_SCHEME_RE = /^(?:mailto:|tel:|data:)/i;

const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>()\][]+/g;

/** Minimal entity decode for attribute values our own renderer escaped. */
function decodeAttr(v: string): string {
  return v
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deep-walk any values and harvest every http(s) URL string (whole strings and
 *  URLs embedded in longer strings). Cycle-safe. */
export function collectAllowedUrls(...roots: unknown[]): Set<string> {
  const out = new Set<string>();
  const seen = new Set<object>();
  const stack: unknown[] = [...roots];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === "string") {
      if (v.startsWith("http://") || v.startsWith("https://")) out.add(v.trim());
      for (const m of v.match(URL_IN_TEXT_RE) ?? []) out.add(m);
    } else if (Array.isArray(v)) {
      stack.push(...v);
    } else if (v && typeof v === "object") {
      if (seen.has(v)) continue;
      seen.add(v);
      stack.push(...Object.values(v));
    }
  }
  return out;
}

function isAllowedUrl(url: string, allowed: ReadonlySet<string>): boolean {
  const u = url.trim();
  if (u === "" || u.startsWith("/") || u.startsWith("#")) return true; // ours by construction
  if (SAFE_SCHEME_RE.test(u)) return true;
  if (allowed.has(u)) return true;
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (PLATFORM_HOSTS.has(host)) return true;
  } catch {
    return false; // unparseable absolute-ish URL → not allowed
  }
  return false;
}

/**
 * Lint every href/src attribute in compiled HTML. `stripped` unwraps a violating
 * <a> (inner content kept) and removes a violating <img> entirely.
 * Our renderers emit quoted attributes, so an attribute regex is sound here.
 */
export function lintCompiledHtml(html: string, allowed: ReadonlySet<string>): HtmlUrlLintResult {
  const violations: UrlViolation[] = [];
  const attrRe = /\b(href|src)\s*=\s*"([^"]*)"/gi;
  const badRaw: { attr: "href" | "src"; raw: string }[] = [];
  for (const m of html.matchAll(attrRe)) {
    const attr = m[1].toLowerCase() as "href" | "src";
    const url = decodeAttr(m[2]);
    if (!isAllowedUrl(url, allowed)) {
      violations.push({ attr, url });
      badRaw.push({ attr, raw: m[2] });
    }
  }
  let stripped = html;
  for (const { attr, raw } of badRaw) {
    const rawRe = escapeRe(raw);
    if (attr === "href") {
      // Unwrap the anchor, keep its inner content.
      stripped = stripped.replace(
        new RegExp(`<a\\b[^>]*href\\s*=\\s*"${rawRe}"[^>]*>([\\s\\S]*?)</a>`, "gi"),
        "$1",
      );
    } else {
      stripped = stripped.replace(
        new RegExp(`<img\\b[^>]*src\\s*=\\s*"${rawRe}"[^>]*/?>`, "gi"),
        "",
      );
    }
  }
  return { ok: violations.length === 0, violations, stripped };
}

/** Lint bare URLs in plain text (social captions, variants). */
export function lintTextUrls(text: string, allowed: ReadonlySet<string>): TextUrlLintResult {
  const violations: string[] = [];
  const stripped = text.replace(URL_IN_TEXT_RE, (m) => {
    if (isAllowedUrl(m, allowed)) return m;
    violations.push(m);
    return "";
  });
  return { ok: violations.length === 0, violations, stripped };
}
