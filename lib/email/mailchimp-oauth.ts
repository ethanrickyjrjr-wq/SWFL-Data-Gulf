/**
 * Minimal Mailchimp OAuth 2 + Marketing API client for one-shot member import.
 *
 * No SDK — a single consent redirect, one token exchange, one metadata call
 * (to learn the account's datacenter), and a paginated REST read across every
 * audience (list) the user has, so plain `fetch` keeps the dependency surface
 * (and the lockfile) untouched. Mailchimp OAuth access tokens do NOT expire —
 * verified live 07/16/2026 against
 * https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/:
 * "Mailchimp Marketing access tokens do not expire, so you don't need to use
 * a refresh_token. The access token will remain valid unless the user revokes
 * your application's permission." One-shot import sidesteps storing that
 * non-expiring, all-audiences credential entirely — the token is used
 * in-memory in the callback and never persisted.
 *
 * Endpoints verified live 07/16/2026 (crawl4ai against the pages below; kept
 * out of the repo per RULE 0.4 — findings recorded here + in SESSION_LOG):
 * - Authorize: https://login.mailchimp.com/oauth2/authorize
 *   (https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/#implement-the-oauth-2-workflow-on-your-server)
 * - Token:     https://login.mailchimp.com/oauth2/token (POST, form-encoded
 *   grant_type=authorization_code + client_id + client_secret + redirect_uri + code)
 * - Metadata:  https://login.mailchimp.com/oauth2/metadata (GET) — returns
 *   `{ dc }`, the account's datacenter/server prefix. This ONE endpoint uses
 *   the nonstandard header `Authorization: OAuth <token>` per the official
 *   sample code — every other Marketing API call uses ordinary
 *   `Authorization: Bearer <token>` (confirmed against
 *   https://mailchimp.com/developer/marketing/docs/fundamentals/#authenticate-with-an-api-key-or-oauth-2-token).
 * - API root: `https://{dc}.api.mailchimp.com/3.0` (confirmed against the
 *   Fundamentals doc and the Quick Start guide's curl example).
 * - `GET /lists` and `GET /lists/{list_id}/members` both page via
 *   `count` (default 10, max 1000) + `offset` (default 0), returning
 *   `total_items`; a short page (`length < count`) marks the last page —
 *   confirmed against the live OpenAPI spec
 *   (github.com/mailchimp/mailchimp-client-lib-codegen spec/marketing.json).
 * - Member `status` enum: subscribed | unsubscribed | cleaned | pending |
 *   transactional | archived. `merge_fields` is a free-form dict keyed by
 *   merge tag (FNAME/LNAME are the common default tags, not guaranteed to
 *   exist on every audience).
 *
 * DELTA vs. the task brief: the brief expected the metadata endpoint to
 * "yield the datacenter/api_endpoint" as if both were returned directly.
 * The live response only returns `dc`; the API root URL is a client-side
 * convention (`https://{dc}.api.mailchimp.com/3.0`) documented separately in
 * the Fundamentals guide, not a field Mailchimp hands back. Built accordingly.
 */
import type { ContactRow } from "@/lib/contacts/types";
import { isValidEmail } from "@/lib/email/validation";

const MAILCHIMP_AUTH_ENDPOINT = "https://login.mailchimp.com/oauth2/authorize";
const MAILCHIMP_TOKEN_ENDPOINT = "https://login.mailchimp.com/oauth2/token";
const MAILCHIMP_METADATA_ENDPOINT = "https://login.mailchimp.com/oauth2/metadata";

const DEFAULT_SITE_URL = "https://www.swfldatagulf.com";

/** Are the Mailchimp OAuth credentials configured? Routes degrade gracefully when not. */
export function mailchimpOauthConfigured(): boolean {
  return Boolean(
    process.env.MAILCHIMP_OAUTH_CLIENT_ID && process.env.MAILCHIMP_OAUTH_CLIENT_SECRET,
  );
}

