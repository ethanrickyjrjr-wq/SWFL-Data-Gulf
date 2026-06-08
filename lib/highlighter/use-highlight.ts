"use client";

import { useCallback, useEffect, useState } from "react";

export type FactType = "metric" | "place";

export interface SelectedFact {
  text: string;
  rect: DOMRect;
  factType: FactType;
  /** Row-level label from the nearest <tr> first cell, or nearest heading. */
  context?: string;
  /** "fact" = specific metric/phrase; "section" = large selection (>25 words). */
  mode: "fact" | "section";
}

/** Classify a selection: a number/currency/percent reads as a "metric", else
 *  a "place" (ZIP names, corridors, towns). Pure so it could be unit-tested. */
export function classifyFact(text: string): FactType {
  const cleaned = text.replace(/[\s,$%]/g, "").replace(/[+\-]/g, "");
  // A metric if, after stripping currency/percent/commas/sign, what's left is
  // numeric (allow a trailing unit like "k"/"m" or a decimal).
  if (/^\d+(\.\d+)?[kmb]?$/i.test(cleaned)) return "metric";
  // Mixed numeric tokens (e.g. "$30,074/yr", "6.2%") — has a digit run.
  if (/[\d][\d,.]*\s*(%|\/yr|bps)/i.test(text)) return "metric";
  return "place";
}

const SUPPRESS_CLOSEST = "input, textarea, [contenteditable], #highlighter-popup, #ask-ai-dock";

function selectionIsSuppressed(sel: Selection): boolean {
  if (sel.rangeCount === 0) return true;
  const node = sel.anchorNode;
  if (!node) return true;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return true;
  return el.closest(SUPPRESS_CLOSEST) !== null;
}

/**
 * Snap the end of a selection forward to the nearest word boundary when the
 * drag released mid-word. Only applies within a single text node and only ever
 * extends — never shortens. Returns null when already at a boundary.
 */
function expandRangeToWordEnd(range: Range): Range | null {
  const node = range.endContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  let end = range.endOffset;
  if (end >= text.length || !/\w/.test(text[end])) return null;
  while (end < text.length && /\w/.test(text[end])) end++;
  try {
    const r = document.createRange();
    r.setStart(range.startContainer, range.startOffset);
    r.setEnd(node, end);
    return r;
  } catch {
    return null;
  }
}

/**
 * Return false for selections that aren't worth surfacing as a popup:
 * too short, unclosed-paren fragments ("national macro (be"), or purely
 * punctuation/whitespace. Caller should clear the DOM selection on false.
 */
function isWorthySelection(text: string): boolean {
  if (text.length < 4) return false;
  if (!/[a-zA-Z0-9]/.test(text)) return false;
  // Unclosed parenthesis = mid-drag fragment
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (opens > closes) return false;
  return true;
}

/**
 * Widen a selection range outward to cover a whole numeric figure when it lands
 * inside one. Dragging across part of "$525,000" (or "$30,074/yr", "-9.7%",
 * "+60bps") snaps to the entire token. Returns a widened Range, or null when
 * the selection isn't inside a single-text-node number (e.g. a place name), so
 * the caller leaves the selection alone.
 */
function expandRangeToNumber(range: Range): Range | null {
  const node = range.startContainer;
  // Only the common case: a selection that lives inside one text node.
  if (node.nodeType !== Node.TEXT_NODE || range.endContainer !== node) return null;
  const text = node.textContent ?? "";
  let start = range.startOffset;
  let end = range.endOffset;
  const NUM = /[0-9.,$%+\-/]/; // currency, percent, ratio, sign, decimals
  // Grow left/right over number characters...
  while (start > 0 && NUM.test(text[start - 1])) start--;
  while (end < text.length && NUM.test(text[end])) end++;
  // ...then a short trailing unit run (k / m / b / bps / yr / sf / mo).
  for (let u = 0; u < 4 && end < text.length && /[a-zA-Z]/.test(text[end]); u++) end++;
  // Drop a trailing sentence period / dangling comma.
  while (end > start && /[.,]/.test(text[end - 1])) end--;
  const widened = text.slice(start, end);
  // Bail unless we captured a digit AND actually grew the original selection.
  if (!/\d/.test(widened)) return null;
  if (start === range.startOffset && end === range.endOffset) return null;
  try {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    return r;
  } catch {
    return null;
  }
}

