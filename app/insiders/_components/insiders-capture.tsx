"use client";

import { useState } from "react";

/**
 * Insiders Edition capture — posts to the LIVE enrollment endpoint
 * (POST /api/insiders/subscribe → public.insiders_subscribers, consent recorded
 * server-side). No ZIP: the Insiders Edition is the regional monthly flagship.
 * Mounted twice on /insiders (hero + closing), distinguished by `source`.
 */
export function InsidersCapture({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/insiders/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="ins-capture ins-capture-done" role="status">
        <p className="ins-capture-done-head">You&rsquo;re on the list.</p>
        <p className="ins-capture-done-sub">
          Issue 001 lands in your inbox before it reaches the archive. Unsubscribe anytime, from any
          email.
        </p>
      </div>
    );
  }

  return (
    <div className="ins-capture">
      <form className="ins-capture-form" onSubmit={submit}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className="ins-capture-input"
          disabled={status === "submitting"}
        />
        <button type="submit" className="ins-capture-btn" disabled={status === "submitting"}>
          {status === "submitting" ? "Reserving…" : "Get Issue 001"}
        </button>
      </form>
      {status === "error" && (
        <p className="ins-capture-msg">Something went wrong. Try again in a moment.</p>
      )}
      <p className="ins-capture-fine">
        Free · monthly · unsubscribe anytime. Your email stays on our infrastructure only.
      </p>
    </div>
  );
}
