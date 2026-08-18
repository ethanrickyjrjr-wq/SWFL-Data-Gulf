// lib/social/design/serialize.ts
import type { SocialFormat } from "@/lib/social/formats";
import type { SocialDesign, SocialElement } from "@/lib/social/design/types";
import { THEMES } from "@/lib/social/design/system";

/** A blank canvas, on the default (dark) theme. The background is the THEME's
 *  canvas — not a hand-typed navy. This file used to carry its own `#0f1d24`,
 *  which was copy #3 of the palette (lib/brand/tokens.ts explains the other four). */
export function newDesign(format: SocialFormat): SocialDesign {
  return { version: 1, format, background: THEMES.dark.canvas, elements: [] };
}

export function serializeDesign(d: SocialDesign): string {
  return JSON.stringify(d);
}

/** Parse + minimal shape-guard. Returns null on anything that isn't a v1 design. */
export function deserializeDesign(s: string): SocialDesign | null {
  let o: unknown;
  try {
    o = JSON.parse(s);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const d = o as Record<string, unknown>;
  if (d.version !== 1) return null;
  if (typeof d.format !== "string") return null;
  if (!Array.isArray(d.elements)) return null;
  return d as unknown as SocialDesign;
}

/** Text fields the AI may write, per element type. The ONLY surface the patch can touch. */
export const TEXT_FIELDS: Partial<Record<SocialElement["type"], readonly string[]>> = {
  text: ["text"],
  stat: ["value", "label"],
  cta: ["text"],
};

/** The ONE field a live `slot` event can carry for this element type, or null.
 *
 *  The wire protocol pins a slot as `{ e: "slot", id: <elementId>, text }`
 *  (`docs/superpowers/specs/2026-08-18-live-build-streaming-design.md` §Event protocol) —
 *  one id, one string. An element with TWO writable fields (`stat`: value + label)
 *  therefore cannot be addressed by it without inventing an id grammar the protocol
 *  does not define, so those fill from the full patch at `done` instead. DERIVED from
 *  TEXT_FIELDS on purpose: a second hand-written list is how the streamed fill and the
 *  final fill start disagreeing about what the AI is allowed to write. */
export function slotFieldFor(type: SocialElement["type"]): string | null {
  const fields = TEXT_FIELDS[type];
  return fields && fields.length === 1 ? fields[0] : null;
}

/** element id -> { type, <current text fields> } — matches the email docSkeleton shape. */
export function designToSkeleton(d: SocialDesign): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const el of d.elements) {
    const fields = TEXT_FIELDS[el.type];
    if (!fields) continue;
    const rec: Record<string, string> = { type: el.type };
    for (const f of fields) {
      const v = (el as unknown as Record<string, unknown>)[f];
      if (typeof v === "string") rec[f] = v;
    }
    out[el.id] = rec;
  }
  return out;
}

/**
 * Apply an AI patch (element id -> { field: value }) to TEXT FIELDS ONLY. Geometry,
 * colors, images, urls, and unknown ids are never touched. Returns a new design.
 */
export function applyDesignPatch(
  d: SocialDesign,
  patch: Record<string, Record<string, unknown>>,
): SocialDesign {
  const elements = d.elements.map((el) => {
    const p = patch[el.id];
    const fields = TEXT_FIELDS[el.type];
    if (!p || !fields) return el;
    const next = { ...el } as Record<string, unknown>;
    for (const f of fields) {
      const v = p[f];
      if (typeof v === "string" && v.trim()) next[f] = v;
    }
    return next as unknown as SocialElement;
  });
  return { ...d, elements };
}
