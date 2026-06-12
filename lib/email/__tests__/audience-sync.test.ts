import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import type { Resend } from "resend";
import {
  enumerateAudiences,
  syncUserAudiences,
  type AudienceStore,
  type ContactRow,
  type AudienceRecord,
} from "../audience-sync.ts";

// ---------------------------------------------------------------------------
// enumerateAudiences — pure tag → audience grouping
// ---------------------------------------------------------------------------

describe("enumerateAudiences", () => {
  test("one audience per distinct tag; a multi-tag contact lands in each", () => {
    const contacts: ContactRow[] = [
      { email: "a@example.com", tags: ["newsletter", "vip"] },
      { email: "b@example.com", tags: ["newsletter"] },
    ];
    const groups = enumerateAudiences(contacts);
    assert.deepEqual(
      groups.map((g) => g.audience_slug),
      ["newsletter", "vip"], // sorted
    );
    const newsletter = groups.find((g) => g.audience_slug === "newsletter")!;
    assert.deepEqual(newsletter.emails, ["a@example.com", "b@example.com"]);
    const vip = groups.find((g) => g.audience_slug === "vip")!;
    assert.deepEqual(vip.emails, ["a@example.com"]);
  });

  test("tag-less contacts belong to NO audience (design decision: skip, no default 'all')", () => {
    const contacts: ContactRow[] = [
      { email: "tagged@example.com", tags: ["news"] },
      { email: "none@example.com", tags: [] },
      { email: "null@example.com", tags: null },
    ];
    const groups = enumerateAudiences(contacts);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].audience_slug, "news");
    assert.deepEqual(groups[0].emails, ["tagged@example.com"]);
  });

  test("normalizes tag + email case and de-duplicates emails within an audience", () => {
    const contacts: ContactRow[] = [
      { email: "DUP@Example.com", tags: ["VIP"] },
      { email: "dup@example.com", tags: ["vip"] },
      { email: " spaced@example.com ", tags: [" vip "] },
    ];
    const groups = enumerateAudiences(contacts);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].audience_slug, "vip");
    // DUP@Example.com and dup@example.com collapse to one entry.
    assert.deepEqual(groups[0].emails, ["dup@example.com", "spaced@example.com"]);
  });

  test("ignores blank/non-string tags and blank emails", () => {
    const contacts: ContactRow[] = [
      { email: "ok@example.com", tags: ["", "  ", "real"] },
      { email: "", tags: ["real"] },
      // a malformed tags entry that slipped past typing
      { email: "x@example.com", tags: [42 as unknown as string, "real"] },
    ];
    const groups = enumerateAudiences(contacts);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].audience_slug, "real");
    assert.deepEqual(groups[0].emails, ["ok@example.com", "x@example.com"]);
  });
});

// ---------------------------------------------------------------------------
// syncUserAudiences — orchestration over mocked Resend + store
// ---------------------------------------------------------------------------

/** Minimal Resend stub recording calls; only the methods C2 uses are real. */
function makeResendStub(opts?: { existingSegments?: { id: string; name: string }[] }): {
  resend: Resend;
  calls: {
    create: string[];
    getById: string[];
    addContacts: { email: string; segmentId: string }[];
  };
} {
  const existing = new Map((opts?.existingSegments ?? []).map((s) => [s.id, s]));
  const calls = {
    create: [] as string[],
    getById: [] as string[],
    addContacts: [] as { email: string; segmentId: string }[],
  };
  let nextId = 1;

  const resend = {
    segments: {
      async get(id: string) {
        calls.getById.push(id);
        const s = existing.get(id);
        return s
          ? {
              data: { id: s.id, name: s.name, created_at: "", object: "segment" },
              error: null,
              headers: null,
            }
          : {
              data: null,
              error: { message: "not found", name: "not_found", statusCode: 404 },
              headers: null,
            };
      },
      async list() {
        return {
          data: { object: "list", has_more: false, data: Array.from(existing.values()) },
          error: null,
          headers: null,
        };
      },
      async create({ name }: { name: string }) {
        calls.create.push(name);
        const id = `seg_${nextId++}`;
        existing.set(id, { id, name });
        return { data: { id, name, object: "segment" }, error: null, headers: null };
      },
    },
    contacts: {
      async create({ email, segments }: { email: string; segments?: { id: string }[] }) {
        const segmentId = segments?.[0]?.id ?? "";
        calls.addContacts.push({ email, segmentId });
        return { data: { id: `contact_${email}`, object: "contact" }, error: null, headers: null };
      },
    },
  } as unknown as Resend;

  return { resend, calls };
}

