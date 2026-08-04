// lib/email/link-audit.ts
//
// The dead-link floor (spec 2026-07-12-email-link-destinations). Two pure halves:
//   auditDocLinks — find CLICK-PROMISING slots with no destination (a labeled
//     button, a listing card, a written link-label). Decorative wrap-links
//     (hero/text/image linkUrl) are OPTIONAL and never flagged — no nagging.
//   applyLinkFallbacks — the send-time ladder: subject listing page → brand
//     website → reply-by-email → hosted report page. First available rung fills
//     each unresolved slot; ladder empty → doc unchanged (callers log it).
// Engine/user writes only — the AI never touches a URL (schema strip mode).

import type { EmailDoc } from "./doc/types";
import {
  buttonRoleOf,
  resolveButtonDestination,
  type SavedDestinations,
} from "./button-destinations";

export interface LinkAsk {
  blockId: string;
  blockType: "button" | "listing" | "multi-column";
  /** What the reader was promised — the button label, card price/address, or link label. */
  label: string;
  /** multi-column only: which column's linkLabel is unresolved. */
  columnIndex?: number;
}

export interface FallbackCtx {
  listingUrl?: string | null;
  brandWebsiteUrl?: string | null;
  replyMailto?: string | null;
  hostedUrl?: string | null;
  /**
   * The agent's per-role saved button destinations, from their brand.
   *
   * WHY IT LIVES HERE AND NOT ONLY IN `applyBrand`: all four send paths call this
   * module — the lab claim-and-send route, the blast route, and the two SCHEDULED
   * lanes (`emaildoc-occurrence.ts`, `sequence/frozen-occurrence.ts`). The scheduled
   * lanes call this ladder but never call `applyBrand` at all (open defect
   * `applybrand_no_server_side_caller`), so wiring role destinations in HERE is what
   * makes an agent's saved links apply on an automated send instead of only in the
   * Lab. Without this rung the feature is a green lab demo and the leak stays live.
   */
  savedDestinations?: SavedDestinations;
}

export interface AppliedFallback {
  blockId: string;
  url: string;
  rung: "saved-role" | "listing" | "website" | "reply" | "hosted";
  columnIndex?: number;
}

const has = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";

/** The subject property's link as the doc holds it: the listing card's linkUrl,
 *  else the hero photo's click-through (both are captured/preset, never minted). */
export function subjectListingUrl(doc: EmailDoc): string | null {
  for (const b of doc.blocks) {
    if (b.type === "listing" && has(b.props.linkUrl)) return b.props.linkUrl.trim();
  }
  for (const b of doc.blocks) {
    if (b.type === "image" && b.props.kind === "photo" && has(b.props.linkUrl)) {
      return b.props.linkUrl.trim();
    }
  }
  return null;
}

export function auditDocLinks(doc: EmailDoc): LinkAsk[] {
  const asks: LinkAsk[] = [];
  for (const b of doc.blocks) {
    if (b.type === "button" && has(b.props.label) && !has(b.props.url)) {
      asks.push({ blockId: b.id, blockType: "button", label: b.props.label.trim() });
    } else if (b.type === "listing" && !has(b.props.linkUrl)) {
      const label = [b.props.price, b.props.address].find(has) ?? "Listing card";
      asks.push({ blockId: b.id, blockType: "listing", label: label.trim() });
    } else if (b.type === "multi-column") {
      (b.props.columns ?? []).forEach((c, i) => {
        if (has(c.linkLabel) && !has(c.linkUrl)) {
          asks.push({
            blockId: b.id,
            blockType: "multi-column",
            label: c.linkLabel.trim(),
            columnIndex: i,
          });
        }
      });
    }
  }
  return asks;
}

function firstRung(ctx: FallbackCtx): { url: string; rung: AppliedFallback["rung"] } | null {
  if (has(ctx.listingUrl)) return { url: ctx.listingUrl.trim(), rung: "listing" };
  if (has(ctx.brandWebsiteUrl)) return { url: ctx.brandWebsiteUrl.trim(), rung: "website" };
  if (has(ctx.replyMailto)) return { url: ctx.replyMailto.trim(), rung: "reply" };
  if (has(ctx.hostedUrl)) return { url: ctx.hostedUrl.trim(), rung: "hosted" };
  return null;
}

export function applyLinkFallbacks(
  doc: EmailDoc,
  ctx: FallbackCtx,
): { doc: EmailDoc; applied: AppliedFallback[] } {
  const asks = auditDocLinks(doc);
  if (asks.length === 0) return { doc, applied: [] };
  const rung = firstRung(ctx);
  // An agent with a saved per-role destination and NOTHING else on the ladder must
  // still get their link applied — so the empty-ladder early return has to account
  // for the saved map too, or the scheduled lanes silently skip the whole feature.
  const hasSaved = Object.values(ctx.savedDestinations ?? {}).some(has);
  if (!rung && !hasSaved) return { doc, applied: [] };

  const applied: AppliedFallback[] = [];
  const byBlock = new Map<string, LinkAsk[]>();
  for (const a of asks) {
    byBlock.set(a.blockId, [...(byBlock.get(a.blockId) ?? []), a]);
  }

  const blocks = doc.blocks.map((b) => {
    const blockAsks = byBlock.get(b.id);
    if (!blockAsks) return b;
    if (b.type === "button") {
      // The agent's OWN saved destination for this button's role outranks every
      // generic rung — it is an explicit choice, the ladder below is a guess.
      // Deliberately does NOT stamp `urlSource: "user"`: this is a send-time
      // fallback, and marking it user-owned would immunize the guess against the
      // next brand overlay forever.
      const role = resolveButtonDestination({
        role: buttonRoleOf((b.props as { role?: unknown }).role),
        authoredUrl: null,
        saved: ctx.savedDestinations,
        // The generic ladder below already owns website/hosted; this call exists
        // only to surface a SAVED per-role value, so the lower rungs stay null.
        websiteUrl: null,
        housePage: null,
      });
      const pick = role.url ?? rung?.url;
      if (!pick) return b; // saved map empty for this role AND no generic ladder
      const pickRung: AppliedFallback["rung"] = role.url ? "saved-role" : rung!.rung;
      applied.push({ blockId: b.id, url: pick, rung: pickRung });
      return { ...b, props: { ...b.props, url: pick } };
    }
    if (!rung) return b; // non-button slots have only the generic ladder
    if (b.type === "listing") {
      applied.push({ blockId: b.id, url: rung.url, rung: rung.rung });
      return { ...b, props: { ...b.props, linkUrl: rung.url } };
    }
    if (b.type === "multi-column") {
      const idxs = new Set(blockAsks.map((a) => a.columnIndex));
      const columns = (b.props.columns ?? []).map((c, i) => {
        if (!idxs.has(i)) return c;
        applied.push({ blockId: b.id, url: rung.url, rung: rung.rung, columnIndex: i });
        return { ...c, linkUrl: rung.url };
      });
      return { ...b, props: { ...b.props, columns } };
    }
    return b;
  });
  return { doc: { ...doc, blocks } as EmailDoc, applied };
}
