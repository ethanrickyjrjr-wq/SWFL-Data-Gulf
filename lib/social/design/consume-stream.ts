//
// Pure reducer the SOCIAL canvas runs over stream events (spec 2026-08-18).
// Twin of `lib/email/lab/consume-stream.ts`; it exists separately because the
// canvas state is a `SocialDesign` (elements + geometry), not an `EmailDoc`
// (blocks + props) — one reducer over both shapes would be a union branch in
// every case. It lives HERE, next to `serialize.ts`, because `serialize.ts` owns
// `TEXT_FIELDS`/`applyDesignPatch` — the write rules this reducer must reuse and
// must never restate.
//
// THE RACE RULE LIVES HERE, keyed by ELEMENT ID: once a user touches an element,
// no AI event may overwrite it (spec failure mode 1) — not a live `slot`, and not
// the full patch that arrives with `done`. Keeping it pure (no React, no fetch) is
// what makes the rule testable without a browser.
import type { BuildStreamEvent } from "@/lib/email/lab/stream-events";
import { applyDesignPatch, slotFieldFor, TEXT_FIELDS } from "./serialize";
import type { SocialDesign, SocialElement } from "./types";

export interface SocialStreamState {
  design: SocialDesign | null;
  /** ELEMENT ids the human has edited since this build started. */
  touched: Set<string>;
  statusLabel: string | null;
  finished: boolean;
  errorMessage: string | null;
}

/** Seeded with the design the build was launched FROM — unlike the email lane, the
 *  social fill has no `skeleton` beat, so the canvas already on screen is the base. */
export function initialSocialStreamState(design: SocialDesign | null = null): SocialStreamState {
  return { design, touched: new Set(), statusLabel: null, finished: false, errorMessage: null };
}

export function markTouchedElement(state: SocialStreamState, elementId: string): SocialStreamState {
  const touched = new Set(state.touched);
  touched.add(elementId);
  return { ...state, touched };
}

function isDesign(d: unknown): d is SocialDesign {
  return (
    !!d &&
    typeof d === "object" &&
    (d as SocialDesign).version === 1 &&
    Array.isArray((d as SocialDesign).elements)
  );
}

/** Carry the human's own words for a touched element across an AUTHOR reseat. Only
 *  the writable TEXT fields are carried — the incoming template's geometry, colors
 *  and images still win, exactly as `applyDesignPatch` scopes the AI. */
function keepMyText(incoming: SocialElement, held: SocialElement | undefined): SocialElement {
  if (!held || held.type !== incoming.type) return incoming;
  const fields = TEXT_FIELDS[incoming.type];
  if (!fields) return incoming;
  const next = { ...incoming } as Record<string, unknown>;
  for (const f of fields) {
    const v = (held as unknown as Record<string, unknown>)[f];
    if (typeof v === "string") next[f] = v;
  }
  return next as unknown as SocialElement;
}

export function applySocialStreamEvent(
  state: SocialStreamState,
  ev: BuildStreamEvent,
): SocialStreamState {
  switch (ev.e) {
    case "status":
      return { ...state, statusLabel: ev.label };

    case "slot": {
      if (!state.design || state.touched.has(ev.id)) return state;
      const el = state.design.elements.find((e) => e.id === ev.id);
      if (!el) return state;
      const field = slotFieldFor(el.type);
      if (!field) return state; // multi-field elements fill from the `done` patch
      return {
        ...state,
        design: applyDesignPatch(state.design, { [ev.id]: { [field]: ev.text } }),
      };
    }

    case "done": {
      const base = { ...state, finished: true, statusLabel: null };
      const payload = ev.payload as
        { patch?: Record<string, Record<string, unknown>>; design?: unknown } | undefined;
      if (!state.design) return base;

      // FILL — the build's full patch. EVERY id in it is checked against `touched`,
      // not just the ones no live slot reached: an element the AI filled by slot and
      // the human then edited is named in this patch too, and replaying it wholesale
      // would hand the human's words back to the server's copy at the last moment.
      // (Same failure shape as the email lane's skeleton reseat, Ruling 11.)
      if (payload?.patch && typeof payload.patch === "object") {
        const merged: Record<string, Record<string, unknown>> = {};
        for (const [id, fields] of Object.entries(payload.patch)) {
          if (state.touched.has(id)) continue;
          merged[id] = fields;
        }
        return { ...base, design: applyDesignPatch(state.design, merged) };
      }

      // AUTHOR — the canvas is RESEATED wholesale with a template's own element ids,
      // which is today's behavior and stays last-one-wins. Only an id present in BOTH
      // designs AND in `touched` keeps the text we already hold.
      if (isDesign(payload?.design)) {
        const incoming = payload.design;
        if (state.touched.size === 0) return { ...base, design: incoming };
        const mine = new Map(state.design.elements.map((e) => [e.id, e]));
        return {
          ...base,
          design: {
            ...incoming,
            elements: incoming.elements.map((e) =>
              state.touched.has(e.id) ? keepMyText(e, mine.get(e.id)) : e,
            ),
          },
        };
      }
      return base;
    }

    case "error":
      return { ...state, errorMessage: ev.message, statusLabel: null };

    default:
      // `skeleton` / `block` are the EMAIL canvas's events — the mirror of that
      // reducer's own `slot` no-op. One protocol, two canvases.
      return state;
  }
}
