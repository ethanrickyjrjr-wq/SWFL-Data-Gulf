"use client";

import { useState } from "react";
import { LoginForm } from "@/app/login/login-form";

/**
 * THE auth-card root (spec 2026-08-10-auth-create-account §D1). Every surface
 * that lets a user sign in or create an account renders THIS — the /login page,
 * the header LoginModal, anything future. Edit the copy map here and every page
 * updates; never hand-roll another login card.
 *
 * Two framings, ONE engine: email + code creates the account when none exists
 * (signInWithOtp shouldCreateUser), so the toggle changes copy only. Pattern per
 * the 08/10/2026 live crawl (Substack/Dropbox/GitHub, filed in _RESEARCH
 * competitor-and-strategy): passwordless products split the framing, not the flow.
 */

type AuthMode = "signin" | "create";

const AUTH_COPY: Record<AuthMode, { title: string; blurb: string }> = {
  signin: {
    title: "Sign in",
    blurb: "Enter your email. We’ll send you a sign-in code.",
  },
  create: {
    title: "Create your account",
    blurb: "Enter your email — we’ll send you a code. Free, no credit card required.",
  },
};

export function AuthPanel({
  next,
  onSignedIn,
  title,
  blurb,
  headingLevel = "h2",
}: {
  next: string;
  /** Stay-in-place mode (email lab's "Save your brand"): sign-in finishes without
   *  navigating. The mode toggle is suppressed — that flow is a task, not an entrance. */
  onSignedIn?: () => void | Promise<void>;
  /** Explicit overrides win over the mode copy and suppress the toggle. */
  title?: string;
  blurb?: string;
  /** h1 on the standalone /login page, h2 inside the modal (default). */
  headingLevel?: "h1" | "h2";
}) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const overridden = title !== undefined || blurb !== undefined || onSignedIn !== undefined;
  const copy = AUTH_COPY[mode];

  const toggle = overridden ? undefined : (
    <p className="mt-4 border-t border-black/[.08] pt-4 text-sm leading-6 text-zinc-600 dark:border-white/[.12] dark:text-zinc-400">
      {mode === "signin" ? (
        <>
          First time here?{" "}
          <button
            type="button"
            onClick={() => setMode("create")}
            className="font-semibold text-black underline underline-offset-2 dark:text-zinc-50"
          >
            Create your account
          </button>{" "}
          — free, no credit card.
        </>
      ) : (
        <>
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => setMode("signin")}
            className="font-semibold text-black underline underline-offset-2 dark:text-zinc-50"
          >
            Sign in
          </button>
        </>
      )}
    </p>
  );

  const Heading = headingLevel;
  return (
    <>
      <Heading className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
        {title ?? copy.title}
      </Heading>
      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        {blurb ?? copy.blurb}
      </p>
      <LoginForm next={next} onSignedIn={onSignedIn} emailStepFooter={toggle} />
    </>
  );
}
