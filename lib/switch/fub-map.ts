/**
 * Follow Up Boss (FUB) — pure People -> ContactRow mapper + paged fetch
 * adapter, for a paste-your-own-API-key one-shot import (Task 7).
 *
 * RULE 0.4 vendor verification (crawl4ai, live, 07/16/2026 — output kept
 * local, never committed, matches the `*crawl4ai*` gitignore):
 * - https://docs.followupboss.com/reference/getting-started — base URL is
 *   `https://api.followupboss.com/v1/{resource}` (e.g. `/v1/people`), v1 is
 *   the only version.
 * - https://docs.followupboss.com/reference/authentication — "There are two
 *   ways to authenticate... OAuth and Basic Authentication via API Key... If
 *   you are using API Keys... you must use Basic Authentication... Use API
 *   Key as the username and leave the password blank." Confirmed verbatim —
 *   this connector uses Basic auth with the pasted key as username, blank
 *   password.
 * - https://docs.followupboss.com/reference/people-get (+ its embedded
 *   OpenAPI response example, fetched via the `.md` route) — confirms the
 *   envelope and the FULL example Person object:
 *   ```
 *   { "_metadata": { "collection": "people", "offset": 0, "limit": 10, "total": 35 },
 *     "people": [ { "id": 10763, "name": "Tom Minch", "firstName": "Tom",
 *       "lastName": "Minch", "emails": [ { "value": "tom.minch@example.com",
 *       "type": "home", "isPrimary": 1, "status": "Valid" } ],
 *       "phones": [ { "type": "home", "value": "555-555-1234", "status":
 *       "Invalid" } ], ... } ] }
 *   ```
 *   `emails[].isPrimary` is a 1/0 flag (not always boolean-typed); the
 *   people-post reference states the creation-time convention explicitly:
 *   "the first email in the list will be the primary email address" — same
 *   sentence for phones. The `merge-fields` doc's `%contact_email%` ->
 *   `emails[0].value` and `%contact_phone%` -> `phones[0].value` mappings
 *   independently confirm "index 0 is primary" as FUB's own integrator
 *   contract, so this mapper uses `isPrimary` when present and falls back to
 *   `emails[0]`/`phones[0]` — never invented, both paths are FUB-documented.
 * - https://docs.followupboss.com/reference/pagination — collection
 *   responses page via `limit` (default 10, MAX 100) + `offset` (default 0)
 *   OR the keyset `next` param (recommended, and "the API enforces the use
 *   of the next parameter" for deep offsets). `_metadata.next` carries the
 *   opaque cursor for the following page; `_metadata.nextLink` is the same
 *   as a ready-made URL. This connector uses `next` for every page after the
 *   first, per the docs' own recommendation.
 * - https://docs.followupboss.com/reference/rate-limiting — the default
 *   "global" rate limit is 250 req/10s (125/10s without a registered
 *   X-System-Key). A 40-page fetch loop stays well under either.
 *
 * DELTA vs. the task brief: the brief asked to verify "any unsubscribe/
 * emailsDisabled flag" on the Person object. None exists. Cross-checked
 * across the getting-started, authentication, people-get (+ live response
 * example), people-post, people-id-put, pagination, common-filters,
 * webhooks-guide, merge-fields, and email-marketing-integration-guide pages
 * — no Person field for "unsubscribed"/"emailsDisabled"/"do not email" shows
 * up anywhere. FUB's only unsubscribe concept is `emEvents` (type
 * "unsubscribe") and the `emEventsUnsubscribed` webhook — both describe an
 * OUTSIDE email-marketing system telling FUB that a recipient unsubscribed
 * from THAT system's campaign; there is nothing FUB reports back to us,
 * inbound, via `GET /people`. `emails[].status` ("Valid"/"Invalid") is a
 * deliverability signal, not a subscription signal, and is deliberately NOT
 * read as a proxy for opt-out — conflating the two would be inventing a
 * signal FUB never sent. Consequently `fubPeopleToContactRows` NEVER sets
 * `unsubscribed` on any row; the key is always absent (never `false`),
 * satisfying `upsertCanonicalContacts`'s one-way contract by construction.
 */
import type { ContactRow } from "@/lib/contacts/types";
import { isValidEmail } from "@/lib/email/validation";

const FUB_API_ROOT = "https://api.followupboss.com/v1";

/** The slice of a FUB `emails[]` entry this connector reads. */
export interface FubEmail {
  value?: string | null;
  type?: string | null;
  /** 1/0 per the live example payload; some clients may hand back a real boolean. */
  isPrimary?: number | boolean | null;
  status?: string | null;
}

/** The slice of a FUB `phones[]` entry this connector reads. */
export interface FubPhone {
  value?: string | null;
  type?: string | null;
  status?: string | null;
}

/** The slice of a FUB Person resource this connector reads (see file header for the live example). */
export interface FubPerson {
  id?: number;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emails?: FubEmail[] | null;
  phones?: FubPhone[] | null;
}

