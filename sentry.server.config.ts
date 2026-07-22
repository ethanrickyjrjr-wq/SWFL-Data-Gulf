// Sentry — NODE (server) runtime init. Loaded by instrumentation.ts's register()
// when NEXT_RUNTIME === "nodejs". Captures exceptions from route handlers, Server
// Components, and server actions. This is the "somewhere" the Layer 8 error-leak
// fix (sa0718_…) will send full detail to, while returning a generic message to
// the client.
import * as Sentry from "@sentry/nextjs";
import { resolveTracesSampleRate } from "@/lib/observability/sentry-sampling";
import { SENTRY_DATA_COLLECTION } from "@/lib/observability/sentry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  // Do NOT ship request bodies (contact lists, uploads), user identity, cookies,
  // DB query values, or Anthropic prompt/response content to a third party.
  dataCollection: SENTRY_DATA_COLLECTION,
  // Console breadcrumbs are a SEPARATE control from dataCollection (post-build review
  // finding) — this app has live routes that console.error() a raw Postgres error
  // object on a subscriber-email upsert path; without this, that rides along as a
  // breadcrumb on any later event in the same request. Node's default Console
  // integration has no console:false option (that's the browser Breadcrumbs
  // integration's shape), so it's filtered out of the defaults instead.
  integrations: (defaults) => defaults.filter((i) => i.name !== "Console"),
  // Runtime-read env → tunable via Vercel env var + redeploy. Errors stay at 100%.
  tracesSampleRate: resolveTracesSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
});
