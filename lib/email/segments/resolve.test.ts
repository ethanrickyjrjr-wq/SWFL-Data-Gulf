// lib/email/segments/resolve.test.ts
import { describe, expect, it } from "bun:test";
import { resolveSegment } from "./resolve";
import type { Condition } from "./filter";

/** Minimal stub matching the subset of the Supabase client resolve.ts calls. */
function stubDb(opts: {
  contacts: {
    id: string;
    email: string;
    name: string | null;
    tags: string[];
    attribs: Record<string, string>;
  }[];
  events?: { contact_id: string | null; event: string; did: string | null }[];
}) {
  return {
    from(table: string) {
      if (table === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: opts.contacts, error: null }),
            }),
          }),
        };
      }
      if (table === "email_events") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                in: async () => ({ data: opts.events ?? [], error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe("resolveSegment", () => {
  it("resolves a tag-only filter without querying email_events", async () => {
    const db = stubDb({
      contacts: [{ id: "c1", email: "a@x.com", name: "A", tags: ["buyer"], attribs: {} }],
    });
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(out.map((c) => c.id)).toEqual(["c1"]);
  });

  it("resolves an engagement filter using the fetched email_events", async () => {
    const db = stubDb({
      contacts: [
        { id: "c1", email: "a@x.com", name: "A", tags: [], attribs: {} },
        { id: "c2", email: "b@x.com", name: "B", tags: [], attribs: {} },
      ],
      events: [{ contact_id: "c1", event: "opened", did: "d-1" }],
    });
    const filter: Condition = { field: "engagement", op: "opened", deliverable_id: "d-1" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(out.map((c) => c.id)).toEqual(["c1"]);
  });

  it("fails open (empty array, never throws) when the contacts query errors", async () => {
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: async () => ({ data: null, error: new Error("boom") }) }),
        }),
      }),
    };
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(out).toEqual([]);
  });

  it("never touches the email_events table when no engagement condition is present", async () => {
    // Proves the scoped-query property with evidence (self-review Q2): a
    // tag-only filter resolves from contacts alone. If resolveSegment
    // erroneously queried email_events, `from` throws and the await rejects,
    // reddening this test — so a green run is proof the query was skipped.
    let touchedEmailEvents = false;
    const db = {
      from(table: string) {
        if (table === "contacts") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [{ id: "c1", email: "a@x.com", name: "A", tags: ["buyer"], attribs: {} }],
                  error: null,
                }),
              }),
            }),
          };
        }
        touchedEmailEvents = true;
        throw new Error(`must not query ${table} for a tag-only filter`);
      },
    };
    const filter: Condition = { field: "tags", op: "has", value: "buyer" };
    const out = await resolveSegment(db as never, "u1", filter);
    expect(touchedEmailEvents).toBe(false);
    expect(out.map((c) => c.id)).toEqual(["c1"]);
  });
});