/** In-memory store stub. */
function makeStoreStub(opts: { contacts: ContactRow[]; audiences?: AudienceRecord[] }): {
  store: AudienceStore;
  upserts: { audience_slug: string; resend_audience_id: string; contact_count: number }[];
} {
  const upserts: { audience_slug: string; resend_audience_id: string; contact_count: number }[] =
    [];
  const store: AudienceStore = {
    async readContacts() {
      return opts.contacts;
    },
    async readAudiences() {
      return opts.audiences ?? [];
    },
    async upsertAudience(row) {
      upserts.push(row);
    },
  };
  return { store, upserts };
}

describe("syncUserAudiences", () => {
  test("creates a segment per tag, adds each contact, and upserts the row with live count", async () => {
    const { resend, calls } = makeResendStub();
    const { store, upserts } = makeStoreStub({
      contacts: [
        { email: "a@example.com", tags: ["newsletter", "vip"] },
        { email: "b@example.com", tags: ["newsletter"] },
      ],
    });

    const summary = await syncUserAudiences(resend, store);

    // Two segments created (newsletter, vip).
    assert.deepEqual(calls.create.sort(), ["newsletter", "vip"]);
    // 3 contact adds: a→newsletter, b→newsletter, a→vip.
    assert.equal(calls.addContacts.length, 3);
    // Audience rows upserted with the right counts.
    const newsletter = upserts.find((u) => u.audience_slug === "newsletter")!;
    assert.equal(newsletter.contact_count, 2);
    const vip = upserts.find((u) => u.audience_slug === "vip")!;
    assert.equal(vip.contact_count, 1);
    assert.equal(summary.total_audiences, 2);
    assert.equal(summary.total_contacts_synced, 3);
    assert.equal(summary.skipped_untagged, 0);
  });

  test("idempotent: reuses the cached resend_audience_id and creates NO new segment", async () => {
    const { resend, calls } = makeResendStub({
      existingSegments: [{ id: "seg_existing", name: "newsletter" }],
    });
    const { store } = makeStoreStub({
      contacts: [{ email: "a@example.com", tags: ["newsletter"] }],
      audiences: [{ audience_slug: "newsletter", resend_audience_id: "seg_existing" }],
    });

    const summary = await syncUserAudiences(resend, store);

    assert.deepEqual(calls.create, []); // no create
    assert.deepEqual(calls.getById, ["seg_existing"]); // verified the cached id
    assert.equal(summary.audiences[0].created, false);
    assert.equal(summary.audiences[0].resend_audience_id, "seg_existing");
  });

  test("stale cached id (deleted in Resend) falls back to name match, else create", async () => {
    // Cached id points at a segment that no longer exists; a same-named segment
    // also doesn't exist → must create a fresh one.
    const { resend, calls } = makeResendStub();
    const { store } = makeStoreStub({
      contacts: [{ email: "a@example.com", tags: ["news"] }],
      audiences: [{ audience_slug: "news", resend_audience_id: "seg_gone" }],
    });

    const summary = await syncUserAudiences(resend, store);

    assert.deepEqual(calls.getById, ["seg_gone"]); // tried the stale id
    assert.deepEqual(calls.create, ["news"]); // then created
    assert.equal(summary.audiences[0].created, true);
  });

  test("counts tag-less contacts as skipped without syncing them", async () => {
    const { resend } = makeResendStub();
    const { store } = makeStoreStub({
      contacts: [
        { email: "a@example.com", tags: ["news"] },
        { email: "b@example.com", tags: [] },
        { email: "c@example.com", tags: null },
      ],
    });

    const summary = await syncUserAudiences(resend, store);
    assert.equal(summary.total_audiences, 1);
    assert.equal(summary.skipped_untagged, 2);
  });
});
