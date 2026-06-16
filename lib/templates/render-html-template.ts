import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * HTML template renderer — the core of the template-render pipeline.
 *
 * Reads a static shell from `templates/html/<slug>.html` and performs a
 * token-key-agnostic `{{key}}` find-and-replace against the supplied token map.
 * The same renderer serves both template families:
 *   - viz cards  (`viz/flood-exposure`, lowercase snake_case data tokens)
 *   - doc/email  (`doc/doc-hbar`, uppercase `{{PRIMARY}}`-style tokens)
 *
 * Brand colors are NOT a separate concern — `brand_primary` / `brand_secondary`
 * (and `{{PRIMARY}}` etc.) are ordinary token keys. One set of shells serves
 * SWFL's own brand AND any client brand; only the token VALUES differ.
 */

/** A token map. Values are stringified verbatim (numbers via `String()`). */
export type TemplateTokens = Record<string, string | number>;

const TEMPLATE_ROOT = path.join(process.cwd(), "templates", "html");

/** Matches `{{ token_name }}` with optional surrounding whitespace. */
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** A slug may only contain lowercase letters, digits, `-`, and `/` path segments. */
const SLUG_RE = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

/** Matches `<!-- repeat:key -->…<!-- /repeat:key -->` (single-level, non-greedy). */
const REPEAT_RE = /<!--\s*repeat:([a-zA-Z0-9_]+)\s*-->([\s\S]*?)<!--\s*\/repeat:\1\s*-->/g;

/**
 * Expand `<!-- repeat:KEY -->inner<!-- /repeat:KEY -->` blocks: clone `inner` once per
 * item in `repeats[KEY]`, filling that item's `{{tokens}}`. Tokens NOT on the item are
 * left verbatim (`{{token}}`) so the normal global pass fills them. Absent/empty list →
 * the block renders to nothing. Single-level only (no nested repeats).
 */
export function expandRepeats(html: string, repeats: Record<string, TemplateTokens[]>): string {
  return html.replace(REPEAT_RE, (_match, key: string, inner: string) => {
    const items = repeats[key] ?? [];
    return items
      .map((item) =>
        inner.replace(TOKEN_RE, (whole, k: string) => {
          const value = item[k];
          return value === undefined ? whole : String(value);
        }),
      )
      .join("");
  });
}

export class TemplateNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Template not found: ${slug}`);
    this.name = "TemplateNotFoundError";
  }
}

export class InvalidSlugError extends Error {
  constructor(public readonly slug: string) {
    super(`Invalid template slug: ${slug}`);
    this.name = "InvalidSlugError";
  }
}

/**
 * Render a template shell to a complete HTML string.
 *
 * @param slug   Template path relative to `templates/html/`, WITHOUT the `.html`
 *               extension — e.g. `"viz/flood-exposure"`.
 * @param tokens Map of `{{key}}` → value. Unknown `{{tokens}}` in the shell are
 *               replaced with the empty string so a missing value never ships a
 *               literal `{{token}}` to a customer (clean-output rule).
 * @throws InvalidSlugError    if the slug fails validation / escapes the root.
 * @throws TemplateNotFoundError if the resolved file does not exist.
 */
export async function renderHtmlTemplate(
  slug: string,
  tokens: TemplateTokens,
  repeats?: Record<string, TemplateTokens[]>,
): Promise<string> {
  if (!SLUG_RE.test(slug) || slug.includes("..")) throw new InvalidSlugError(slug);

  const filePath = path.join(TEMPLATE_ROOT, `${slug}.html`);
  // Defense in depth: the resolved path must stay inside TEMPLATE_ROOT.
  const rel = path.relative(TEMPLATE_ROOT, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new InvalidSlugError(slug);

  let shell: string;
  try {
    shell = await readFile(filePath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new TemplateNotFoundError(slug);
    throw e;
  }

  if (repeats) shell = expandRepeats(shell, repeats);

  return shell.replace(TOKEN_RE, (_match, key: string) => {
    const value = tokens[key];
    return value === undefined ? "" : String(value);
  });
}
