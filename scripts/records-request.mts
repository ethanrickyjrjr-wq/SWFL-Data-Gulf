#!/usr/bin/env bun
// records-request.mts — operator CLI for the Chapter 119 outbound engine.
// Modeled on scripts/check.mjs (same Supabase REST helper + loud-fail discipline).
// Run: bun scripts/records-request.mts <verb> ...
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSupabaseCreds } from "./lib/supabase-creds.mjs";
import { nextState } from "../lib/records-request/state.ts";
import { draftRequestBody, draftSubject } from "../lib/records-request/template.ts";
import { sendRecordsRequest, type EmailSender } from "../lib/records-request/send.ts";

const SECRETS_PATH = resolve(process.cwd(), ".dlt/secrets.toml");
const SENDER_NAME = process.env.DIGEST_SENDER_NAME ?? "SWFL Data Gulf";
const SENDER_ADDRESS = process.env.DIGEST_SENDER_ADDRESS ?? "hello@swfldatagulf.com";
const FROM = `${SENDER_NAME} <${SENDER_ADDRESS}>`;

function fail(msg: string): never {
  console.error(`records-request: ${msg}`);
  process.exit(1);
}

function secretsText(): string {
  try {
    return readFileSync(SECRETS_PATH, "utf8");
  } catch {
    return "";
  }
}

function creds() {
  const c = resolveSupabaseCreds({ tomlText: secretsText(), env: process.env });
  if (!c) fail("SUPABASE_URL / SUPABASE_SERVICE_KEY not found in secrets or env");
  return c;
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = creds();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) fail(`Supabase ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function resendKey(): string {
  const fromEnv = process.env.RESEND_API_KEY;
  if (fromEnv) return fromEnv;
  const m = secretsText().match(/^RESEND_API_KEY\s*=\s*"([^"]+)"/m);
  if (m) return m[1];
  fail("RESEND_API_KEY not found in env or .dlt/secrets.toml");
}

async function getRow(key: string) {
  const rows = await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}&select=*`);
  if (!rows.length) fail(`no request with key ${key}`);
  return rows[0];
}

// PATCH a row's state via nextState (loud on illegal transition) + extra fields.
async function transition(key: string, action: string, extra: Record<string, unknown> = {}) {
  const row = await getRow(key);
  const to = nextState(row.state, action); // throws on illegal transition
  const patch = {
    state: to,
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...extra,
  };
  await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  console.log(`${key}: ${row.state} -> ${to}`);
}

