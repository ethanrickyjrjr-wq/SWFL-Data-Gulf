/**
 * Competitor contact-export CSV normalizer (Task 10, forward-lane webhook
 * branch). Rewrites a forwarded competitor export into the header shape
 * `lib/email/parse-contacts-csv.ts` already recognizes (`email`/`name`/`tags`;
 * everything else lands in `attribs`). Pure string -> string, no I/O.
 *
 * DELTA vs. a literal "header row only" reading of the brief: merging
 * "First Name" + "Last Name" into one `name` column, and turning a per-row
 * unsubscribe SIGNAL (a `Status` cell's VALUE, an `Opted Out` cell's
 * truthiness, a non-empty `UNSUB_TIME`) into a `switch_unsubscribed` marker
 * both require reading/rewriting ROW VALUES, not just the header cell text.
 * The brief's own next sentence ("splice values", "Status with value
 * unsubscribed/cleaned") already implies this — this module does a small
 * quote-aware CSV parse -> column rewrite -> re-serialize, not a header-only
 * string substitution. Still pure, still scoped to this one file.
 *
 * RULE 0.4 vendor verification (crawl4ai, live, 07/16/2026 -- output kept
 * local per the *crawl4ai* gitignore; findings written here + task-10-report.md):
 *
 * - Mailchimp: https://mailchimp.com/help/view-export-contacts/ ("About your
 *   export file") confirms verbatim column names MEMBER_RATING, OPTIN_TIME,
 *   OPTIN_IP, CONFIRM_TIME, CONFIRM_IP, LATITUDE, LONGITUDE, GMTOFF, DSTOFF,
 *   TIMEZONE, CC, REGION, LAST_CHANGED, LEID, EUID, NOTES, TAGS as real
 *   Mailchimp export columns (passed through unchanged here -> attribs).
 *   https://mailchimp.com/help/manage-audience-signup-form-fields/ confirms
 *   "By default, new audiences include text fields to collect first and last
 *   names" -- "First Name"/"Last Name" are the default field labels. The
 *   account's own required signup field is "Email Address" (referenced
 *   throughout Mailchimp's own docs/UI).
 *   CORRECTION vs. a naive "one CSV with a Status column" assumption: the
 *   SAME article states the native "Export audience" flow produces a ZIP of
 *   SEPARATE per-status CSV files ("subscribed, unsubscribed, non-subscribed,
 *   and cleaned") -- there is no in-file Status column in that default flow.
 *   A forwarded `unsubscribed_members_export.csv`-style file therefore
 *   carries the opt-out signal in its FILENAME, not a column this module can
 *   see (this module only ever receives CSV text). Filename-based detection
 *   is handled one layer up, in `lib/switch/forward-handler.ts`, not here.
 * - "UNSUB_TIME" (named in the plan/brief) was NOT found as a literal
 *   Mailchimp column in the live article above -- kept here as an additional
 *   defensive pattern (harmless no-op on a real export that never carries
 *   it), not presented as vendor-verified. Flagged: MEMBER_RATING/OPTIN_TIME/
 *   First-Last-Name-defaults VERIFIED; UNSUB_TIME NEEDS REVIEW.
 * - Constant Contact: https://developer.constantcontact.com/api_guide/export_contacts.html
 *   (live API doc) confirms snake_case fields `email_address`, `first_name`,
 *   `last_name`, `status` (enum `active`/`unsubscribed`/`removed`).
 *   https://knowledgebase.constantcontact.com/email-digital-marketing/articles/KnowledgeBase/37424-Select-contact-lists-to-export-into-a-spreadsheet
 *   confirms the product UI lets a user choose which fields populate the
 *   downloaded spreadsheet, but neither page spells out the literal
 *   Title-Case column text a real download uses (no public sample file to
 *   lift one from). This module's Constant Contact test fixture
 *   ("Email address"/"First name"/"Last name"/"Email status") Title-Cases the
 *   vendor-confirmed field vocabulary -- a reasonable reconstruction, not a
 *   screenshot capture. Flagged: field VOCABULARY verified; exact UI header
 *   CAPITALIZATION needs review at the operator's first real export.
 * - "cleaned" as a real opt-out-adjacent status is Mailchimp-verified (same
 *   view-export-contacts article: "subscribed, unsubscribed, non-subscribed,
 *   and cleaned"). "unsubscribed"/"removed" match Constant Contact's own
 *   `status` enum (removed maps conceptually to the same "gone" state, but
 *   this module keys only on the literal `unsubscribed`/`cleaned` values the
 *   brief specified for the generic `Status` column -- extending the enum is
 *   a one-line change if a real export needs it).
 */

const EMAIL_HEADERS = new Set(["email address", "e-mail", "email"]);
const FULL_NAME_HEADERS = new Set(["full name", "name"]);
const UNSUB_STATUS_VALUES = new Set(["unsubscribed", "cleaned"]);
// "Status" (the brief's literal name) and "Email status" (Constant Contact's
// own header, matching its `status` API field) both carry the same signal.
const STATUS_HEADERS = new Set(["status", "email status"]);
const TRUTHY_FLAG_VALUES = new Set(["yes", "true", "1", "y"]);

const SWITCH_UNSUBSCRIBED_COLUMN = "switch_unsubscribed";

// ── quote-aware CSV tokenize / serialize ────────────────────────────────────
// A small local tokenizer mirroring the shape of parseContactsCsv's own
// (private, unexported) tokenizeCsv -- kept local rather than imported since
// lib/email/parse-contacts-csv.ts is outside this task's file scope and this
// module needs to ROUND-TRIP (parse -> rewrite -> re-serialize), a different
// job than that module's parse-only tokenizer.

