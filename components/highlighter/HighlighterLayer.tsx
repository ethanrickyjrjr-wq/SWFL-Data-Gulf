"use client";

import { useState } from "react";
import {
  useHighlight,
  type SelectedFact,
} from "@/lib/highlighter/use-highlight";
import { suggestionsForMetric } from "@/lib/highlighter/suggestions";
import { HighlightPopup } from "./HighlightPopup";
import { FirstTouchHint } from "./FirstTouchHint";

interface LayerProps {
  reportId: string;
  conclusion?: string;
  freshnessToken?: string;
}

/**
 * The single mount point for the Highlighter on a /r/ report page. It is a
 * SIBLING of the report content (never a wrapper), so if anything in here
 * throws, the report itself is already painted and unaffected. It listens for
 * text selection (and FactChip taps, via the same `onActivate` shape) and shows
 * the popup anchored to the selection.
 */
export function HighlighterLayer({
  reportId,
  conclusion,
  freshnessToken,
}: LayerProps) {
  const { fact: selectedFact, clear } = useHighlight();
  // A chip tap can override the text-selection fact; track it separately and
  // prefer it when present.
  const [chipFact, setChipFact] = useState<SelectedFact | null>(null);

  const fact = chipFact ?? selectedFact;

  function close() {
    setChipFact(null);
    clear();
    // Drop any lingering native selection so it can't immediately re-open.
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }

  if (!fact) return <FirstTouchHint />;

  // Derive client-side suggestions from the selected text. We don't know the
  // canonical metric key for an arbitrary selection, so feed the visible text
  // as both metric and value — the helper humanizes it into readable prompts.
  const suggestions = suggestionsForMetric(
    { metric: fact.text, value: fact.text },
    reportId,
  );

  return (
    <>
      <HighlightPopup
        reportId={reportId}
        fact={fact}
        suggestions={suggestions}
        conclusion={conclusion}
        freshnessToken={freshnessToken}
        onClose={close}
      />
      <FirstTouchHint />
    </>
  );
}
