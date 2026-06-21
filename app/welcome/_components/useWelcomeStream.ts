"use client";

import { useCallback, useReducer } from "react";

import { initialWelcomeState, parseSseFrame, reduceWelcome } from "@/lib/welcome/frames";

/**
 * Owns the SSE transport for the grounded ZIP answer. The frame→state logic is
 * the pure `reduceWelcome` reducer (unit-tested); this hook only wires the fetch
 * reader to it. All dispatches happen inside the submit-triggered async callback
 * — never in an effect body — so it's clear of react-hooks/set-state-in-effect.
 */
export function useWelcomeStream(demo: boolean) {
  const [state, dispatch] = useReducer(reduceWelcome, initialWelcomeState);

  const send = useCallback(
    async (zip: string) => {
      const q = zip.trim();
      // status drives the in-flight guard; ignore re-entry while a read is open.
      if (!q) return;
      dispatch({ type: "submit", zip: q });
      try {
        // Live: the one assistant's public funnel context (was the deleted /api/welcome/chat
        // shim, which mapped a no-`mode` body to context "public"). Demo stays its own route.
        const url = demo ? "/api/welcome/demo" : "/api/assistant";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            demo
              ? { messages: [{ role: "user", content: q }] }
              : { context: "public", messages: [{ role: "user", content: q }] },
          ),
        });
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split("\n\n");
          buf = chunks.pop() ?? "";
          for (const raw of chunks) {
            const frame = parseSseFrame(raw);
            if (frame) dispatch({ type: "frame", frame });
          }
        }
      } catch {
        dispatch({
          type: "frame",
          frame: { type: "error", error: "Sorry — couldn't reach the data. Try again." },
        });
      }
    },
    [demo],
  );

  return { state, send };
}