function isBlankRow(row: string[]): boolean {
  return row.length === 1 && row[0] === "";
}

function tokenizeRows(text: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let started = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      started = true;
      i++;
      continue;
    }
    if (ch === ",") {
      fields.push(current);
      current = "";
      started = true;
      i++;
      continue;
    }
    if (ch === "\n") {
      fields.push(current);
      rows.push(fields);
      fields = [];
      current = "";
      started = false;
      i++;
      continue;
    }
    current += ch;
    started = true;
    i++;
  }

  if (started || current !== "" || fields.length > 0) {
    fields.push(current);
    rows.push(fields);
  }

  return rows;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function serializeRow(row: string[]): string {
  return row.map(csvField).join(",");
}

// ── unsubscribe-signal detection ────────────────────────────────────────────

function isTruthyFlag(value: string): boolean {
  return TRUTHY_FLAG_VALUES.has(value.trim().toLowerCase());
}

function isUnsubStatusValue(value: string): boolean {
  return UNSUB_STATUS_VALUES.has(value.trim().toLowerCase());
}

// ── the public entry point ───────────────────────────────────────────────────

/**
 * Rewrites a forwarded competitor contact-export CSV so
 * `lib/email/parse-contacts-csv.ts` recognizes its email/name columns and so
 * a per-row unsubscribe signal (whatever shape the source used) surfaces as
 * one `switch_unsubscribed` attrib the caller (`lib/switch/forward-handler.ts`)
 * converts to `ContactRow.unsubscribed: true`. Passes every other column
 * through unchanged (lands in `attribs` downstream). Header matching is
 * case-insensitive; unrecognized input (empty string, no rows at all) is
 * returned unchanged.
 */
export function normalizeCompetitorCsv(csvText: string): string {
  if (csvText.length === 0) return csvText;

  const deBommed = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const normalized = deBommed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows = tokenizeRows(normalized);
  if (rows.length === 0) return csvText;

  const headerRowIdx = rows.findIndex((r) => !isBlankRow(r));
  if (headerRowIdx === -1) return csvText;
  const header = rows[headerRowIdx];
  const lowerHeader = header.map((h) => h.trim().toLowerCase());

  const emailIdx = lowerHeader.findIndex((h) => EMAIL_HEADERS.has(h));
  const firstIdx = lowerHeader.findIndex((h) => h === "first name");
  const lastIdx = lowerHeader.findIndex((h) => h === "last name");
  const mergeNames = firstIdx !== -1 && lastIdx !== -1;
  const fullNameIdx = mergeNames ? -1 : lowerHeader.findIndex((h) => FULL_NAME_HEADERS.has(h));

  const unsubTimeIdx = lowerHeader.findIndex((h) => h === "unsub_time");
  const statusIdx = lowerHeader.findIndex((h) => STATUS_HEADERS.has(h));
  const optedOutIdx = lowerHeader.findIndex((h) => h === "opted out");
  const hasSignalColumn = unsubTimeIdx !== -1 || statusIdx !== -1 || optedOutIdx !== -1;

  // Columns dropped from the output entirely: the merged-away "Last Name"
  // slot, and every raw unsubscribe-signal column (replaced by the single
  // derived switch_unsubscribed column appended at the end).
  const dropIdx = new Set<number>();
  if (mergeNames) dropIdx.add(lastIdx);
  if (unsubTimeIdx !== -1) dropIdx.add(unsubTimeIdx);
  if (statusIdx !== -1) dropIdx.add(statusIdx);
  if (optedOutIdx !== -1) dropIdx.add(optedOutIdx);

  function rewriteHeaderCell(idx: number, cell: string): string | null {
    if (dropIdx.has(idx)) return null;
    if (idx === emailIdx) return "email";
    if (mergeNames && idx === firstIdx) return "name";
    if (!mergeNames && idx === fullNameIdx) return "name";
    return cell;
  }

  const outRows: string[][] = [];

  const newHeader = header
    .map((cell, idx) => rewriteHeaderCell(idx, cell))
    .filter((cell): cell is string => cell !== null);
  if (hasSignalColumn) newHeader.push(SWITCH_UNSUBSCRIBED_COLUMN);
  outRows.push(newHeader);

  for (let r = 0; r < rows.length; r++) {
    if (r === headerRowIdx) continue;
    const row = rows[r];
    if (isBlankRow(row)) {
      outRows.push(row);
      continue;
    }

    let optedOut = false;
    if (unsubTimeIdx !== -1 && (row[unsubTimeIdx] ?? "").trim() !== "") optedOut = true;
    if (statusIdx !== -1 && isUnsubStatusValue(row[statusIdx] ?? "")) optedOut = true;
    if (optedOutIdx !== -1 && isTruthyFlag(row[optedOutIdx] ?? "")) optedOut = true;

    const mergedName = mergeNames
      ? [row[firstIdx] ?? "", row[lastIdx] ?? ""]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
      : null;

    const newRow: string[] = [];
    row.forEach((value, idx) => {
      if (dropIdx.has(idx)) return;
      if (mergeNames && idx === firstIdx) {
        newRow.push(mergedName ?? "");
        return;
      }
      newRow.push(value);
    });
    if (hasSignalColumn) newRow.push(optedOut ? "true" : "");

    outRows.push(newRow);
  }

  return outRows.map(serializeRow).join("\n");
}
