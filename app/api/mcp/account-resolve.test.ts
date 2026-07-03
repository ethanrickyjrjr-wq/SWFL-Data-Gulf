import { test, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectKeyRow } from "./project-tools";
import {
  tokenFromHeader,
  resolveUserByToken,
  loadOwnedProjects,
  resolveProject,
  resolveAccountProject,
  formatDisambiguation,
} from "./account-resolve";

/**
 * Account-level MCP token resolution — the connect-once path.
 *
 * The safety core: the write target is derived from (token → owned set →
 * resolver), NEVER a payload project id. A selector can only pick one of the
 * caller's OWN projects; ambiguity is a hard stop that writes nothing.
 */

const proj = (over: Partial<ProjectKeyRow> = {}): ProjectKeyRow => ({
  id: "p1",
  user_id: "uA",
  title: "Test Project",
  items: [],
  branding: null,
  ...over,
});

/** Fake service-role client: token→user_id lookup + owned-projects-by-user. */
function fakeDb(opts: { tokens?: Record<string, string>; projects?: ProjectKeyRow[] }) {
  const tokens = opts.tokens ?? {};
  const projects = opts.projects ?? [];
  function from(table: string) {
    const filters: Record<string, unknown> = {};
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      maybeSingle: () => {
        if (table === "user_mcp_tokens") {
          const uid = tokens[filters.token as string];
          return Promise.resolve({ data: uid ? { user_id: uid } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      // loadOwnedProjects awaits the builder directly (no maybeSingle).
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (table === "projects")
          return resolve({
            data: projects.filter((p) => p.user_id === filters.user_id),
            error: null,
          });
        return resolve({ data: null, error: null });
      },
    };
    return b;
  }
  return { from } as unknown as SupabaseClient;
}

const hdr = (v?: string) =>
  v === undefined ? undefined : { requestInfo: { headers: { "x-account-key": v } } };

// --- tokenFromHeader -------------------------------------------------------

test("tokenFromHeader: reads X-Account-Key, trims, tolerates array", () => {
  expect(tokenFromHeader(hdr("acct_abc"))).toBe("acct_abc");
  expect(tokenFromHeader({ requestInfo: { headers: { "x-account-key": [" acct_x "] } } })).toBe(
    "acct_x",
  );
  expect(tokenFromHeader(undefined)).toBeNull();
  expect(tokenFromHeader({ requestInfo: { headers: {} } })).toBeNull();
});

// --- resolveUserByToken ----------------------------------------------------

test("resolveUserByToken: valid token → user_id; unknown/null → null", async () => {
  const db = fakeDb({ tokens: { acct_ok: "uA" } });
  expect(await resolveUserByToken(db, "acct_ok")).toEqual({ user_id: "uA" });
  expect(await resolveUserByToken(db, "acct_nope")).toBeNull();
  expect(await resolveUserByToken(db, null)).toBeNull();
});

// --- loadOwnedProjects -----------------------------------------------------

test("loadOwnedProjects: returns ONLY the given user's projects", async () => {
  const db = fakeDb({
    projects: [proj({ id: "a", user_id: "uA" }), proj({ id: "b", user_id: "uB" })],
  });
  const owned = await loadOwnedProjects(db, "uA");
  expect(owned.map((p) => p.id)).toEqual(["a"]);
});

// --- resolveProject tiers --------------------------------------------------

const A = proj({ id: "id-1", user_id: "uA", title: "SWFL CRE" });
const B = proj({ id: "id-2", user_id: "uA", title: "cre swfl" });
const C = proj({ id: "id-3", user_id: "uA", title: "Naples deck" });

test("resolveProject: exact id wins", () => {
  const r = resolveProject([A, B, C], "id-2");
  expect(r).toEqual({ project: B });
});

test("resolveProject: exact title (case-insensitive)", () => {
  const r = resolveProject([A, B, C], "swfl cre");
  expect(r).toEqual({ project: A });
});

test("resolveProject: prefix (case-insensitive)", () => {
  const r = resolveProject([A, B, C], "naple");
  expect(r).toEqual({ project: C });
});

test("resolveProject: substring (case-insensitive)", () => {
  const r = resolveProject([A, B, C], "deck");
  expect(r).toEqual({ project: C });
});

test("resolveProject: a 2+ tier does NOT fall through to a laxer tier (identical titles)", () => {
  const u1 = proj({ id: "u1", title: "Untitled project" });
  const u2 = proj({ id: "u2", title: "Untitled project" });
  const r = resolveProject([u1, u2], "Untitled project");
  expect("candidates" in r && r.candidates.map((p) => p.id)).toEqual(["u1", "u2"]);
});

test("resolveProject: prefix ambiguity stops (does not resolve via substring)", () => {
  const n1 = proj({ id: "n1", title: "Naples North" });
  const n2 = proj({ id: "n2", title: "Naples South" });
  const r = resolveProject([n1, n2], "Naples");
  expect("candidates" in r && r.candidates.map((p) => p.id)).toEqual(["n1", "n2"]);
});

test("resolveProject: no selector + exactly one owned → that project (zero friction)", () => {
  expect(resolveProject([A], undefined)).toEqual({ project: A });
});

test("resolveProject: no selector + zero owned → empty candidates", () => {
  expect(resolveProject([], undefined)).toEqual({ candidates: [] });
});

test("resolveProject: no selector + 2+ owned → ask (all candidates)", () => {
  const r = resolveProject([A, B, C], undefined);
  expect("candidates" in r && r.candidates.map((p) => p.id)).toEqual(["id-1", "id-2", "id-3"]);
});

test("resolveProject: selector matching nothing → full owned list (not an error, not a guess)", () => {
  const r = resolveProject([A, B, C], "zzz-no-such-project");
  expect("candidates" in r && r.candidates.map((p) => p.id)).toEqual(["id-1", "id-2", "id-3"]);
});

// --- cross-user isolation --------------------------------------------------

test("resolveAccountProject: user B's exact project id under user A's token resolves to NOTHING (never B's project)", async () => {
  const db = fakeDb({
    tokens: { acct_A: "uA" },
    projects: [
      proj({ id: "A-proj", user_id: "uA", title: "A only" }),
      proj({ id: "B-proj", user_id: "uB", title: "B only" }),
    ],
  });
  // A passes B's exact project id as the selector.
  const r = await resolveAccountProject(db, hdr("acct_A"), "B-proj");
  // Owned set for uA never includes B-proj → no exact-id match → candidates = uA's only.
  expect("candidates" in r).toBe(true);
  if ("candidates" in r) expect(r.candidates.map((p) => p.id)).toEqual(["A-proj"]);
});

// --- resolveAccountProject branches ---------------------------------------

test("resolveAccountProject: no X-Account-Key header → { noToken }", async () => {
  const db = fakeDb({});
  expect(await resolveAccountProject(db, undefined, undefined)).toEqual({ noToken: true });
});

test("resolveAccountProject: unmatched token → { invalid }", async () => {
  const db = fakeDb({ tokens: { acct_A: "uA" } });
  expect(await resolveAccountProject(db, hdr("acct_revoked"), undefined)).toEqual({
    invalid: true,
  });
});

test("resolveAccountProject: valid token + single owned → { project }", async () => {
  const db = fakeDb({
    tokens: { acct_A: "uA" },
    projects: [proj({ id: "only", user_id: "uA" })],
  });
  const r = await resolveAccountProject(db, hdr("acct_A"), undefined);
  expect("project" in r && r.project.id).toBe("only");
});

test("resolveAccountProject: valid token + 2 owned + no selector → { candidates }", async () => {
  const db = fakeDb({
    tokens: { acct_A: "uA" },
    projects: [proj({ id: "x", user_id: "uA" }), proj({ id: "y", user_id: "uA" })],
  });
  const r = await resolveAccountProject(db, hdr("acct_A"), undefined);
  expect("candidates" in r && r.candidates.map((p) => p.id)).toEqual(["x", "y"]);
});

// --- formatDisambiguation --------------------------------------------------

test("formatDisambiguation: numbered names for the user + assistant-only id map", () => {
  const out = formatDisambiguation([
    proj({ id: "id-1", title: "SWFL CRE" }),
    proj({ id: "id-2", title: "cre swfl" }),
  ]);
  expect(out).toContain("1. SWFL CRE");
  expect(out).toContain("2. cre swfl");
  expect(out).toContain("1=id-1 2=id-2");
  expect(out).toContain("never these ids");
});

test("formatDisambiguation: empty owned set → create-a-project nudge", () => {
  expect(formatDisambiguation([])).toContain("don't have any projects yet");
});
