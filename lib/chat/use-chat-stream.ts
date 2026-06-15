"use client";

import { useState } from "react";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface ChatFrame {
  text?: string;
  done?: boolean;
  error?: string;
}

/**
 * Parse ONE SSE frame block (`data: {...}`) into a chat delta. Pure + defensive:
 * returns null for blanks / non-JSON instead of throwing. This is the single
 * shared parser so ConversationalChat (welcome) and BriefcaseChat (global pill)
 * run ONE multi-turn streaming implementation, not separate copies (A-6 DRY).
 */
export function parseChatFrame(frame: string): ChatFrame | null {
  const line = frame.replace(/^\s*data:\s*/, "").trim();
  if (!line) return null;
  try {
    return JSON.parse(line) as ChatFrame;
  } catch {
    return null;
  }
}

/**
 * Multi-turn SSE chat against a token-streaming endpoint (default
 * /api/welcome/chat). Owns the messages + busy state and the fetch-reader loop;
 * all dispatches happen inside the submit-triggered async callback — never an
 * effect body — so it's clear of react-hooks/set-state-in-effect.
 */
export function useChatStream(endpoint: string = "/api/welcome/chat") {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
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
          const evt = parseChatFrame(frame);
          if (evt?.text) {
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

  return { messages, busy, send };
}