function clientId(): string {
  const v = process.env.MAILCHIMP_OAUTH_CLIENT_ID;
  if (!v) throw new Error("MAILCHIMP_OAUTH_CLIENT_ID is not set");
  return v;
}

function clientSecret(): string {
  const v = process.env.MAILCHIMP_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error("MAILCHIMP_OAUTH_CLIENT_SECRET is not set");
  return v;
}

/** Public site origin (no trailing slash), preferring the configured URL. Mirrors google-oauth.ts. */
export function siteBaseUrl(reqUrl?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (reqUrl) {
    try {
      return new URL(reqUrl).origin;
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_SITE_URL;
}

/** The OAuth redirect target — MUST match the Redirect URI registered for the app. */
export function mailchimpRedirectUri(reqUrl?: string): string {
  return `${siteBaseUrl(reqUrl)}/api/email/contacts/mailchimp/callback`;
}

/** Build the consent-screen URL. `state` is the CSRF nonce echoed back to the callback. */
export function buildMailchimpAuthUrl({
  state,
  redirectUri,
}: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri,
    state,
  });
  return `${MAILCHIMP_AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchange an authorization code for an access token (server-side; secret stays here). */
export async function exchangeCodeForToken({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch(MAILCHIMP_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("token exchange returned no access_token");
  return json.access_token;
}

/**
 * Resolve the account's datacenter (server prefix) from the access token.
 * Note the nonstandard `OAuth <token>` auth scheme — this is the one call in
 * the whole flow that isn't ordinary Bearer auth (see file header).
 */
export async function fetchMailchimpDatacenter(accessToken: string): Promise<string> {
  const res = await fetch(MAILCHIMP_METADATA_ENDPOINT, {
    headers: { authorization: `OAuth ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`oauth2/metadata failed (${res.status})`);
  }
  const json = (await res.json()) as { dc?: string };
  if (!json.dc) throw new Error("metadata response missing dc");
  return json.dc;
}

function apiRoot(dc: string): string {
  return `https://${dc}.api.mailchimp.com/3.0`;
}

const PAGE_SIZE = 1000; // the API's documented maximum `count`

/**
 * Hard ceiling on lists (audiences) read per account. Generous — real accounts
 * rarely exceed a handful of audiences; bounds a pathological account.
 */
const MAX_LISTS = 100;

interface MailchimpListsResponse {
  lists?: { id?: string | null }[];
}

/** Every audience (list) id in the account, paginated. */
async function fetchAllListIds(accessToken: string, dc: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 0; page < MAX_LISTS; page++) {
    const offset = page * PAGE_SIZE;
    const params = new URLSearchParams({ count: String(PAGE_SIZE), offset: String(offset) });
    const res = await fetch(`${apiRoot(dc)}/lists?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`lists fetch failed (${res.status})`);
    const json = (await res.json()) as MailchimpListsResponse;
    const batch = json.lists ?? [];
    for (const l of batch) {
      if (l.id) ids.push(l.id);
    }
    if (batch.length < PAGE_SIZE) break;
  }
  return ids;
}

/** The slice of a Mailchimp list-member resource this connector reads. */
export interface MailchimpMember {
  email_address?: string | null;
  status?: string | null;
  merge_fields?: Record<string, unknown>;
}

interface MailchimpMembersResponse {
  members?: MailchimpMember[];
}

/**
 * Hard ceiling on members held in memory across every audience. The upsert
 * caps STORED contacts at MAX_CONTACT_ROWS (10k) — see google-oauth.ts's
 * identical rationale — so 50k leaves ample headroom while bounding a
 * pathologically large account.
 */
const MAX_MEMBERS = 50_000;

/** Read every member of every audience in the account, following pagination (memory-bounded). */
export async function fetchAllMembers(accessToken: string, dc: string): Promise<MailchimpMember[]> {
  const listIds = await fetchAllListIds(accessToken, dc);
  const out: MailchimpMember[] = [];
  for (const listId of listIds) {
    for (let page = 0; ; page++) {
      const offset = page * PAGE_SIZE;
      const params = new URLSearchParams({ count: String(PAGE_SIZE), offset: String(offset) });
      const res = await fetch(`${apiRoot(dc)}/lists/${listId}/members?${params.toString()}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`list members fetch failed (${res.status})`);
      const json = (await res.json()) as MailchimpMembersResponse;
      const batch = json.members ?? [];
      out.push(...batch);
      if (batch.length < PAGE_SIZE || out.length >= MAX_MEMBERS) break;
    }
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}

