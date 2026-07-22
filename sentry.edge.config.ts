// Sentry — EDGE runtime init. Loaded by instrumentation.ts's register() when
// NEXT_RUNTIME === "edge". This is NOT optional: middleware.ts runs on the edge
// runtime and does real work (per-IP rate limiting, signed-cid minting, the
// /project auth redirect), so its exceptions must be captured too.
import * as Sentry from "@sentry/nextjs";
import { resolveTracesSampleRate } from "@/lib/observability/sentry-sampling";
import { SENTRY_DATA_COLLECTION } from "@/lib/observability/sentry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  dataCollection: SENTRY_DATA_COLLECTION,
  tracesSampleRate: resolveTracesSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
});
