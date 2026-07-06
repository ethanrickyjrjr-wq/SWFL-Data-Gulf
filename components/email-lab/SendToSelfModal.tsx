"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { suggestEmailFix } from "@/lib/email/typo-suggest";
import type { EmailDoc } from "@/lib/email/doc/types";
import { openDoc, projectEmailLabBase, EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";

/**
 * Send-to-self capture (spec: 2026-07-03-lab-first-funnel-landing-design.md §4).
 * Two steps mirroring app/login/login-form.tsx exactly: email →
 * signInWithOtp({ shouldCreateUser: true }) sends a typed numeric code (never a
 * magic link — scanners prefetch links); code → verifyOtp({ type: "email" }).
 * No emailRedirectTo: nothing redirects, auth happens inline on the canvas.
 *
 * On verify success the session cookie is set; POST /api/lab/claim-and-send
 * turns the doc into a project + deliverable and fires ONE send to the proven
 * address, then we hard-navigate into the project email surface (full reload so
 * the server re-reads the fresh session cookie — ClaimOnLogin convention).
 */
export function SendToSelfModal({
  open,
  onClose,
  getDoc,
  zip,
  refCode,
}: {
  open: boolean;
  onClose: () => void;
  getDoc: () => EmailDoc;
  zip?: string | null;
  refCode?: string | null;
}) {
  const [step, setStep] = useState<"email" | "code" | "finishing">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ full: string; domain: string } | null>(null);
  const [suggestionChecked, setSuggestionChecked] = useState<string | null>(null);
  const [finishNote, setFinishNote] = useState<string | null>(null);

  if (!open) return null;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    // Suggest-don't-block (same posture as login): one "did you mean" pass.
    if (email !== suggestionChecked) {
      const fix = suggestEmailFix(email);
      if (fix) {
        setSuggestion(fix);
        setSuggestionChecked(email);
        return;
      }
    }
    setSuggestion(null);
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setPending(false);
    if (err) {
      setError("Couldn't send the code — check the address and try again.");
      return;
    }
    setStep("code");
  }

  async function verifyAndSend(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (err) {
      setPending(false);
      setError("That code didn't match — check your inbox for the newest one.");
      return;
    }
    setStep("finishing");
    try {
      const res = await fetch("/api/lab/claim-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc: getDoc(),
          ...(zip ? { zip } : {}),
          ...(refCode ? { ref: refCode } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        projectId?: string;
        deliverableId?: string;
        sent?: boolean;
      } | null;
      if (res.ok && data?.projectId) {
        setFinishNote(
          data.sent
            ? "Sent — check your inbox. Opening your project…"
            : "Saved to your project — the send hiccuped, you can retry from there. Opening…",
        );
        // Full reload so the server re-reads the fresh session cookie.
        window.location.href = data.deliverableId
          ? openDoc(data.projectId, data.deliverableId)
          : projectEmailLabBase(data.projectId);
        return;
      }
      // Signed in but save failed — land them in their (new) workspace anyway.
      setFinishNote("Signed in — opening your workspace…");
      window.location.href = EMAIL_LAB_LANDING;
    } catch {
      setFinishNote("Signed in — opening your workspace…");
      window.location.href = EMAIL_LAB_LANDING;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send this email to yourself"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1d24] p-6 shadow-2xl">
        {step === "email" && (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-white">Send this to yourself</h2>
            <p className="text-xs leading-relaxed text-gray-400">
              Enter your email and we&rsquo;ll send a sign-in code — then this exact email lands in
              your inbox and the build is saved to your free workspace.
            </p>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-gulf-teal"
              disabled={pending}
            />
            {suggestion && (
              <p className="text-xs text-gulf-teal">
                Did you mean <strong>{suggestion.full}</strong>? Submit again to keep what you
                typed, or{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setEmail(suggestion.full);
                    setSuggestion(null);
                  }}
                >
                  use the suggestion
                </button>
                .
              </p>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="btn-gradient rounded-lg px-4 py-2.5 text-sm font-semibold text-navy-dark disabled:opacity-50"
            >
              {pending ? "Sending code…" : "Email me a code"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Not now
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyAndSend} className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-white">Enter the code</h2>
            <p className="text-xs leading-relaxed text-gray-400">
              We emailed a sign-in code to <strong className="text-gray-200">{email}</strong>.
            </p>
            <input
              type="text"
              required
              autoFocus
              inputMode="numeric"
              // 6–10 digits — never hardcode 6 (Supabase templates vary).
              pattern="\d{6,10}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              aria-label="Sign-in code"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-white placeholder-gray-600 outline-none focus:border-gulf-teal"
              disabled={pending}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={pending || code.length < 6}
              className="btn-gradient rounded-lg px-4 py-2.5 text-sm font-semibold text-navy-dark disabled:opacity-50"
            >
              {pending ? "Verifying…" : "Verify & send my email"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === "finishing" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-gulf-teal" />
            <p className="text-sm text-gray-300">{finishNote ?? "Saving your build…"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