function parseArgs(args: string[]) {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const next = args[i + 1];
      flags[a.slice(2)] = next === undefined || next.startsWith("--") ? true : args[++i];
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

async function add(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const [request_key, target_agency, dataset] = positionals;
  if (!request_key || !target_agency || !dataset)
    fail(
      'add <request_key> <target_agency> "<dataset>" [--contact <email>] [--portal <url>] [--basis "…"] [--follow-up <days>]',
    );
  const existing = await rest(
    `records_requests?request_key=eq.${encodeURIComponent(request_key)}&select=request_key`,
  );
  if (existing.length) fail(`already exists: ${request_key} (add creates only)`);
  const row: Record<string, unknown> = { request_key, target_agency, dataset, state: "drafted" };
  if (flags.contact) row.contact_email = flags.contact;
  if (flags.portal) row.portal_url = flags.portal;
  if (flags.basis) row.statute_basis = flags.basis;
  if (flags["follow-up"]) row.follow_up_days = Number(flags["follow-up"]);
  await rest("records_requests", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  console.log(`added: ${request_key} [drafted]`);
}

// Patch editable fields on an existing row (e.g. pin a records-custodian address
// handed in later). Does not touch state — use the lifecycle verbs for that.
async function set(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const [key] = positionals;
  if (!key)
    fail(
      'set <request_key> [--contact <email>] [--portal <url>] [--follow-up <days>] [--basis "…"] [--notes "…"]',
    );
  await getRow(key); // fail loud if the key is unknown
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (flags.contact) patch.contact_email = flags.contact;
  if (flags.portal) patch.portal_url = flags.portal;
  if (flags["follow-up"]) patch.follow_up_days = Number(flags["follow-up"]);
  if (flags.basis) patch.statute_basis = flags.basis;
  if (flags.notes) patch.notes = flags.notes;
  const changed = Object.keys(patch).filter((k) => k !== "updated_at");
  if (!changed.length)
    fail("set: nothing to change — pass --contact/--portal/--follow-up/--basis/--notes");
  await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  console.log(`set ${key}: ${changed.join(", ")}`);
}

function bodyFor(row: { target_agency: string; dataset: string; statute_basis: string }): string {
  return draftRequestBody({
    targetAgency: row.target_agency,
    dataset: row.dataset,
    statuteBasis: row.statute_basis,
  });
}

async function draft(args: string[]) {
  const [key] = args;
  if (!key) fail("draft <request_key>");
  const row = await getRow(key);
  const body = bodyFor(row);
  // Persist the drafted body for the audit trail; print for review.
  await rest(`records_requests?request_key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ request_body: body, updated_at: new Date().toISOString() }),
  });
  console.log(`--- ${draftSubject(row.dataset)} ---\n${body}`);
}

async function send(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const [key] = positionals;
  if (!key) fail("send <request_key> [--confirm] [--email]");
  const row = await getRow(key);
  if (row.state !== "drafted") fail(`send only from drafted (state is ${row.state})`);
  const body = bodyFor(row);
  const subject = draftSubject(row.dataset);

  if (!flags.confirm) {
    // Review beat: print the draft; also email it to the operator if OPERATOR_EMAIL is set.
    console.log(`--- REVIEW (not sent) — ${subject} ---\n${body}\n`);
    console.log(`To send: bun scripts/records-request.mts send ${key} --confirm`);
    const operator = process.env.OPERATOR_EMAIL;
    if (operator) {
      const { Resend } = await import("resend");
      const client = new Resend(resendKey()) as unknown as EmailSender;
      const r = await sendRecordsRequest(client, {
        from: FROM,
        to: operator,
        subject: `[REVIEW] ${subject}`,
        text: body,
      });
      console.log(
        r.ok ? `emailed draft to ${operator} for review` : `review-email failed: ${r.error}`,
      );
    }
    return;
  }

  // Approved. A tracked portal (audit trail) is preferred when present — that is the
  // whole point of this engine; fall back to email only when no portal exists, or when
  // the operator explicitly asks for the email lane with --email (e.g. the portal is a
  // manual ticket form that can't be filed by this CLI).
  if (row.portal_url && !flags.email) {
    console.log(
      `PORTAL FILING (preferred — tracked) — paste the body below into: ${row.portal_url}\n\n${body}`,
    );
  } else if (row.contact_email) {
    const { Resend } = await import("resend");
    const client = new Resend(resendKey()) as unknown as EmailSender;
    const r = await sendRecordsRequest(client, {
      from: FROM,
      to: row.contact_email,
      subject,
      text: body,
    });
    if (!r.ok) fail(`send failed (state left drafted): ${r.error}`); // a failed send must NOT look filed
    console.log(`sent to ${row.contact_email}`);
  } else {
    fail(`${key} has neither portal_url nor contact_email — cannot file`);
  }
  await transition(key, "send", { filed_at: new Date().toISOString(), request_body: body });
}

async function list(args: string[]) {
  const { flags } = parseArgs(args);
  const rows = await rest(
    `records_requests?state=in.(drafted,filed,acknowledged,cost_quoted,cost_approved,fulfilled)&select=request_key,target_agency,state,follow_up_days,filed_at,last_contact_at&order=last_contact_at.asc.nullsfirst`,
  );
  const now = Date.now();
  const quiet = flags.quiet != null ? Number(flags.quiet) : null;
  const out = rows.filter((r: { state: string; last_contact_at?: string; filed_at?: string }) => {
    if (quiet == null) return true;
    const since = r.last_contact_at ?? r.filed_at;
    if (!since) return r.state === "drafted"; // never-filed always shows under --quiet
    return (now - new Date(since).getTime()) / 86400000 >= quiet;
  });
  if (!out.length) {
    console.log(quiet != null ? `none quiet ≥${quiet}d ✓` : "none open ✓");
    return;
  }
  for (const r of out) {
    const since = r.last_contact_at ?? r.filed_at;
    const days = since ? Math.floor((now - new Date(since).getTime()) / 86400000) : null;
    const age = days != null ? ` [${days}d quiet]` : " [not filed]";
    console.log(`  ${r.request_key}  ·  ${r.target_agency}  ·  ${r.state}${age}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "add":
    await add(args);
    break;
  case "set":
    await set(args);
    break;
  case "draft":
    await draft(args);
    break;
  case "send":
    await send(args);
    break;
  case "ack":
    await transition(args[0], "ack");
    break;
  case "quote":
    await transition(args[0], "quote", { cost_quoted_usd: Number(args[1]) });
    break;
  case "approve-cost":
    await transition(args[0], "approveCost", {
      cost_approved_usd: (await getRow(args[0])).cost_quoted_usd,
    });
    break;
  case "fulfill": {
    const { positionals, flags } = parseArgs(args);
    await transition(
      positionals[0],
      "fulfill",
      flags.received ? { received_ref: flags.received } : {},
    );
    break;
  }
  case "land":
    await transition(args[0], "land", { landed_target: args[1] });
    break;
  case "deny":
    await transition(args[0], "deny", args[1] ? { notes: args.slice(1).join(" ") } : {});
    break;
  case "withdraw":
    await transition(args[0], "withdraw", args[1] ? { notes: args.slice(1).join(" ") } : {});
    break;
  case "list":
    await list(args);
    break;
  default:
    console.log(
      "usage: bun scripts/records-request.mts <add|set|draft|send|ack|quote|approve-cost|fulfill|land|deny|withdraw|list>",
    );
    process.exit(cmd ? 1 : 0);
}
