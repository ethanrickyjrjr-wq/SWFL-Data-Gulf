"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // React error boundaries swallow the exception, so the browser SDK does not
    // auto-capture boundary-caught render errors — report it explicitly.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-gray-400">Something went wrong.</p>
      <button
        onClick={reset}
        className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-gray-300 hover:border-white/40 hover:text-white"
      >
        Try again
      </button>
    </div>
  );
}
