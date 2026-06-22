"use client";

import { useEffect, useRef, useState } from "react";
import type { Rect } from "@/lib/highlighter/position";

export interface IframeSelection {
  text: string;
  rect: Rect;
}

/**
 * Pure helper: offset a selection rect (iframe-viewport-relative) into the parent
 * document's viewport coordinate space (the iframe's bounding rect is the origin).
 * Width/height are intrinsic to the selection, so they pass through unchanged.
 */
export function translateRect(
  iframeRect: { top: number; left: number },
  selRect: { top: number; left: number; width: number; height: number },
): Rect {
  return {
    top: selRect.top + iframeRect.top,
    left: selRect.left + iframeRect.left,
    width: selRect.width,
    height: selRect.height,
  };
}

/**
 * Listens for text selection inside a same-origin iframe's contentDocument and
 * returns the selected text + its rect translated into parent-viewport coordinates
 * (ready for a `position: fixed` popup). Returns null when nothing is selected.
 *
 * Capture is driven by `mouseup`/`touchend` — the SETTLED selection — NOT by
 * `selectionchange`. A mouse drag fires `selectionchange` continuously as the range
 * grows; publishing those partials would (a) jitter the popup and (b) lock any
 * one-shot consumer (the steer-suggestion ask) onto a fragment of the drag rather
 * than the released text. `selectionchange` is used ONLY to detect collapse so the
 * popup closes when the user clicks away or deselects.
 *
 * Re-attaches listeners on every iframe `load` so they survive in-iframe navigations
 * (a content edit forks a new /p/[id] into the same iframe). Cleans up on unmount.
 */
export function useIframeSelection(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
): IframeSelection | null {
  const [selection, setSelection] = useState<IframeSelection | null>(null);
  // Stable cleanup ref so we never close over a stale contentDocument.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    function attach() {
      // Tear down any prior binding (re-fire on `load`) before rebinding.
      cleanupRef.current?.();
      cleanupRef.current = null;

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe || !doc) return;

      function currentText(): { text: string; range: Range } | null {
        const el = iframeRef.current;
        const sel = el?.contentWindow?.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
        const text = sel.toString().trim();
        if (!text) return null;
        return { text, range: sel.getRangeAt(0) };
      }

      // SETTLED selection → publish (translated into parent-viewport coords).
      function capture() {
        const el = iframeRef.current;
        const got = currentText();
        if (!el || !got) {
          setSelection(null);
          return;
        }
        const selRect = got.range.getBoundingClientRect();
        const ifrRect = el.getBoundingClientRect();
        setSelection({ text: got.text, rect: translateRect(ifrRect, selRect) });
      }

      // COLLAPSE detection only — never publishes a growing mid-drag selection.
      function onSelectionChange() {
        if (!currentText()) setSelection(null);
      }

      doc.addEventListener("mouseup", capture);
      doc.addEventListener("touchend", capture);
      doc.addEventListener("selectionchange", onSelectionChange);
      cleanupRef.current = () => {
        doc.removeEventListener("mouseup", capture);
        doc.removeEventListener("touchend", capture);
        doc.removeEventListener("selectionchange", onSelectionChange);
      };
    }

    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      iframe.removeEventListener("load", attach);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [iframeRef]);

  return selection;
}
