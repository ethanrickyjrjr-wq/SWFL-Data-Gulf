"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isSafeReturnPath } from "@/lib/safe-return";
import { suggestEmailFix } from "@/lib/email/typo-suggest";
import { ENABLED_LOGIN_PROVIDERS, type LoginProviderSlug } from "@/lib/auth/social-login";

type Step = "email" | "code";

/**
 * Two-step email OTP sign-in.
 *
 * We send a numeric code (NOT a clickable magic link) because email security
 * scanners and ESP click-tracking prefetch links on delivery, which consumes
 * the single-use token before the human clicks — the link "expires in 2s". A
 * typed code has nothing to prefetch. signInWithOtp sends the code as long as
 * the Supabase email template uses `{{ .Token }}` (not `{{ .ConfirmationURL }}`).
 *
 * `emailRedirectTo` is still threaded with `next` so that if a template ever
 * reverts to a link, the round-trip still lands on the gated page. On code
 * verify we navigate with a full reload so the server re-reads the freshly
 * written session cookie before rendering the gated route.
 */
export function LoginForm({
  next,
  onSignedIn,
}: {
  next: string;
  /** Given → verify does NOT navigate; the caller keeps the page (and its unsaved
   *  work) and finishes the job in place. Used by the in-lab brand save, which must
   *  not hard-reload the canvas out from under a half-built email. */
  onSignedIn?: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ full: string; domain: string } | null>(null);
  // The exact value we already suggested on — a second submit of it passes straight through.
  const [suggestionChecked, setSuggestionChecked] = useState<string | null>(null);

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Suggest-don't-block: first submit of a probably-typo'd address shows a
    // one-time "did you mean" line; submitting the same value again proceeds.
    if (email !== suggestionChecked) {
      const fix = suggestEmailFix(email);
      if (fix) {
        setSuggestion(fix);
        setSuggestionChecked(email);
        return;
      }
    }
    setSuggestion(null);
    await dispatchCode(email);
  }

  async function dispatchCode(target: string) {
    setPending(true);
    setErrorMessage(null);

    const supabase = createClient();
    // [AUDIT-FIX C1] thread `next` onto the callback URL as a fallback in case
    // the email template still emits a link; the callback route forwards `next`.
    const callback = new URL("/auth/callback", window.location.origin);
    if (next && next !== "/") callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email: target,
      options: { shouldCreateUser: true, emailRedirectTo: callback.toString() },
    });

    setPending(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setStep("code");
  }

  async function signInWithProvider(provider: LoginProviderSlug) {
    setPending(true);
    setErrorMessage(null);

    const supabase = createClient();
    // Same callback the OTP-link fallback uses; it already exchanges the PKCE
    // `?code=` via exchangeCodeForSession. Thread `next` so we land on the gated
    // page after the provider round-trip.
    const callback = new URL("/auth/callback", window.location.origin);
    if (next && next !== "/") callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback.toString() },
    });
    // On success the browser is already navigating to the provider — we only
    // reach past this line if the redirect never started.
    if (error) {
      setPending(false);
      setErrorMessage(error.message);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });

    if (error) {
      setPending(false);
      setErrorMessage("That code is invalid or expired. Request a new one.");
      return;
    }
    // Stay-in-place mode: the session cookie is written, so the caller's next fetch is
    // authed. No navigation — a hard reload here would discard whatever they were
    // building on the page that asked us to sign them in.
    if (onSignedIn) {
      await onSignedIn();
      setPending(false);
      return;
    }
    // Hard navigation so the server re-reads the new session cookie. Same-origin
    // guard (rejects `//evil.com`) — never trust `next` as a bare startsWith("/").
    window.location.assign(isSafeReturnPath(next) ? next : "/");
  }

  const inputBase =
    "h-11 rounded-lg border border-black/[.12] bg-white px-3 text-base text-black outline-none focus:border-black/40 disabled:opacity-60 dark:border-white/[.18] dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-white/40";
  const buttonBase =
    "mt-2 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";
  const providerButtonBase =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-black/[.12] bg-white px-5 text-sm font-medium text-black transition-colors hover:bg-black/[.03] disabled:opacity-50 dark:border-white/[.18] dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-white/[.06]";

  // OAuth does a full redirect away and back, so the provider buttons render
  // ONLY on the real /login page — never in stay-in-place mode (onSignedIn),
  // where a redirect would discard the half-built work that asked us to sign in.
  // Empty unless NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS lists an enabled provider.
  const providers = onSignedIn ? [] : ENABLED_LOGIN_PROVIDERS;
  const providerButtons =
    providers.length > 0 ? (
      <div className="mb-4 flex flex-col gap-2">
        {providers.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => void signInWithProvider(p.slug)}
            disabled={pending}
            className={providerButtonBase}
          >
            Continue with {p.label}
          </button>
        ))}
        <div className="my-1 flex items-center gap-3">
          <span className="h-px flex-1 bg-black/[.08] dark:bg-white/[.12]" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">or</span>
          <span className="h-px flex-1 bg-black/[.08] dark:bg-white/[.12]" />
        </div>
      </div>
    ) : null;

  if (step === "code") {
    return (
      <form onSubmit={verifyCode} className="mt-6 flex flex-col gap-3">
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          We emailed a sign-in code to <span className="font-medium">{email}</span>. Enter it below.
        </p>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            // Supabase email OTP length is project-configurable (6–10 digits).
            // Do NOT hardcode 6 — this project emits 8. Accept the full range so
            // the field never truncates the code the server actually sent.
            maxLength={10}
            pattern="[0-9]*"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            disabled={pending}
            className={`${inputBase} tracking-[0.3em]`}
            placeholder="Enter your code"
          />
        </label>
        <button type="submit" disabled={pending || code.length < 6} className={buttonBase}>
          {pending ? "Verifying…" : "Verify & sign in"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode("");
            setErrorMessage(null);
          }}
          disabled={pending}
          className="text-sm leading-6 text-zinc-500 underline-offset-2 hover:underline disabled:opacity-50 dark:text-zinc-400"
        >
          Use a different email
        </button>
        {errorMessage && (
          <p className="text-sm leading-6 text-red-600 dark:text-red-400">{errorMessage}</p>
        )}
      </form>
    );
  }

  return (
    <div className="mt-6">
      {providerButtons}
      <form onSubmit={sendCode} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (suggestion) setSuggestion(null);
            }}
            disabled={pending}
            className={inputBase}
            placeholder="you@example.com"
          />
        </label>
        {suggestion && (
          <p className="text-sm leading-6 text-amber-600 dark:text-amber-400">
            Did you mean <span className="font-medium">{suggestion.full}</span>?{" "}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fixed = suggestion.full;
                setEmail(fixed);
                setSuggestion(null);
                void dispatchCode(fixed);
              }}
              className="font-semibold underline underline-offset-2 disabled:opacity-50"
            >
              Use it
            </button>{" "}
            ·{" "}
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setSuggestion(null);
                void dispatchCode(email);
              }}
              className="underline underline-offset-2 disabled:opacity-50"
            >
              No, keep mine
            </button>
          </p>
        )}
        <button type="submit" disabled={pending || email.length === 0} className={buttonBase}>
          {pending ? "Sending…" : "Email me a code"}
        </button>
        {errorMessage && (
          <p className="text-sm leading-6 text-red-600 dark:text-red-400">{errorMessage}</p>
        )}
      </form>
    </div>
  );
}
