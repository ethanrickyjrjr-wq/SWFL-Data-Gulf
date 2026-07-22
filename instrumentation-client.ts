// Sentry — BROWSER runtime init. Next.js loads this on the client.
// Error Monitoring + (sampled) Tracing only. Session Replay / Logs / User
// Feedback are deliberately NOT enabled — Replay records the user's screen (PII)
// and the free tier allows only 50 replays/mo. Keep the surface minimal.
import * as Sentry from "@sentry/nextjs";
import { resolveTracesSampleRate } from "@/lib/observability/sentry-sampling";
import { SENTRY_DATA_COLLECTION } from "@/lib/observability/sentry-privacy";

Sentry.init({
  // Public DSN. Unset (e.g. local dev, or before the operator provisions it in
  // Vercel) → init is inert and nothing is sent. That is the desired safe default.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Distinguishes production from preview so the "new issue in production" alert
  // can scope to production only. NEXT_PUBLIC_VERCEL_ENV is set by Vercel.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  // Do NOT ship user data / bodies / cookies / GenAI content to a third party.
  dataCollection: SENTRY_DATA_COLLECTION,
  // Errors are captured at 100% (Sentry `sampleRate` default 1.0); this only
  // sizes the secondary tracing feature. Build-time inlined — changing it needs
  // a rebuild. See lib/observability/sentry-sampling.ts for the budget rationale.
  tracesSampleRate: resolveTracesSampleRate(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
});

// Instrument client-side router navigations for tracing (no-op unless the
// transaction is sampled).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
