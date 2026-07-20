"use client";

// The post-build link ask (spec 2026-07-12-email-link-destinations §4). After a
// build leaves CLICK-PROMISING slots with no destination (a labeled button, a
// listing card, a written link-label), ONE dismissible modal collects the URLs —
// type one in or tap a suggestion chip. Answers land in user-owned sticky fields
// via the shell's updateBlock; the AI never writes a URL. Skipping is safe: the
// send-time fallback ladder is the floor, so nothing dead ever ships.

import { useState } from "react";
import type { LinkAsk } from "@/lib/email/link-audit";

export interface LinkSuggestion {
  label: string;
  url: string;
}

export function LinkAskModal({
  asks,
  suggestions,
  onApply,
  onClose,
}: {
  asks: LinkAsk[];
  /** Ordered chips shown under every row: listing page, website, reply-by-email. */
  suggestions: LinkSuggestion[];
  /** ONE call with every answered row — the shell writes them into the doc in a
   *  single commit (per-row writes would each clone the same stale doc and
   *  clobber one another). */
  onApply: (answers: { ask: LinkAsk; url: string }[]) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const keyOf = (a: LinkAsk) => `${a.blockId}:${a.columnIndex ?? ""}`;

  // Two independently-sourced suggestions (the listing card, the brand website) can
  // legitimately resolve to the SAME url — e.g. an agent's website IS the listing
  // link. Rendered as-is that produced two chips with the same React key (a real
  // console error) plus a redundant duplicate-destination chip. Keep the first
  // occurrence (the more specific label wins over the generic "Your website" one).
  const dedupedSuggestions = suggestions.filter(
    (s, i) => suggestions.findIndex((t) => t.url === s.url) === i,
  );

  const applyAll = () => {
    const answers = asks.flatMap((a) => {
      const v = (values[keyOf(a)] ?? "").trim();
      return v ? [{ ask: a, url: v }] : [];
    });
    if (answers.length > 0) onApply(answers);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Where should these send readers?</h2>
        <p className="mt-1 text-sm text-gray-500">
          These parts of your email promise a click but have no destination yet. Add a link, tap a
          suggestion, or skip — anything left empty gets a safe destination at send time.
        </p>
        <div className="mt-4 flex max-h-[50dvh] flex-col gap-4 overflow-y-auto">
          {asks.map((a) => (
            <div key={keyOf(a)}>
              <div className="text-sm font-medium text-gray-800">&ldquo;{a.label}&rdquo;</div>
              <input
                type="url"
                placeholder="https://…"
                value={values[keyOf(a)] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [keyOf(a)]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {dedupedSuggestions.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {dedupedSuggestions.map((s) => (
                    <button
                      key={s.url}
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, [keyOf(a)]: s.url }))}
                      className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-600"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={applyAll}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save links
          </button>
        </div>
      </div>
    </div>
  );
}
