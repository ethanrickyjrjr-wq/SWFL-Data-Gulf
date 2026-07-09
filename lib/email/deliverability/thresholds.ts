// lib/email/deliverability/thresholds.ts
//
// Pure rate → red/yellow/green classification, sourced from Google's live
// bulk-sender guidelines (support.google.com/mail/answer/81126, verified via
// crawl4ai 2026-07-08/09 — "Keep spam rates reported in Postmaster Tools below
// 0.10% and avoid ever reaching a spam rate of 0.30% or higher"). Bounce-rate
// is NOT a number Google publishes directly; 2% is the industry-convention
// hygiene line this panel uses, cited as such in the UI (not Google's).

import type { DmarcPolicy } from "./dmarc";

export type StatusColor = "red" | "yellow" | "green";

const SPAM_RATE_YELLOW = 0.001; // 0.10%
const SPAM_RATE_RED = 0.003; // 0.30% — the hard "mail gets blocked/spam-foldered" line
const BOUNCE_RATE_RED = 0.02; // 2% — industry convention, not Google-published

/** complainedRate = complained / delivered, as a fraction (0.001 = 0.10%). */
export function classifySpamRate(complainedRate: number): StatusColor {
  if (complainedRate >= SPAM_RATE_RED) return "red";
  if (complainedRate >= SPAM_RATE_YELLOW) return "yellow";
  return "green";
}

/** bouncedRate = bounced / delivered, as a fraction. */
export function classifyBounceRate(bouncedRate: number): StatusColor {
  return bouncedRate > BOUNCE_RATE_RED ? "red" : "green";
}

/** Absent → red (Gmail requires DMARC for bulk senders). p=none → set up but not enforcing. */
export function classifyDmarcPolicy(policy: DmarcPolicy | null): StatusColor {
  if (policy === "quarantine" || policy === "reject") return "green";
  if (policy === "none") return "yellow";
  return "red";
}
