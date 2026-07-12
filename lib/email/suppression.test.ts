// lib/email/suppression.test.ts
//
// The suppression authority's pure core: given the blast candidates and the
// rows the four ledgers hold for them, decide who must NOT be sent to.
// Spec: docs/superpowers/specs/2026-07-12-send-safety-floor-design.md

import { describe, expect, it } from "bun:test";
import { decideSuppressions, type SuppressionLedgers } from "./suppression";

const EMPTY: SuppressionLedgers = {
  blastEvents: [],
  outreach: [],
  weeklyRead: [],
  subscribers: [],
};

const alice = { id: "c-alice", email: "alice@example.com" };
const bob = { id: "c-bob", email: "bob@example.com" };

describe("decideSuppressions — blast event history (email_events)", () => {
  it("a bounced event suppresses that contact (hard bounce — Resend's bounced is permanent-only)", () => {
    const out = decideSuppressions([alice, bob], {
      ...EMPTY,
      blastEvents: [{ contact_id: "c-alice", event: "bounced" }],
    });
    expect(out.get("c-alice")).toBe("bounced");
    expect(out.has("c-bob")).toBe(false);
  });

  it("a complained event suppresses that contact", () => {
    const out = decideSuppressions([alice], {
      ...EMPTY,
      blastEvents: [{ contact_id: "c-alice", event: "complained" }],
    });
    expect(out.get("c-alice")).toBe("complained");
  });

  it("engagement events (delivered/opened/clicked/sent) never suppress", () => {
    const out = decideSuppressions([alice], {
      ...EMPTY,
      blastEvents: [
        { contact_id: "c-alice", event: "delivered" },
        { contact_id: "c-alice", event: "opened" },
        { contact_id: "c-alice", event: "clicked" },
        { contact_id: "c-alice", event: "sent" },
      ],
    });
    expect(out.size).toBe(0);
  });

  it("rows with null contact_id (pre-cid-tag sends) are ignored", () => {
    const out = decideSuppressions([alice], {
      ...EMPTY,
      blastEvents: [{ contact_id: null, event: "bounced" }],
    });
    expect(out.size).toBe(0);
  });
});

describe("decideSuppressions — cross-ledger by email", () => {
  it("outreach bounced/unsubscribed suppress; engaged (a click — positive signal) does not", () => {
    const carol = { id: "c-carol", email: "carol@example.com" };
    const out = decideSuppressions([alice, bob, carol], {
      ...EMPTY,
      outreach: [
        { email: "alice@example.com", status: "bounced" },
        { email: "bob@example.com", status: "unsubscribed" },
        { email: "carol@example.com", status: "engaged" },
      ],
    });
    expect(out.get("c-alice")).toBe("bounced");
    expect(out.get("c-bob")).toBe("unsubscribed");
    expect(out.has("c-carol")).toBe(false);
  });

  it("weekly-read bounced/unsubscribed suppress; active does not", () => {
    const out = decideSuppressions([alice, bob], {
      ...EMPTY,
      weeklyRead: [
        { email: "alice@example.com", status: "unsubscribed" },
        { email: "bob@example.com", status: "active" },
      ],
    });
    expect(out.get("c-alice")).toBe("unsubscribed");
    expect(out.has("c-bob")).toBe(false);
  });

  it("email_subscribers bounced/complained/unsubscribed suppress; active does not", () => {
    const dave = { id: "c-dave", email: "dave@example.com" };
    const out = decideSuppressions([alice, bob, dave], {
      ...EMPTY,
      subscribers: [
        { email: "alice@example.com", status: "unsubscribed" },
        { email: "bob@example.com", status: "complained" },
        { email: "dave@example.com", status: "active" },
      ],
    });
    expect(out.get("c-alice")).toBe("unsubscribed");
    expect(out.get("c-bob")).toBe("complained");
    expect(out.has("c-dave")).toBe(false);
  });

  it("email matching is case- and whitespace-insensitive on both sides", () => {
    const mixed = { id: "c-mixed", email: "Alice@Example.COM" };
    const out = decideSuppressions([mixed], {
      ...EMPTY,
      outreach: [{ email: " alice@example.com ", status: "bounced" }],
    });
    expect(out.get("c-mixed")).toBe("bounced");
  });
});

describe("decideSuppressions — reporting", () => {
  it("reason precedence: complained > bounced > unsubscribed", () => {
    const out = decideSuppressions([alice], {
      ...EMPTY,
      blastEvents: [{ contact_id: "c-alice", event: "bounced" }],
      weeklyRead: [{ email: "alice@example.com", status: "unsubscribed" }],
      subscribers: [{ email: "alice@example.com", status: "complained" }],
    });
    expect(out.get("c-alice")).toBe("complained");
  });

  it("contacts with no ledger rows are absent from the map (sendable)", () => {
    const out = decideSuppressions([alice, bob], EMPTY);
    expect(out.size).toBe(0);
  });
});