/**
 * Pure Mailchimp member → ContactRow mapper. Network-free so it unit-tests in
 * isolation (the OAuth dance and the actual list/member fetches live above).
 *
 * A member missing/blank `email_address`, or one that fails `isValidEmail`
 * (lib/email/validation.ts — the same RFC-lite shape check + 254-char cap the
 * subscribe/waitlist routes use), is skipped — there's nothing valid to
 * write. `upsertCanonicalContacts` itself does NOT validate email shape (only
 * the legacy Google path validates, via `upsert-contacts.ts`), so this
 * connector must — a canonical write path must never trust an unvalidated
 * upstream shape. `status !== "subscribed"` sets `unsubscribed: true`; a genuinely
 * subscribed member OMITS the key entirely (upsertCanonicalContacts's
 * one-way rule requires this — see lib/contacts/upsert.ts).
 *
 * The SAME email can legitimately appear on more than one audience (list) in
 * one Mailchimp account (e.g. "Newsletter" + "Customers") — a normal
 * multi-audience topology, not an edge case. Two rows for the same email in
 * one upsert batch would hit Postgres's "ON CONFLICT DO UPDATE command
 * cannot affect row a second time" and fail the whole batch, so this mapper
 * dedupes before returning. If ANY occurrence for that email is
 * non-subscribed, the merged row is marked unsubscribed — errs toward
 * honoring an opt-out this Mailchimp account itself already recorded rather
 * than any other audience's subscribed status overriding it.
 *
 * The dedupe key is the EXACT email string, not a lowercased one:
 * `public.contacts` has `UNIQUE (user_id, email)` on a plain `text` column
 * (docs/sql/20260618_contacts_and_blasts.sql) — no `citext`, no `lower()`
 * functional index — so Postgres itself treats "Dup@X.com" and "dup@x.com"
 * as two distinct rows, not a conflict. Lowercasing here would collapse rows
 * the database considers separate; matching its exact-string equality is
 * what actually prevents the "cannot affect row a second time" crash without
 * silently merging contacts the schema doesn't consider duplicates.
 */
export function mailchimpMembersToContactRows(members: MailchimpMember[]): ContactRow[] {
  const byEmail = new Map<string, ContactRow>();
  for (const m of members ?? []) {
    const email = (m.email_address ?? "").trim();
    if (!email || !isValidEmail(email)) continue;
    const key = email;

    const fname =
      typeof m.merge_fields?.FNAME === "string" ? (m.merge_fields.FNAME as string).trim() : "";
    const lname =
      typeof m.merge_fields?.LNAME === "string" ? (m.merge_fields.LNAME as string).trim() : "";
    const name = [fname, lname].filter(Boolean).join(" ") || null;
    const unsubscribed = m.status !== "subscribed";

    const existing = byEmail.get(key);
    if (!existing) {
      const row: ContactRow = { email, name, phone: null, tags: ["mailchimp"], attribs: {} };
      if (unsubscribed) row.unsubscribed = true;
      byEmail.set(key, row);
      continue;
    }
    // Merge: keep the first name we saw, but let any non-subscribed sighting win.
    if (unsubscribed) existing.unsubscribed = true;
    if (!existing.name && name) existing.name = name;
  }
  return Array.from(byEmail.values());
}
