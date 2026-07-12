// lib/email/doc/edit-path.ts — PURE. The one write path for on-canvas inline edits.
//
// A dot path addresses a string inside block.props ("body", "stats.0.value",
// "items.2.text"). `undefined` DELETES the leaf key (popover Clear); "" is KEPT
// (an empty field stays an open AI slot per the seed slot rule). Traversing a
// missing container or an out-of-range index returns the block unchanged —
// inline editing can retitle a row, never create one.
import type { EmailBlock } from "./types";

export function applyTextAtPath(
  block: EmailBlock,
  path: string,
  text: string | undefined,
): EmailBlock {
  const segs = path.split(".");

  const setIn = (node: unknown, i: number): unknown => {
    const key = segs[i];
    if (Array.isArray(node)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) return node;
      const child = setIn(node[idx], i + 1);
      if (child === node[idx]) return node;
      const next = node.slice();
      next[idx] = child;
      return next;
    }
    if (node !== null && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (i === segs.length - 1) {
        if (text === undefined) {
          if (!(key in obj)) return node;
          const rest = { ...obj };
          delete rest[key];
          return rest;
        }
        if (obj[key] === text) return node;
        return { ...obj, [key]: text };
      }
      if (!(key in obj)) return node;
      const child = setIn(obj[key], i + 1);
      if (child === obj[key]) return node;
      return { ...obj, [key]: child };
    }
    return node;
  };

  const nextProps = setIn(block.props, 0);
  if (nextProps === block.props) return block;
  return { ...block, props: nextProps } as EmailBlock;
}
