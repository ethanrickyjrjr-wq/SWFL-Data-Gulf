// scratchpad-parse.mjs — pure parse of _ASSISTANT/SCRATCHPAD.md.
//
// Kept separate from the hooks that call it (print-scratchpad.mjs at SessionStart,
// check-scratchpad-on-push.mjs at push) for the same reason lib/secret-wiring.mjs
// is: a rule that only exists inside a binary can only be tested by running the
// binary, and that is how a guard ships green while guarding nothing.
//
// FILE SHAPE this parses (real, as of 07/22/2026 — 1,896 lines):
//   ## 2026-07-22 — <narrative entry>        ← newest gripes, top of file, NOT in a section
//   # SCRATCHPAD — standing issue list       ← single-# preamble, ignored
//   ## OPEN — raised 07/22/2026              ← open section (several, interleaved)
//   ### 0ak. <item title>                    ← item
//   ## RESOLVED                              ← closed section
//   ## OPEN — raised 07/21/2026              ← ANOTHER open section, AFTER resolved
//
// That last line is the trap: classification is per-heading, never positional.

/** Titles-only ceiling for the SessionStart digest. Overflow is counted, not dropped. */
export const MAX_ITEMS = 24;
/** Newest top-of-file dated entries to surface (today's gripes live here). */
export const MAX_ENTRIES = 3;
const MAX_TITLE = 96;

const RE_SECTION = /^##\s+(.*)$/;
const RE_ITEM = /^###\s+(.*)$/;
const RE_DATED_ENTRY = /^\d{4}-\d{2}-\d{2}\b/;
// Words that close an item. UPPERCASE-ONLY and position-anchored, both on purpose.
//
// A bare /\b(RESOLVED|SHIPPED|…)\b/ anywhere in the text over-filters, and
// over-filtering is the worst bug this file can have — it silently buries a gripe
// the operator raised. Measured against the real file on 07/22/2026, a loose match
// hid three live items:
//   "**NOT YET CLOSED — do not call this fixed.**"          ← says the opposite
//   "**CONSEQUENCE FOR WHAT I SHIPPED TODAY (measured…):**"  ← prose
//   "**The bug (FIXED + verified live this session).**"      ← prose
// So a closure must be a STATUS STAMP: the word leads the line (after an optional
// bold marker), or in a title follows a dash separator — `— RESOLVED 07/20/2026`.
// Case-sensitivity is load-bearing too: item 22's title contains the lowercase
// phrase "was declared resolved", and that item is open.
const CLOSURE = "RESOLVED|SHIPPED|CLOSED|FIXED|DONE|KILLED";
const RE_CLOSED_TITLE = new RegExp(`(^|[—–-]\\s*)(${CLOSURE})\\b`);
const RE_CLOSED_BODY = new RegExp(`^\\s*\\*{0,2}(${CLOSURE})\\b`);

/**
 * Classify a `## ` heading. Per-heading, never by position in the file.
 * @returns {"open"|"resolved"|"entry"|"other"}
 */
export function classifySection(heading) {
  const h = String(heading || "").trim();
  if (/^RESOLVED\b/i.test(h)) return "resolved";
  if (/^OPEN\b/i.test(h)) return "open";
  if (RE_DATED_ENTRY.test(h)) return "entry";
  return "other";
}

/**
 * An item is closed if its TITLE carries a closure word, or if its BODY opens a
 * line with a bolded closure (`**RESOLVED 07/21/2026 — …**`), which is how items
 * get closed in place rather than moved to the RESOLVED section.
 */
export function isClosed(title, bodyLines) {
  if (RE_CLOSED_TITLE.test(String(title || ""))) return true;
  return (bodyLines || []).some((l) => RE_CLOSED_BODY.test(l));
}

/** Parse into sections with their items. Never throws on malformed input. */
export function parseScratchpad(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const sections = [];
  let section = null;
  let item = null;

  const closeItem = () => {
    if (section && item) {
      item.closed = isClosed(item.title, item.body);
      section.items.push(item);
    }
    item = null;
  };

  for (const line of lines) {
    const s = RE_SECTION.exec(line);
    if (s) {
      closeItem();
      section = { heading: s[1].trim(), status: classifySection(s[1]), items: [] };
      sections.push(section);
      continue;
    }
    const i = RE_ITEM.exec(line);
    if (i) {
      // An item before any `## ` heading has no section — ignore it rather than
      // inventing one (a `### ` in the preamble is not a tracked issue).
      closeItem();
      if (section) item = { title: i[1].trim(), body: [], closed: false };
      continue;
    }
    if (item) item.body.push(line);
  }
  closeItem();

  return { sections };
}

/** Every item in an OPEN section that is not closed. */
export function openItems(text) {
  const out = [];
  for (const s of parseScratchpad(text).sections) {
    if (s.status !== "open") continue;
    for (const it of s.items) {
      if (!it.closed) out.push({ section: s.heading, title: it.title });
    }
  }
  return out;
}

/** Newest top-of-file `## YYYY-MM-DD — …` narrative entries. */
export function recentEntries(text) {
  return parseScratchpad(text)
    .sections.filter((s) => s.status === "entry")
    .map((s) => s.heading);
}

function clip(s) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > MAX_TITLE ? `${t.slice(0, MAX_TITLE - 1)}…` : t;
}

/**
 * The SessionStart digest: titles only, hard-capped, overflow counted.
 * Returns "" when there is nothing to say, so the hook can stay silent.
 */
export function renderDigest(text) {
  const entries = recentEntries(text).slice(0, MAX_ENTRIES);
  const open = openItems(text);
  if (entries.length === 0 && open.length === 0) return "";

  const banner = "=".repeat(72);
  let out =
    `\n${banner}\n` +
    `SCRATCHPAD — ${open.length} open item(s) · _ASSISTANT/SCRATCHPAD.md\n` +
    `${banner}\n` +
    `RULE 2: every gripe the operator raises goes here the moment it is raised.\n` +
    `He should never have to type the same thing twice.\n` +
    `${banner}\n`;

  if (entries.length > 0) {
    out += `\nMost recent entries:\n`;
    for (const e of entries) out += `  · ${clip(e)}\n`;
  }

  const shown = open.slice(0, MAX_ITEMS);
  let lastSection = null;
  if (shown.length > 0) out += `\nOpen items:\n`;
  for (const it of shown) {
    if (it.section !== lastSection) {
      out += `\n  ${clip(it.section)}\n`;
      lastSection = it.section;
    }
    out += `    · ${clip(it.title)}\n`;
  }

  const overflow = open.length - shown.length;
  // No silent caps: a truncated list that does not say it was truncated reads as
  // "that is everything", which is the failure this whole file exists to stop.
  if (overflow > 0) out += `\n  … + ${overflow} more — open the file for the rest.\n`;

  out += `${banner}\n[scratchpad] ${open.length} open · ${shown.length} shown\n`;
  return out;
}