/**
 * Walk up from the selection anchor to extract the metric label that owns the
 * selected value. Strategy: nearest <tr> → first <td>/<th> text (covers the key-
 * metrics table). Fallback: the nearest preceding sibling heading within any
 * ancestor, for prose sections. Returns undefined when no label is found.
 */
function extractRowContext(node: Node): string | undefined {
  const el: Element | null =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : (node as Text).parentElement;
  if (!el) return undefined;

  // Table row: the first cell is the metric label.
  const row = el.closest("tr");
  if (row) {
    const firstCell = row.querySelector("td, th");
    const label = firstCell?.textContent?.trim();
    if (label) return label;
  }

  // Prose fallback: nearest preceding heading among ancestors.
  let cursor: Element | null = el;
  while (cursor) {
    let sib: Element | null = cursor.previousElementSibling;
    while (sib) {
      if (/^h[1-6]$/i.test(sib.tagName)) {
        const h = sib.textContent?.trim();
        if (h) return h;
      }
      sib = sib.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return undefined;
}

/**
 * Desktop text-selection → fact snapshot. On `mouseup`/`keyup` we wait 10ms for
 * the selection to settle, then snapshot the selected text, its bounding rect,
 * and a coarse fact type. Selections inside form fields, contenteditable, or
 * the popup itself are ignored so the user can type a question without the
 * popup re-triggering. An empty/collapsed selection clears to `null`.
 */
export function useHighlight() {
  const [fact, setFact] = useState<SelectedFact | null>(null);

  const clear = useCallback(() => setFact(null), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    function snapshot() {
      const sel = typeof window !== "undefined" ? window.getSelection() : null;
      if (!sel || sel.isCollapsed || selectionIsSuppressed(sel)) {
        // Clear the popup ONLY on a real collapse in page content. When focus
        // moves into our popup/composer (suppressed), the page selection
        // collapses too — but the user is typing a question, NOT dismissing it.
        // Clearing here is the "popup vanishes mid-compose" bug. Outside-click
        // and Esc still close it via the popup's own handlers.
        if ((!sel || sel.isCollapsed) && !(sel && selectionIsSuppressed(sel))) {
          setFact(null);
        }
        return;
      }
      let range: Range;
      try {
        range = sel.getRangeAt(0);
      } catch {
        return;
      }
      // Snap a number selection to the whole figure, then try word-boundary
      // snap for text. Only one of these will ever apply to a given selection.
      const widened = expandRangeToNumber(range);
      if (widened) {
        sel.removeAllRanges();
        sel.addRange(widened);
        range = widened;
      } else {
        const wordSnapped = expandRangeToWordEnd(range);
        if (wordSnapped) {
          sel.removeAllRanges();
          sel.addRange(wordSnapped);
          range = wordSnapped;
        }
      }
      const text = sel.toString().trim();
      // Reject if the selection starts mid-word (char before start is
      // alphanumeric) — catches "ude). Note" style drag artifacts.
      const startNode = range.startContainer;
      if (
        startNode.nodeType === Node.TEXT_NODE &&
        range.startOffset > 0 &&
        /\w/.test((startNode.textContent ?? "")[range.startOffset - 1])
      ) {
        sel.removeAllRanges();
        setFact(null);
        return;
      }
      // Reject other garbage selections — clear visually so user knows it
      // didn't register rather than surfacing a broken popup.
      if (!text || !isWorthySelection(text)) {
        sel.removeAllRanges();
        setFact(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const context = extractRowContext(range.startContainer);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const mode: "fact" | "section" = wordCount > 25 ? "section" : "fact";
      setFact({ text, rect, factType: classifyFact(text), context, mode });
    }

    // Track mouse-button state so selectionchange (touch path) never fires
    // a snapshot mid-drag — the popup must only appear after mouseup.
    let mouseIsDown = false;
    let selTimer: ReturnType<typeof setTimeout> | null = null;

    function onMouseDown() {
      mouseIsDown = true;
    }
    function onMouseUp() {
      mouseIsDown = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(snapshot, 10);
    }
    function onKeyUp() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(snapshot, 10);
    }
    function onSelectionChange() {
      // Touch double-tap / long-press fires `selectionchange` but not
      // `mouseup`; skip entirely while the mouse button is held (desktop drag).
      if (mouseIsDown) return;
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(snapshot, 300);
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (timer) clearTimeout(timer);
      if (selTimer) clearTimeout(selTimer);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  return { fact, clear };
}
