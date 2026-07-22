"use client";

// Root-level error boundary. When an error escapes the root layout itself,
// Next.js replaces the whole document with this component — so it must render
// its own <html>/<body> and cannot rely on globals.css (hence inline styles).
// Nested/page errors are handled by app/error.tsx; this catches what that can't.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1rem",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <p style={{ fontSize: "0.875rem", color: "#9ca3af" }}>Something went wrong.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.2)",
            padding: "0.375rem 1rem",
            fontSize: "0.875rem",
            color: "#d1d5db",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
