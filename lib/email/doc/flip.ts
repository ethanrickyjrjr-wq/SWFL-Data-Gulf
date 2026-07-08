// lib/email/doc/flip.ts
//
// Flip-to-correct (M2 fence spec) — when a user reorders a blessed two-block row
// on the canvas (swaps photo-left/text-right → text-left/photo-right), the
// side-dependent props must flip so the row still reads correctly. PURE and
// deterministic — no model call, no I/O. Only left↔right flips; center is
// side-neutral and stays put. Returns the SAME block reference when nothing
// changed (so callers can skip a no-op history frame).
import type { EmailBlock, TextAlign } from "./types";

/** left↔right; center (and undefined) unchanged. */
export function flipAlign(a?: TextAlign): TextAlign | undefined {
  if (a === "left") return "right";
  if (a === "right") return "left";
  return a;
}

/** Flip a block's side-dependent props: `text.align` and `image.overlayAlign`.
 *  Every other block is side-neutral and returned untouched. */
export function flipBlockSide(block: EmailBlock): EmailBlock {
  if (block.type === "text") {
    const flipped = flipAlign(block.props.align);
    if (flipped === block.props.align) return block;
    return { ...block, props: { ...block.props, align: flipped } };
  }
  if (block.type === "image") {
    const flipped = flipAlign(block.props.overlayAlign);
    if (flipped === block.props.overlayAlign) return block;
    return { ...block, props: { ...block.props, overlayAlign: flipped } };
  }
  return block;
}
