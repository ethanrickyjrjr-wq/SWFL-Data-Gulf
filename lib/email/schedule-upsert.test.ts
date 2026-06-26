import { describe, expect, test } from "bun:test";
import { createOrTouchSchedule } from "./schedule-upsert";
import type { ParsedCommand } from "./schedule-command";

// ---------------------------------------------------------------------------
// A fake Supabase query builder that ACTUALLY evaluates the applied filters
// against seeded rows (eq / neq / is-null), so NULL-equal matching is proven
// end-to-end — not just asserted on a mock's call args.
// ---------------------------------------------------------------------------

interface SeedRow {
  id: number;
  user_id: string;
  project_id: string;
  status: string;
  template_id: string | null;
  scope_kind: string | null;
  scope_value: string | null;
  topic: string | null;
  audience_slug: string | null;
  cadence: string;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour_et: number;
}

function makeDb(seed: SeedRow[] = []) {
  const store = {
    rows: seed.map((r) => ({ ...r })) as Record<string, unknown>[],
    nextId: 1000,
    inserts: [] as Record<string, unknown>[],
    updates: [] as { patch: Record<string, unknown>; matched: number }[],
  };

  function builder() {
    const state = {
      mode: "select" as "select" | "update" | "insert",
      filters: [] as { col: string; op: "eq" | "neq" | "is"; val: unknown }[],
      patch: null as Record<string, unknown> | null,
    };
    const match = (row: Record<string, unknown>) =>
      state.filters.every((f) => {
        const v = row[f.col] ?? null;
        if (f.op === "eq") return v === f.val;
        if (f.op === "neq") return v !== f.val;
        return v === f.val; // is (val === null)
      });

    const api: Record<string, (...a: never[]) => unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: unknown) => (state.filters.push({ col, op: "eq", val }), api);
    api.neq = (col: string, val: unknown) => (state.filters.push({ col, op: "neq", val }), api);
    api.is = (col: string, val: unknown) => (state.filters.push({ col, op: "is", val }), api);
    api.update = (patch: Record<string, unknown>) => (
      (state.mode = "update"),
      (state.patch = patch),
      api
    );
    api.insert = (obj: Record<string, unknown>) => {
      state.mode = "insert";
      const row = { id: store.nextId++, ...obj };
      store.rows.push(row);
      store.inserts.push(row);
      (state as { _id?: number })._id = row.id;
      return api;
    };
    api.maybeSingle = async () => ({ data: store.rows.find(match) ?? null, error: null });
    api.single = async () => ({ data: { id: (state as { _id?: number })._id }, error: null });
    // PromiseLike so `await db.from().update().eq()` resolves (update has no .single()).
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        if (state.mode === "update") {
          const matched = store.rows.filter(match);
          for (const r of matched) Object.assign(r, state.patch);
          store.updates.push({ patch: state.patch!, matched: matched.length });
        }
        return Promise.resolve({ error: null }).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };
    return api;
  }

  return { db: { from: () => builder() } as never, store };
}

function baseRow(over: Partial<SeedRow> = {}): SeedRow {
  return {
    id: 1,
    user_id: "u1",
    project_id: "p1",
    status: "active",
    template_id: "report",
    scope_kind: "zip",
    scope_value: "33901",
    topic: null,
    audience_slug: "buyers",
    cadence: "weekly",
    day_of_week: 1,
    day_of_month: null,
    send_hour_et: 8,
    ...over,
  };
}

function cmd(over: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    action: "create",
    template_id: "report",
    scope_kind: "zip",
    scope_value: "33901",
    audience_slug: "buyers",
    cadence: "weekly",
    day_of_week: 1,
    send_hour_et: 8,
    ...over,
  };
}

const NOW = "2026-06-16T12:00:00.000Z";
const NEXT = "2026-06-22T12:00:00.000Z";

