import { inferScopeFromItems, type InferredScope } from "./derive-name";
import { identityKeyForItem } from "./identity-key";
import { summarizeItem } from "./summarize-item";
import { itemFreshnessToken } from "./digest";
import { tokenDayKey, tokenVersion } from "./as-of";
import type { ProjectItem } from "./items";

/**
 * Cross-project intelligence (Piece 2 §B) — the broker's "you already have this / it's
 * missing there" layer. Deterministic, exact-identity, scope-anchored for v1 (no
 * embeddings — fuzzy/semantic pairing is deferred). Built on the fly from one
 * `select id, title, items` over the user's projects (no cached table in v1).
 *
 * Semantics (a deliberate, documented refinement of the muddled plan bullets — exact
 * identity match can't distinguish "the same data" from "complementary data", so the two
 * pull-in cases collapse and the genuinely-distinct push-out case stands on its own):
 *   • reuse — a data point a *scope-matching* OTHER project has that THIS one lacks
 *             → "you already pulled {label} into {Other} — add it here too?" (pull in)
 *   • gap   — a data point THIS project has that a *scope-matching* OTHER project lacks
 *             → "{Other} covers the same area but is missing {label} — add it there?" (push out)
 *   • pairing — reserved; true complementary-metric pairing needs semantic similarity
 *               (deferred with embeddings). v1 returns []. Kept in the shape so the
 *               prompt engine + callers don't change when it lands.
 *
 * Conservative on purpose (the priority is "don't nag"): an overlap fires only on an
 * EXACT identity key match AND a shared place/ZIP between the two projects. A shared
 * topic alone is too broad to anchor (every flood project would "match"), so it does not
 * count. Dismissed keys (`ui_state.dismissed_overlap_keys`) are suppressed.
 */

export interface IndexedProject {
  projectId: string;
  title: string;
  scope: InferredScope & { address?: string };
  keys: Set<string>;
  /** identityKey → a human label for prompt copy (first item wins per key). */
  labelByKey: Map<string, string>;
  /** identityKey → the matched item's OWN freshness token (first item wins per key), or
   *  undefined for kinds that carry none (note/source/file/chart/frame, uncited qa/report).
   *  Lets an overlap offer be stamped with the datum's real vintage + gated to grounded,
   *  dated items only. */
  tokenByKey: Map<string, string | undefined>;
}

export interface CrossProjectIndex {
  projects: IndexedProject[];
}

export type OverlapType = "reuse" | "gap" | "pairing";

export interface OverlapHit {
  type: OverlapType;
  identityKey: string;
  /** Human label for the data point (drives the prompt copy). */
  label: string;
  /** The matched item's own freshness token, or undefined for token-less kinds. Renderers
   *  stamp the offer with this vintage and gate offers to grounded (token-bearing) items. */
  freshnessToken?: string;
  otherProjectId: string;
  otherProjectTitle: string;
  /** Stable key for `ui_state.dismissed_overlap_keys`. */
  dedupeKey: string;
}

export interface Overlap {
  reuse: OverlapHit[];
  gap: OverlapHit[];
  pairing: OverlapHit[];
}

export interface ProjectItemsRow {
  projectId: string;
  title: string;
  items: ProjectItem[];
}

