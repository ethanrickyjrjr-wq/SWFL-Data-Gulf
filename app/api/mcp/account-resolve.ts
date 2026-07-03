import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectKeyRow } from "./project-tools";

/**
 * Account-level MCP token → user → project resolution — the CONNECT-ONCE default.
 *
 * ADDITIVE to the per-project `X-Project-Key` path (which is left fully intact,
 * for anyone who wants a key scoped to a single project). One `X-Account-Key` per
 * user reaches EVERY project that user owns; the specific project is chosen per
 * tool call by an optional `project` NAME/id selector, resolved SERVER-SIDE
 * against the set of projects the token's user owns.
 *
 * SECURITY (LB-R6b holds): the write target is derived from
 * (token → owned set → resolver), NEVER from a raw `project_id` payload. The
 * selector can only ever pick one of the caller's OWN projects — the candidate
 * set is built from `user_id = <resolved user>` BEFORE any matching runs, so an
 * exact-id guess of another user's project id resolves to nothing, never to that
 * project. Ambiguity is a HARD STOP: the tool asks and writes nothing.
 *
 * This module is deliberately PURE of MCP transport types (kept in its own file)
 * so it is unit-testable in isolation and — pragmatically — so it does not have to
 * be co-edited into `project-tools.ts` while that file carries other in-flight
 * work. `project-tools.ts` wires it in with a few lines in `authorize()`.
 */

/** The shape of the SDK tool `extra` we read — request headers, when the host
 *  transport forwards them. Loose by design: absent on hosts that drop them. */
export interface ToolExtra {
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
}

/** The account token arrives ONLY in the `X-Account-Key` request header — the same
 *  header-only guarantee as the per-project key (never a tool arg, never logged). */
export function tokenFromHeader(extra: ToolExtra | undefined): string | null {
  const header = extra?.requestInfo?.headers?.["x-account-key"];
  const v = Array.isArray(header) ? header[0] : header;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** Resolve an account token → its owning user via SERVICE-ROLE lookup on the
 *  UNIQUE `user_mcp_tokens.token`. Null on no / blank / unmatched token (regenerate
 *  overwrites the row's token, so an old token matches nothing = revoked). */
export async function resolveUserByToken(
  db: SupabaseClient,
  token: string | null,
): Promise<{ user_id: string } | null> {
  if (!token) return null;
  const { data } = await db
    .from("user_mcp_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();
  return data ? { user_id: (data as { user_id: string }).user_id } : null;
}

/** Every project a user owns — the candidate set for `resolveProject`. */
export async function loadOwnedProjects(
  db: SupabaseClient,
  user_id: string,
): Promise<ProjectKeyRow[]> {
  const { data } = await db
    .from("projects")
    .select("id, user_id, title, items, branding")
    .eq("user_id", user_id);
  return (data as ProjectKeyRow[] | null) ?? [];
}

/**
 * Pick ONE project from the user's OWNED set given the optional `project`
 * selector. Deterministic, code-enforced — never a model guess.
 *
 *  - No selector: exactly-one-owned → that project (zero ambiguity, low friction);
 *    else ask (0 or 2+).
 *  - Selector present: try tiers in order, STOPPING at the first that yields
 *    EXACTLY ONE match — (a) exact id, (b) exact title (ci), (c) title prefix
 *    (ci), (d) title substring (ci). A tier with 2+ hits is itself ambiguous and
 *    does NOT fall through to a laxer tier (a looser match compounds ambiguity).
 *  - No match anywhere / ambiguous: `{ candidates }` — the caller asks and writes
 *    nothing. Candidates = the matched set on a genuine multi-match, else the full
 *    owned list (empty selector or no match).
 */
export function resolveProject(
  owned: ProjectKeyRow[],
  projectArg: string | undefined,
): { project: ProjectKeyRow } | { candidates: ProjectKeyRow[] } {
  const arg = projectArg?.trim();
  if (!arg) {
    if (owned.length === 1) return { project: owned[0] };
    return { candidates: owned };
  }
  const lc = arg.toLowerCase();
  const tiers: ((p: ProjectKeyRow) => boolean)[] = [
    (p) => p.id === arg,
    (p) => (p.title ?? "").toLowerCase() === lc,
    (p) => (p.title ?? "").toLowerCase().startsWith(lc),
    (p) => (p.title ?? "").toLowerCase().includes(lc),
  ];
  for (const tier of tiers) {
    const m = owned.filter(tier);
    if (m.length === 1) return { project: m[0] };
    if (m.length > 1) return { candidates: m };
  }
  return { candidates: owned };
}

/**
 * The user-facing disambiguation prompt. Name-only numbered list (the text a model
 * relays verbatim — no internal ids surfaced), plus a trailing assistant-only line
 * carrying the id map so a bare-number reply ("2") can be turned into an exact-id
 * `project` call next turn WITHOUT the model having to paste an id to the user.
 * Ids are needed because two projects can share a title (e.g. "Untitled project").
 */
export function formatDisambiguation(candidates: ProjectKeyRow[]): string {
  if (candidates.length === 0)
    return "You don't have any projects yet — create one on the web, then I can file into it.";
  const names = candidates.map((c, i) => `${i + 1}. ${c.title ?? "Untitled project"}`).join("\n");
  const idMap = candidates.map((c, i) => `${i + 1}=${c.id}`).join(" ");
  return (
    `Which project? Reply with the number:\n${names}\n\n` +
    `(Assistant: to act on the choice, call the tool again with \`project\` set to the ` +
    `matching id — ${idMap}. Show the user only the numbered names above, never these ids.)`
  );
}

/**
 * Combine header → token → user → owned → resolver into the ONE call
 * `project-tools.ts` makes for the account branch of `authorize()`.
 *
 *  - `{ noToken: true }`   — no `X-Account-Key` header at all (fall back to the
 *                            per-project `X-Project-Key` path).
 *  - `{ invalid: true }`   — token present but unmatched/revoked.
 *  - `{ candidates }`      — resolved to a user, but the `project` selector is
 *                            absent/ambiguous/no-match → ASK, write nothing.
 *  - `{ project }`         — resolved to exactly one owned project.
 */
export async function resolveAccountProject(
  db: SupabaseClient,
  extra: ToolExtra | undefined,
  projectArg: string | undefined,
): Promise<
  | { noToken: true }
  | { invalid: true }
  | { candidates: ProjectKeyRow[] }
  | { project: ProjectKeyRow }
> {
  const token = tokenFromHeader(extra);
  if (!token) return { noToken: true };
  const user = await resolveUserByToken(db, token);
  if (!user) return { invalid: true };
  const owned = await loadOwnedProjects(db, user.user_id);
  return resolveProject(owned, projectArg);
}
