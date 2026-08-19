// approval-token.mjs — HUMAN-ONLY, SINGLE-USE APPROVAL TOKENS (writ-guard-trio Part A).
// Spec: docs/superpowers/specs/2026-08-19-writ-guard-trio-design.md
//
// WHY: every escape hatch in this repo's gates is an ALLOW_*/OPERATOR_* env var — which
// the agent itself can type. A gate whose bypass the gated party controls is a request,
// not a gate. Stolen from Writ (infinri/Writ, evaluated 08/18/2026): approval is a
// one-time secret that exists ONLY because a human keystroke created it
// (UserPromptSubmit fires solely on real operator input), and claiming it is a single
// atomic filesystem operation exactly one caller can win.
//
// HONEST LIMIT (Writ states the same one): this constrains a cooperative agent's
// reflexes, not an adversary. check-approvals-guard.mjs refuses the ordinary tool paths
// to this directory; `eval`/var-assembled evasion remains possible and is documented,
// not glossed.
//
// Contract:
//   mintToken(gate)    — called by mint-approval-on-prompt.mjs ONLY (human prompt).
//   consumeToken(gate) — called by gates at block time. Single use, 30-min TTL.
//   Every mint / consume / refusal is appended to <dir>/audit.log (JSONL).

import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  unlinkSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const APPROVALS_DIR = ".claude/approvals";
export const DEFAULT_TTL_MS = 30 * 60_000;

/** Gate names are path-safe by construction — anything else is refused. */
export function validGate(gate) {
  return /^[a-z0-9][a-z0-9_-]{0,40}$/.test(String(gate || ""));
}

function audit(dir, entry) {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "audit.log"),
      JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n",
    );
  } catch {
    /* auditing must never break the caller */
  }
}

/**
 * Mint a single-use token for `gate`. Re-minting overwrites (a fresh approval
 * refreshes the TTL). Returns the token record.
 */
export function mintToken(gate, { dir = APPROVALS_DIR, now = Date.now(), meta } = {}) {
  if (!validGate(gate)) throw new Error(`invalid gate name: ${gate}`);
  mkdirSync(dir, { recursive: true });
  const record = { gate, secret: randomBytes(16).toString("hex"), minted_at: now, meta };
  writeFileSync(join(dir, `${gate}.token`), JSON.stringify(record));
  audit(dir, { event: "mint", gate });
  return record;
}

/**
 * Atomically claim and destroy the token for `gate`.
 * Returns {ok:true, minted_at} or {ok:false, reason:'missing'|'expired'}.
 * The renameSync claim is the whole race story: exactly one caller wins; the loser
 * gets ENOENT and a 'missing' refusal.
 */
export function consumeToken(
  gate,
  { dir = APPROVALS_DIR, ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {},
) {
  if (!validGate(gate)) {
    audit(dir, { event: "refused", gate: String(gate), reason: "invalid-gate" });
    return { ok: false, reason: "missing" };
  }
  const tokenPath = join(dir, `${gate}.token`);
  const claimed = join(
    dir,
    `${gate}.token.claimed-${process.pid}-${randomBytes(4).toString("hex")}`,
  );
  try {
    renameSync(tokenPath, claimed);
  } catch {
    audit(dir, { event: "refused", gate, reason: "missing" });
    return { ok: false, reason: "missing" };
  }
  let record = null;
  try {
    record = JSON.parse(readFileSync(claimed, "utf8"));
  } catch {
    record = null;
  }
  try {
    unlinkSync(claimed);
  } catch {
    /* already gone — fine */
  }
  const mintedAt = Number(record?.minted_at || 0);
  if (!mintedAt || now - mintedAt > ttlMs) {
    audit(dir, { event: "refused", gate, reason: "expired" });
    return { ok: false, reason: "expired" };
  }
  audit(dir, { event: "consume", gate, minted_at: mintedAt });
  return { ok: true, minted_at: mintedAt };
}