describe("createOrTouchSchedule", () => {
  test("no existing match → inserts a new active row, created:true", async () => {
    const { db, store } = makeDb([]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd(),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(true);
    expect(store.inserts).toHaveLength(1);
    expect(store.updates).toHaveLength(0);
    expect(store.inserts[0]).toMatchObject({
      template_id: "report",
      scope_value: "33901",
      status: "active",
      next_run_at: NEXT,
    });
  });

  test("an existing active row with the same recipe → updates it, no insert, created:false", async () => {
    const { db, store } = makeDb([baseRow({ id: 7 })]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd(),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(false);
    expect(r.id).toBe(7);
    expect(store.inserts).toHaveLength(0);
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0].patch).toMatchObject({
      status: "active",
      next_run_at: NEXT,
      updated_at: NOW,
    });
  });

  test("a PAUSED row with the same recipe is reactivated (matched, set active), not duplicated", async () => {
    const { db, store } = makeDb([baseRow({ id: 9, status: "paused" })]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd(),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(false);
    expect(r.id).toBe(9);
    expect(store.inserts).toHaveLength(0);
    expect(store.updates[0].patch).toMatchObject({ status: "active" });
  });

  test("a STOPPED identical recipe reactivates in place (same as paused), not duplicated", async () => {
    const { db, store } = makeDb([baseRow({ id: 5, status: "stopped" })]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd(),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(false);
    expect(r.id).toBe(5);
    expect(store.inserts).toHaveLength(0);
    expect(store.updates[0].patch).toMatchObject({ status: "active", next_run_at: NEXT });
  });

  test("NULL-equal: an existing row differing ONLY by a NULL-vs-value optional is NOT a match → inserts", async () => {
    // Seeded row has audience_slug "buyers"; the command has NO audience (null). With a
    // broken `eq(audience_slug, null)` this row would wrongly match (or wrongly miss);
    // the `is null` filter correctly EXCLUDES it → a distinct schedule is created.
    const { db, store } = makeDb([baseRow({ id: 3, audience_slug: "buyers" })]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd({ audience_slug: undefined }),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(true);
    expect(store.inserts).toHaveLength(1);
  });

  test("NULL-equal: a command with a NULL optional matches an existing row whose column is ALSO null", async () => {
    const { db, store } = makeDb([baseRow({ id: 4, audience_slug: null })]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd({ audience_slug: undefined }),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(false);
    expect(r.id).toBe(4);
    expect(store.inserts).toHaveLength(0);
  });

  test("a different user's identical recipe does not match (ownership scoping)", async () => {
    const { db, store } = makeDb([baseRow({ id: 2, user_id: "OTHER" })]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd(),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(true);
    expect(store.inserts).toHaveLength(1);
  });

  test("a block-canvas command persists deliverable_id on the inserted row", async () => {
    const { db, store } = makeDb([]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd({
        template_id: "block-canvas",
        deliverable_id: "deliv-A",
        scope_kind: undefined,
        scope_value: undefined,
      }),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(true);
    expect(store.inserts[0]).toMatchObject({
      template_id: "block-canvas",
      deliverable_id: "deliv-A",
    });
  });

  test("two block-canvas schedules with DIFFERENT deliverable_ids don't collide → both insert", async () => {
    // Seed an existing block-canvas schedule for design A; a create for design B (same
    // cadence/scope) must NOT reactivate A's row — deliverable_id is part of the recipe
    // signature, so they're distinct. Without it B would silently send A's email.
    const { db, store } = makeDb([
      baseRow({
        id: 11,
        template_id: "block-canvas",
        scope_kind: null,
        scope_value: null,
        audience_slug: null,
        // @ts-expect-error — SeedRow predates the column; the fake matches on row[col] ?? null.
        deliverable_id: "deliv-A",
      }),
    ]);
    const r = await createOrTouchSchedule(db, {
      userId: "u1",
      projectId: "p1",
      command: cmd({
        template_id: "block-canvas",
        deliverable_id: "deliv-B",
        scope_kind: undefined,
        scope_value: undefined,
        audience_slug: undefined,
      }),
      nowIso: NOW,
      nextRunAtIso: NEXT,
    });
    expect(r.created).toBe(true);
    expect(store.inserts).toHaveLength(1);
    expect(store.inserts[0]).toMatchObject({ deliverable_id: "deliv-B" });
  });
});
