"use client";

import { useState } from "react";

/** Small inline lock — avoids depending on a specific lucide-react icon API. */
function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/**
 * ZIP hero — the primary affordance. Five digits only; address-level entry is a
 * visibly gated affordance (PII stays behind the paywall). On submit it hands
 * the raw ZIP up; the parent drives the grounded stream.
 */
export function ZipHeroInput({
  onSubmit,
  busy,
}: {
  onSubmit: (zip: string) => void;
  busy: boolean;
}) {
  const [zip, setZip] = useState("");
  const valid = /^\d{5}$/.test(zip);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onSubmit(zip);
      }}
    >
      <label
        htmlFor="zip-hero"
        className="text-xs font-medium uppercase tracking-wider text-text-tertiary"
      >
        Enter a SWFL ZIP for an instant cited read
      </label>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-gulf-haze bg-gulf-slate px-4 py-3">
        <input
          id="zip-hero"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          disabled={busy}
          placeholder="33931"
          className="w-28 bg-transparent font-mono text-lg tracking-widest text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <button
          type="submit"
          disabled={!valid || busy}
          className="ml-auto rounded-md px-4 py-2 text-sm font-medium text-text-on-accent transition-opacity disabled:opacity-40"
          style={{ background: "var(--brand-primary)" }}
        >
          {busy ? "Building…" : "Build my cited read"}
        </button>
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-text-tertiary">
        <LockIcon />
        Address-level reads unlock with an account
      </p>
    </form>
  );
}
