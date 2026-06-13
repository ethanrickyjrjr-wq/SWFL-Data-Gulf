"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

/** The four hardcoded arrival prompts. #1 leads with the recurring-email hook (the
 *  product); #2 is the instant "try it" build; #3 and #4 are conversion prompts. */
const PROMPTS = [
  "Auto-email fresh market data to my clients every week, in my brand",
  "Build me a cited one-pager for a ZIP right now",
  "What's the best lead-gen send for my buyers vs. sellers?",
  "Run this inside my own AI (Claude / ChatGPT)",
];

/**
 * The general, multi-turn conversational chat — the recurring-email hook and the
 * conversational prompts. Extracted verbatim from the original WelcomeChat so its
 * streaming behavior (and the grounded `/api/welcome/chat` route it now drives)
 * is unchanged; the ZIP-first grounded answer lives in its sibling GroundedAnswer.
 */
export function ConversationalChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/welcome/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.replace(/^data: /, "").trim();
          if (!line) continue;
          const evt = JSON.parse(line) as { text?: string; done?: boolean; error?: string };
          if (evt.text) {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                role: "assistant",
                content: copy[copy.length - 1].content + evt.text,
              };
              return copy;
            });
          }
        }
        scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: "Sorry — something went wrong. Try again.",
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {messages.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded-lg border border-gulf-haze bg-gulf-slate px-4 py-3 text-left text-sm text-text-primary transition-colors hover:border-[color:var(--brand-primary)]"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gulf-haze bg-gulf-deep p-5">
        <div ref={scrollRef} className="mb-4 max-h-80 space-y-3 overflow-y-auto">
          {messages.map((m, i) => (
            <p
              key={i}
              className={
                m.role === "user"
                  ? "text-sm font-medium text-text-primary"
                  : "whitespace-pre-wrap text-sm text-text-secondary"
              }
            >
              {m.content || (busy ? "…" : "")}
            </p>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 rounded-lg border border-gulf-haze bg-gulf-slate px-4 py-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about SWFL real estate, permits, flood risk…"
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-text-on-accent disabled:opacity-50"
            style={{ background: "var(--brand-primary)" }}
          >
            Send
          </button>
        </form>
        <p className="mt-3 font-mono text-[11px] text-text-tertiary">
          Set it once. It emails your clients fresh, cited SWFL data on autopilot.{" "}
          <a href="/billing" className="text-gulf-teal underline underline-offset-2">
            See pricing →
          </a>
        </p>
      </div>
    </div>
  );
}
