"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function DeliverableError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Same rationale as app/error.tsx: this boundary swallows the exception, so
    // the browser SDK does not auto-capture it — report explicitly (post-build
    // review finding — this boundary was originally left out of the Sentry pass).
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-gray-400">Unable to load this deliverable.</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-gray-300 hover:border-white/40 hover:text-white"
        >
          Try again
        </button>
        <Link
          href="/project"
          className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-gray-300 hover:border-white/40 hover:text-white"
        >
          My projects
        </Link>
      </div>
    </div>
  );
}
