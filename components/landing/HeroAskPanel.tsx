// components/landing/HeroAskPanel.tsx
"use client";

import { AnswerText } from "@/components/answer/AnswerText";

/**
 * Ask-mode's inline result, directly under the hero bar (spec 2026-07-12).
 * Purely presentational — HeroBar owns the useConverse hook and feeds this
 * panel, so the streaming logic stays in the ONE shared engine wrapper and
 * this stays trivially testable. Never a dead end: streaming, answered, and
 * error states all keep the /ask door visible or one line away.
 */
export function HeroAskPanel({
  question,
  answer,
  streaming,
  error,
}: {
  question: string | null;
  answer: string;
  streaming: boolean;
  error: string | null;
}) {
  if (!question) return null;
  const askHref = `/ask?q=${encodeURIComponent(question)}`;
  return (
    <div className="hero-ask-panel" role="status" aria-live="polite">
      {streaming && !answer && <p className="hero-ask-working">Reading the live data…</p>}
      {answer && (
        <p className="hero-ask-answer">
          <AnswerText text={answer} />
        </p>
      )}
      {error && !streaming && <p className="hero-ask-error">{error}</p>}
      {!streaming && (answer || error) && (
        <a className="hero-ask-more" href={askHref}>
          Keep going →
        </a>
      )}
    </div>
  );
}
