"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStream } from "@/lib/chat/use-chat-stream";

/**
 * The global Briefcase's standalone chat (off /r/*). Streams via the SHARED
 * useChatStream hook against /api/welcome/chat — the same Haiku-grounded SWFL
 * funnel chat the welcome page uses — so there is no forked stream (A-6 DRY).
 * `starterPrompts` are the context-aware prompts the panel computes from A-7
 * (page + anon revisit count); shown only until the first message.
 *
 * The free weekly cap is enforced server-side by /api/welcome/chat when
 * WELCOME_CHAT_FREE_WEEKLY_CAP is set — no metering code lives here (A-6 step 3).
 */
export function BriefcaseChat({ starterPrompts = [] }: { starterPrompts?: string[] }) {
  const { messages, busy, send } = useChatStream("/api/welcome/chat");
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view while streaming — DOM-only effect (no setState).
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  return (
    <div className="flex flex-col">
      {messages.length === 0 && starterPrompts.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {starterPrompts.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => send(p)}
                className="w-full rounded-lg border border-[#0a8078] bg-[#0a8078]/10 px-3 py-2 text-left text-xs text-[#f0ede6] transition-colors hover:bg-[#0a8078]/20 hover:text-[#0a8078]"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}

      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="mb-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-[#0f1d24] p-3"
        >
          {messages.map((m, i) => (
            <p
              key={i}
              className={
                m.role === "user"
                  ? "text-xs font-medium text-[#f0ede6]"
                  : "whitespace-pre-wrap text-xs leading-5 text-gray-300"
              }
            >
              {m.content || (busy ? "…" : "")}
            </p>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
          setInput("");
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
              setInput("");
            }
          }}
          rows={2}
          disabled={busy}
          placeholder="Ask about SWFL real estate, permits, flood risk…"
          className="min-w-0 flex-1 resize-none rounded-lg border border-[#0a8078] bg-[#152832] px-3 py-2 text-xs text-[#f0ede6] placeholder:text-gray-500 focus:border-[#0a8078] focus:outline-none focus:ring-1 focus:ring-[#0a8078]/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="btn-gradient shrink-0 rounded-lg px-4 py-2 text-xs font-semibold text-navy-dark disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
