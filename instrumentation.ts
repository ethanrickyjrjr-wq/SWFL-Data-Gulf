// Next.js instrumentation hook (stable in Next 15+). Runs once per runtime at
// startup: it loads the matching Sentry init and exports onRequestError so the
// framework reports server-side exceptions (Server Components, route handlers,
// middleware, proxies) to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Requires @sentry/nextjs >= 8.28.0 and Next 15 (we have 10.67.0 / Next 16).
export const onRequestError = Sentry.captureRequestError;
