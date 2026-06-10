"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    const supabase = createClient();
    // [AUDIT-FIX C1] thread the received `next` onto the callback URL so the
    // magic-link round-trip lands the user back on the page they were gated from.
    // The callback route (app/auth/callback/route.ts) already forwards `next`.
    const callback = new URL("/auth/callback", window.location.origin);
    if (next && next !== "/") callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback.toString() },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm leading-6 text-emerald-900 dark:text-emerald-200">
        Check <span className="font-medium">{email}</span> for a sign-in link. You can close this
        tab.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === "sending"}
          className="h-11 rounded-lg border border-black/[.12] bg-white px-3 text-base text-black outline-none focus:border-black/40 disabled:opacity-60 dark:border-white/[.18] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/40"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending" || email.length === 0}
        className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {status === "sending" ? "Sending…" : "Send magic link"}
      </button>
      {status === "error" && errorMessage && (
        <p className="text-sm leading-6 text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </form>
  );
}
