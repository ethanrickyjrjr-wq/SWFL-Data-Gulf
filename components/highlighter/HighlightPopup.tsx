"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { popupPosition, type Position } from "@/lib/highlighter/position";
import { parseSSEFrames } from "@/lib/highlighter/sse";
import { buildClaudeHandoff } from "@/lib/highlighter/handoff";
import type { SelectedFact } from "@/lib/highlighter/use-highlight";

type Stage = "suggestions" | "ask" | "answer";

interface PopupProps {
  reportId: string;
  fact: SelectedFact;
  suggestions: string[];
  conclusion?: string;
  freshnessToken?: string;
  onClose: () => void;
}

const POPUP_ID = "highlighter-popup";

export function HighlightPopup({
  reportId,
  fact,
  suggestions,
  conclusion,
  freshnessToken,
  onClose,
}: PopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [stage, setStage] = useState<Stage>("suggestions");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [reach, setReach] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- Placement: measure the popup, position via the pure helper. ---
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const popupSize = {
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    const anchor = {
      top: fact.rect.top,
      left: fact.rect.left,
      width: fact.rect.width,
      height: fact.rect.height,
    };
    setPos(
      popupPosition(anchor, popupSize, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [fact, stage, answer]);

  // --- Esc + outside-click close (X is wired to onClose directly). ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    // mousedown so it fires before a new selection's mouseup re-opens us.
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const ask = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setStage("answer");
      setAnswer("");
      setReach([]);
      setError(null);
      setStreaming(true);
      try {
        const res = await fetch("/api/converse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            report_id: reportId,
            fact: fact.text,
            question: trimmed,
          }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let acc = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSSEFrames(buffer);
          buffer = rest;
          for (const ev of events) {
            if (ev.error) {
              setError(ev.error);
              setStreaming(false);
              return;
            }
            if (typeof ev.text === "string") {
              acc += ev.text;
              setAnswer(acc);
            }
            if (ev.done) {
              if (Array.isArray(ev.reach)) setReach(ev.reach);
              setStreaming(false);
            }
          }
        }
      } catch (e) {
        setError((e as Error).message || "Something went wrong.");
      } finally {
        setStreaming(false);
      }
    },
    [reportId, fact.text],
  );

  const handoff = buildClaudeHandoff({
    report_id: reportId,
    fact: fact.text,
    conclusion: conclusion ?? "",
    freshness_token: freshnessToken ?? "",
  });

  function copyHandoff() {
    void navigator.clipboard?.writeText(handoff).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => setCopied(false),
    );
  }

  return (
    <div
      id={POPUP_ID}
      ref={ref}
      role="dialog"
      aria-label="Ask about this figure"
      className="glass-card-modern fixed z-[60] w-[min(92vw,340px)] rounded-xl border border-white/10 p-4 text-sm shadow-2xl shadow-black/40"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="min-w-0 break-words font-mono text-[#00d4aa]">
          {fact.text}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.3 3.3 8 7l3.7-3.7 1 1L9 8l3.7 3.7-1 1L8 9l-3.7 3.7-1-1L7 8 3.3 4.3z" />
          </svg>
        </button>
      </div>

      {stage === "suggestions" && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-gray-400">
            Ask about this
          </p>
          <ul className="flex flex-col gap-1.5">
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-gray-200 transition-colors hover:border-[#00d4aa]/50 hover:text-[#00d4aa]"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setStage("ask")}
            className="mt-2 text-xs text-gray-400 underline underline-offset-2 hover:text-[#00d4aa]"
          >
            Ask your own question →
          </button>
        </div>
      )}

      {stage === "ask" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <textarea
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Ask anything about this figure…"
            className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-gray-100 placeholder:text-gray-600 focus:border-[#00d4aa]/50 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStage("suggestions")}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={!question.trim()}
              className="btn-gradient rounded-lg px-4 py-1.5 text-xs font-semibold text-navy-dark disabled:opacity-40"
            >
              Ask
            </button>
          </div>
        </form>
      )}

      {stage === "answer" && (
        <div>
          <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap leading-6 text-gray-200">
            {error ? (
              <span className="text-[#e08158]">{error}</span>
            ) : (
              <>
                {answer}
                {streaming && (
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#00d4aa]/70 align-middle" />
                )}
              </>
            )}
          </div>
          {reach.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              Also pulled: {reach.join(", ")}
            </p>
          )}
          {!streaming && !error && (
            <button
              type="button"
              onClick={() => {
                setStage("suggestions");
                setAnswer("");
                setReach([]);
              }}
              className="mt-3 text-xs text-gray-400 underline underline-offset-2 hover:text-[#00d4aa]"
            >
              Ask another →
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        <button
          type="button"
          disabled
          title="Charting is coming soon"
          className="cursor-not-allowed rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-500"
        >
          Chart this · soon
        </button>
        <button
          type="button"
          onClick={copyHandoff}
          className="text-xs text-[#60a5fa] underline decoration-[#60a5fa]/40 underline-offset-2 transition-colors hover:decoration-[#60a5fa]"
        >
          {copied ? "Copied ✓" : "Copy prompt for Claude ↗"}
        </button>
      </div>
    </div>
  );
}