export function buildCrossProjectIndex(projects: ProjectItemsRow[]): CrossProjectIndex {
  return {
    projects: projects.map((p) => {
      const keys = new Set<string>();
      const labelByKey = new Map<string, string>();
      const tokenByKey = new Map<string, string | undefined>();
      // Per key, keep the FRESHEST grounded (token-bearing) copy's token AND label
      // together — a metric re-filed after a refresh shares its identity key, and a fresh
      // date stamped onto a stale value would mis-represent a reuse offer. "Freshest" =
      // max YYYYMMDD day, then higher refinery version on a same-day tie — the SAME recency
      // tiebreak digest.ts uses for the project-newest token. Token-less / undateable kinds
      // (note/source/file/uncited qa) fall back to a first-wins label and carry their token
      // as-is (undefined for token-less), so the offer gate behaves exactly as before.
      const bestDay = new Map<string, string>();
      const bestVer = new Map<string, number>();
      for (const it of p.items) {
        const k = identityKeyForItem(it);
        keys.add(k);
        const tok = itemFreshnessToken(it);
        const day = tok ? tokenDayKey(tok) : null;
        if (tok && day) {
          const ver = tokenVersion(tok) ?? -1;
          const curDay = bestDay.get(k);
          const newer =
            curDay === undefined ||
            day > curDay ||
            (day === curDay && ver > (bestVer.get(k) ?? -1));
          if (newer) {
            bestDay.set(k, day);
            bestVer.set(k, ver);
            labelByKey.set(k, summarizeItem(it));
            tokenByKey.set(k, tok);
          }
        } else if (!labelByKey.has(k)) {
          labelByKey.set(k, summarizeItem(it));
          tokenByKey.set(k, tok);
        }
      }
      return {
        projectId: p.projectId,
        title: p.title,
        scope: inferScopeFromItems(p.items),
        keys,
        labelByKey,
        tokenByKey,
      };
    }),
  };
}

function normPlace(p: string): string {
  return p.trim().toLowerCase();
}

/** Two scopes match when they share a ZIP, or a place. Topic alone is too broad to
 *  anchor (it would nag / over-pull), so it never counts. The ONE scope-match root —
 *  the overlap finder AND assemble-on-command both use it. */
export function scopesMatch(a: IndexedProject["scope"], b: IndexedProject["scope"]): boolean {
  if (a.zip && b.zip) return a.zip === b.zip;
  if (a.place && b.place) return normPlace(a.place) === normPlace(b.place);
  return false;
}

/**
 * Find reuse / gap overlaps for the currently-open project against the user's other
 * projects. `currentProjectId` must be present in the index (it's built from all the
 * user's projects, including the open one). Dismissed dedupe keys are suppressed.
 */
export function findOverlap(
  currentProjectId: string,
  index: CrossProjectIndex,
  opts?: { dismissed?: string[] },
): Overlap {
  const dismissed = new Set(opts?.dismissed ?? []);
  const self = index.projects.find((p) => p.projectId === currentProjectId);
  if (!self) return { reuse: [], gap: [], pairing: [] };

  const others = index.projects.filter(
    (p) => p.projectId !== currentProjectId && scopesMatch(self.scope, p.scope),
  );

  const reuse: OverlapHit[] = [];
  const seenReuse = new Set<string>();
  for (const o of others) {
    for (const k of o.keys) {
      if (self.keys.has(k)) continue; // self already has it → not a reuse
      if (seenReuse.has(k)) continue; // already surfaced from another project
      const dedupeKey = `reuse:${k}`;
      if (dismissed.has(dedupeKey)) continue;
      seenReuse.add(k);
      reuse.push({
        type: "reuse",
        identityKey: k,
        label: o.labelByKey.get(k) ?? k,
        freshnessToken: o.tokenByKey.get(k),
        otherProjectId: o.projectId,
        otherProjectTitle: o.title,
        dedupeKey,
      });
    }
  }

  const gap: OverlapHit[] = [];
  for (const k of self.keys) {
    for (const o of others) {
      if (o.keys.has(k)) continue; // other has it → no gap
      const dedupeKey = `gap:${k}:${o.projectId}`;
      if (dismissed.has(dedupeKey)) continue;
      gap.push({
        type: "gap",
        identityKey: k,
        label: self.labelByKey.get(k) ?? k,
        freshnessToken: self.tokenByKey.get(k),
        otherProjectId: o.projectId,
        otherProjectTitle: o.title,
        dedupeKey,
      });
    }
  }

  return { reuse, gap, pairing: [] };
}
