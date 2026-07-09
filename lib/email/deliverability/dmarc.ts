// lib/email/deliverability/dmarc.ts
//
// DMARC is the one genuinely new check the deliverability panel adds — Resend's
// dns_records only covers SPF/DKIM (see docs/superpowers/specs/
// 2026-07-08-deliverability-diagnostic-panel-design.md); DMARC is a manual step
// Resend never tracks. A one-shot TXT lookup on `_dmarc.<domain>` via Node's
// built-in resolver is the whole check — no new dependency, not a hot path.

import { resolveTxt } from "node:dns/promises";

export type DmarcPolicy = "none" | "quarantine" | "reject";

/**
 * Extract the `p=` policy value from a set of TXT records at `_dmarc.<domain>`.
 * `dns.resolveTxt` returns one array per record, each chunked into the
 * record's individual <character-string> segments — rejoin before parsing.
 * Pure; no I/O.
 */
export function parseDmarcPolicy(txtRecords: string[][]): DmarcPolicy | null {
  for (const record of txtRecords) {
    const joined = record.join("").trim();
    if (!/^v=DMARC1/i.test(joined)) continue;
    const match = joined.match(/;\s*p=(none|quarantine|reject)/i);
    if (match) return match[1].toLowerCase() as DmarcPolicy;
  }
  return null;
}

export type DmarcCheckResult =
  { status: "not_set" } | { status: "set"; policy: DmarcPolicy | null } | { status: "error" };

/**
 * Live DNS check. ENOTFOUND/ENODATA mean the TXT record genuinely doesn't
 * exist ("not set up" — the red state); any other failure (timeout, resolver
 * error) is distinct ("couldn't check right now" — never silently treated as
 * absent, per the spec's error-handling section).
 */
export async function checkDmarc(domain: string): Promise<DmarcCheckResult> {
  try {
    const records = await resolveTxt(`_dmarc.${domain}`);
    if (records.length === 0) return { status: "not_set" };
    return { status: "set", policy: parseDmarcPolicy(records) };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === "ENOTFOUND" || code === "ENODATA") return { status: "not_set" };
    return { status: "error" };
  }
}
