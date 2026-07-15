// lib/email/segments/filter.ts
//
// THE contact-segmentation filter authority for the ONE-OFF BLAST lane
// (ContactPickerModal / POST /api/deliverables/[id]/blast). Spec:
// docs/superpowers/specs/2026-07-14-contact-segments-design.md
//
// NOT email_audiences (tag -> Resend-segment-id cache for the recurring
// DIGEST broadcast lane, lib/email/audience-sync.ts) — different concept,
// different send path. See lib/email/CLAUDE.md.
//
// The filter is a JSON AST (Condition) — never raw SQL, never a free-text
// query box. This module is the pure decision core: given contacts + the
// relevant email_events rows, decide who matches. Mirrors the
// extract/decide split in lib/email/suppression.ts.

export type Condition =
  | { and: Condition[] }
  | { or: Condition[] }
  | { not: Condition }
  | { field: "tags"; op: "has"; value: string }
  | { field: "attribs"; key: string; op: "eq" | "gt" | "lt" | "contains"; value: string }
  | { field: "email" | "name"; op: "matches"; value: string }
  | { field: "engagement"; op: "opened" | "clicked" | "never_opened"; deliverable_id: string };

export interface SegmentContact {
  id: string;
  email: string;
  name: string | null;
  tags: string[];
  /** All values are strings — CSV/import-derived, see contacts.attribs. */
  attribs: Record<string, string>;
}

/** One relevant email_events row, as read at resolve time (scoped to the
 *  deliverable ids an engagement condition actually references). */
export interface SegmentEventRow {
  contact_id: string | null;
  event: string;
  did: string | null;
}

function matchesAttrib(c: SegmentContact, key: string, op: string, value: string): boolean {
  const raw = c.attribs[key];
  if (raw === undefined) return false;
  switch (op) {
    case "eq":
      return raw === value;
    case "contains":
      return raw.toLowerCase().includes(value.toLowerCase());
    case "gt": {
      const a = Number(raw);
      const b = Number(value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }
    case "lt": {
      const a = Number(raw);
      const b = Number(value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }
    default:
      return false;
  }
}

function matchesEngagement(
  c: SegmentContact,
  events: readonly SegmentEventRow[],
  op: "opened" | "clicked" | "never_opened",
  deliverableId: string,
): boolean {
  const rows = events.filter((e) => e.contact_id === c.id && e.did === deliverableId);
  const has = (name: string) => rows.some((e) => e.event === name);
  if (op === "opened") return has("opened");
  if (op === "clicked") return has("clicked");
  return !has("opened"); // never_opened
}

function matches(c: SegmentContact, events: readonly SegmentEventRow[], cond: Condition): boolean {
  if ("and" in cond) return cond.and.every((x) => matches(c, events, x));
  if ("or" in cond) return cond.or.some((x) => matches(c, events, x));
  if ("not" in cond) return !matches(c, events, cond.not);

  switch (cond.field) {
    case "tags":
      return c.tags.includes(cond.value);
    case "attribs":
      return matchesAttrib(c, cond.key, cond.op, cond.value);
    case "email":
    case "name": {
      const v = (cond.field === "email" ? c.email : c.name) ?? "";
      return v.toLowerCase().includes(cond.value.toLowerCase());
    }
    case "engagement":
      return matchesEngagement(c, events, cond.op, cond.deliverable_id);
  }
}

/** Pure: decide which contacts match a filter, given the contacts and the
 *  (already scoped) email_events rows relevant to it. No I/O. */
export function evaluateSegment(
  contacts: readonly SegmentContact[],
  events: readonly SegmentEventRow[],
  filter: Condition,
): SegmentContact[] {
  return contacts.filter((c) => matches(c, events, filter));
}

/** True if `filter` contains an attribs or engagement condition anywhere in
 *  the tree — the paid-only surface (lib/email/lab/capabilities.ts
 *  FEATURE_ROUTING.contactSegments). Tag-only and email/name-only filters
 *  return false and stay available on every tier. */
export function requiresPaidTier(filter: Condition): boolean {
  if ("and" in filter) return filter.and.some(requiresPaidTier);
  if ("or" in filter) return filter.or.some(requiresPaidTier);
  if ("not" in filter) return requiresPaidTier(filter.not);
  return filter.field === "attribs" || filter.field === "engagement";
}