interface FubMetadata {
  collection?: string;
  offset?: number;
  limit?: number;
  total?: number;
  next?: string | null;
  nextLink?: string | null;
}

interface FubPeopleResponse {
  _metadata?: FubMetadata;
  people?: FubPerson[];
}

/** Are we authorized? (fetch failed on the very first page — bad key, locked account, etc.) */
export class FubFetchError extends Error {}

const PAGE_SIZE = 100; // the documented maximum `limit`
export const FUB_MAX_PAGES = 40;
export const FUB_MAX_PEOPLE = FUB_MAX_PAGES * PAGE_SIZE; // 4000, per the brief's hard cap

/** Only the fields this connector reads — minimizes payload per the docs' own guidance. */
const FIELDS = "id,name,firstName,lastName,emails,phones";

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

/**
 * Page every person in the account via `GET /v1/people`, using the `next`
 * keyset cursor (per the live pagination doc's own recommendation) rather
 * than `offset`. Hard-capped at FUB_MAX_PAGES pages / FUB_MAX_PEOPLE people
 * (brief's cap for v1) — `truncated: true` when the cap cuts off a longer
 * result set (there was a `next` cursor left unconsumed, or a full page was
 * still coming when the page-count cap hit).
 *
 * The API key is used ONLY for these requests, held in a local variable —
 * never persisted, never logged.
 */
export async function fetchAllFubPeople(
  apiKey: string,
): Promise<{ people: FubPerson[]; truncated: boolean }> {
  const auth = basicAuthHeader(apiKey);
  const headers: Record<string, string> = { authorization: auth, accept: "application/json" };
  // Optional registered-system identification (docs/reference/identification):
  // raises the rate-limit ceiling and is the documented best practice, but is
  // NOT required for a pasted-API-key Basic-auth call to function — degrade
  // gracefully when unset rather than blocking v1 on partner registration.
  if (process.env.FUB_X_SYSTEM_NAME) headers["X-System"] = process.env.FUB_X_SYSTEM_NAME;
  if (process.env.FUB_X_SYSTEM_KEY) headers["X-System-Key"] = process.env.FUB_X_SYSTEM_KEY;

  const people: FubPerson[] = [];
  let next: string | undefined;
  let truncated = false;

  for (let page = 0; page < FUB_MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), fields: FIELDS });
    if (next) params.set("next", next);

    const res = await fetch(`${FUB_API_ROOT}/people?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new FubFetchError(`GET /people failed (${res.status})`);
    }
    const json = (await res.json()) as FubPeopleResponse;
    const batch = json.people ?? [];
    people.push(...batch);
    next = json._metadata?.next ?? undefined;

    const hitPeopleCap = people.length >= FUB_MAX_PEOPLE;
    const lastPageOfLoop = page === FUB_MAX_PAGES - 1;
    const noMorePages = !next || batch.length < PAGE_SIZE;

    if (hitPeopleCap || noMorePages) {
      if (hitPeopleCap && next) truncated = true;
      break;
    }
    if (lastPageOfLoop && next) truncated = true;
  }

  return { people: people.slice(0, FUB_MAX_PEOPLE), truncated };
}

/**
 * Pure FUB Person -> ContactRow mapper. Network-free so it unit-tests in
 * isolation (the Basic-auth paged fetch lives in `fetchAllFubPeople` above).
 *
 * Primary email: the entry with `isPrimary` truthy (1 or true); falls back
 * to `emails[0]` when no entry is flagged (both are FUB-documented — see
 * file header). A person with no usable email (missing, blank, or failing
 * `isValidEmail` — `upsertCanonicalContacts` itself does not validate email
 * shape) is skipped and counted.
 *
 * Name: FUB already returns a combined `name` field on read; falls back to
 * joining `firstName`+`lastName` when `name` is blank/absent.
 *
 * Phone: `phones[0].value` (FUB's own "first is primary" convention — see
 * file header; FUB's read response does not carry `isPrimary` on phones the
 * way it does on emails), null-safe when `phones` is empty/absent.
 *
 * `unsubscribed` is NEVER set (see file header's DELTA note) — every row
 * omits the key, which is what `upsertCanonicalContacts`'s one-way opt-out
 * contract requires for "no signal either way".
 */
export function fubPeopleToContactRows(people: FubPerson[]): {
  rows: ContactRow[];
  skipped: number;
} {
  const rows: ContactRow[] = [];
  let skipped = 0;

  for (const p of people ?? []) {
    const emails = p.emails ?? [];
    const primary = emails.find((e) => e.isPrimary === 1 || e.isPrimary === true) ?? emails[0];
    const email = (primary?.value ?? "").trim();
    if (!email || !isValidEmail(email)) {
      skipped++;
      continue;
    }

    const phones = p.phones ?? [];
    const phoneValue = phones[0]?.value?.trim();
    const phone = phoneValue ? phoneValue : null;

    const directName = p.name?.trim();
    const joinedName = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
    const name = directName || joinedName || null;

    rows.push({ name, email, phone, tags: ["followupboss"], attribs: {} });
  }

  return { rows, skipped };
}
