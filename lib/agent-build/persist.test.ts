// findProjectId — failure modes under test:
// (1) an address-titled project saved as kind:"general" (every pre-08/19 door except the
//     grid's listing door) was INVISIBLE to the agent-build matcher, so agent builds for a
//     known address 404'd or scattered instead of grouping into the owner's project;
// (2) a query error must stay fail-CLOSED (null), never a guess.
// Stub filters .eq() like PostgREST would, so (1) is genuinely red against a kind filter.
import { afterAll, expect, mock, test } from "bun:test";

const realServiceRole = await import("@/utils/supabase/service-role");
afterAll(() => {
  mock.module("@/utils/supabase/service-role", () => realServiceRole);
});

type Row = {
  id: string;
  subject_address: string | null;
  updated_at: string;
  kind: string;
  user_id: string;
};

let rows: Row[] = [];
let queryError: { message: string } | null = null;

function chain(pending: Row[]) {
  return {
    select: () => chain(pending),
    eq: (field: keyof Row, value: string) => chain(pending.filter((r) => r[field] === value)),
    order: () => chain(pending),
    limit: async () =>
      queryError ? { data: null, error: queryError } : { data: pending, error: null },
  };
}

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: () => chain(rows) }),
}));

const { findProjectId } = await import("./persist");

test("kind:'general' project with matching subject_address IS matched — address-titled generals group agent builds", async () => {
  queryError = null;
  rows = [
    {
      id: "proj-general",
      subject_address: "326 Shore Dr, Fort Myers, FL 33905",
      updated_at: "2026-08-10",
      kind: "general",
      user_id: "u1",
    },
  ];
  const hit = await findProjectId("u1", "326 Shore Drive, Fort Myers, FL 33905");
  expect(hit).toMatchObject({ projectId: "proj-general" });
});

test("query error stays fail-closed: null, never a guess", async () => {
  queryError = { message: "boom" };
  rows = [];
  expect(await findProjectId("u1", "326 Shore Dr, Fort Myers, FL 33905")).toBeNull();
});
