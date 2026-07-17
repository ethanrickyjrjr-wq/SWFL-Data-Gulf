/**
 * Unit tests for processForwardEmail + applyForward (stash-then-confirm
 * redesign, 07/17/2026 security review). processForwardEmail now only ever
 * STASHES (never writes contacts/facts/passes); applyForward is the only
 * place a pending forward becomes a real write, gated on an authenticated
 * caller rather than a `From` header.
 */
import { describe, test, expect, mock } from "bun:test";
import {
  processForwardEmail,
  applyForward,
  shouldSuppressReply,
  MAX_ATTACHMENT_BYTES,
  MAX_STASH_ROWS,
  type ForwardDeps,
  type ForwardEvent,
  type ForwardEmailBody,
  type ApplyForwardDeps,
  type SwitchForwardRow,
} from "./forward-handler";
import type { ContactRow } from "@/lib/contacts/types";

const OUR_DOMAINS = ["reply.swfldatagulf.com", "swfldatagulf.com"];
const SITE_URL = "https://www.swfldatagulf.com";

function baseEvent(overrides: Partial<NonNullable<ForwardEvent["data"]>> = {}): ForwardEvent {
  return {
    type: "email.received",
    data: {
      email_id: "email_1",
      from: "agent@example.com",
      to: ["switch@r.swfldatagulf.com"],
      subject: "Fwd: contacts",
      ...overrides,
    },
  };
}

function baseBody(overrides: Partial<ForwardEmailBody> = {}): ForwardEmailBody {
  return {
    from: "agent@example.com",
    html: null,
    text: "",
    headers: {},
    attachments: [],
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ForwardDeps> = {}): ForwardDeps {
  return {
    log: () => {},
    ourDomains: OUR_DOMAINS,
    siteUrl: SITE_URL,
    findUserIdByEmail: async () => "user_1",
    fetchBody: async () => baseBody(),
    fetchAttachmentText: async () => null,
    stashForward: async () => "inserted",
    sendReply: async () => {},
    ...overrides,
  };
}

describe("processForwardEmail — gating", () => {
  test("non email.received event is ignored", async () => {
    const outcome = await processForwardEmail({ type: "email.sent" }, makeDeps());
    expect(outcome).toEqual({ kind: "ignored", reason: "unhandled_event:email.sent" });
  });

  test("not addressed to switch@ is ignored", async () => {
    const outcome = await processForwardEmail(
      baseEvent({ to: ["hello@r.swfldatagulf.com"] }),
      makeDeps(),
    );
    expect(outcome).toEqual({ kind: "ignored", reason: "not_switch_address" });
  });

  test("missing email_id is ignored", async () => {
    const outcome = await processForwardEmail(baseEvent({ email_id: undefined }), makeDeps());
    expect(outcome).toEqual({ kind: "ignored", reason: "missing_email_id" });
  });
});

describe("processForwardEmail — unmatched sender", () => {
  test("no account match sends a polite bounce and acks", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({ findUserIdByEmail: async () => null, sendReply }),
    );
    expect(outcome).toEqual({ kind: "unmatched_sender" });
    expect(sendReply).toHaveBeenCalledTimes(1);
    const [to, , text] = sendReply.mock.calls[0];
    expect(to).toBe("agent@example.com");
    expect(text).toContain("couldn't match this email");
  });
});

describe("processForwardEmail — reply-loop / backscatter guard (Minor f)", () => {
  test("shouldSuppressReply: mailer-daemon/postmaster/no-reply/bounce local parts", () => {
    for (const local of ["mailer-daemon", "postmaster", "no-reply", "noreply", "bounce"]) {
      expect(shouldSuppressReply({}, `${local}@somewhere.com`, [])).toBe(true);
    }
    expect(shouldSuppressReply({}, "jane@somewhere.com", [])).toBe(false);
  });

  test("shouldSuppressReply: Auto-Submitted present and not 'no'", () => {
    expect(shouldSuppressReply({ "Auto-Submitted": "auto-replied" }, "jane@x.com", [])).toBe(true);
    expect(shouldSuppressReply({ "Auto-Submitted": "no" }, "jane@x.com", [])).toBe(false);
  });

  test("shouldSuppressReply: Precedence bulk/junk/list", () => {
    for (const p of ["bulk", "junk", "list"]) {
      expect(shouldSuppressReply({ Precedence: p }, "jane@x.com", [])).toBe(true);
    }
  });

  test("shouldSuppressReply: sender domain is one of ours", () => {
    expect(shouldSuppressReply({}, "someone@reply.swfldatagulf.com", OUR_DOMAINS)).toBe(true);
    expect(shouldSuppressReply({}, "someone@swfldatagulf.com", OUR_DOMAINS)).toBe(true);
    expect(shouldSuppressReply({}, "someone@rival.com", OUR_DOMAINS)).toBe(false);
  });

  test("processForwardEmail suppresses the unmatched-sender reply for a mailer-daemon From", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(
      baseEvent({ from: "mailer-daemon@somewhere.com" }),
      makeDeps({
        findUserIdByEmail: async () => null,
        fetchBody: async () => baseBody({ from: "mailer-daemon@somewhere.com" }),
        sendReply,
      }),
    );
    expect(outcome).toEqual({ kind: "unmatched_sender" });
    expect(sendReply).not.toHaveBeenCalled();
  });

  test("processForwardEmail suppresses the reply when Auto-Submitted is present", async () => {
    const sendReply = mock(async () => {});
    await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ headers: { "Auto-Submitted": "auto-generated" } }),
        sendReply,
      }),
    );
    expect(sendReply).not.toHaveBeenCalled();
  });
});

describe("processForwardEmail — contact_export (stash-then-confirm)", () => {
  const CSV = ["Email,Name", "a@example.com,A One", "b@example.com,B Two"].join("\n");

  test("happy path: stashes (never upserts), confirmation reply points at sign-in + Apply", async () => {
    const sendReply = mock(async () => {});
    const stashForward = mock(async () => "inserted" as const);

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => CSV,
        stashForward,
        sendReply,
      }),
    );

    expect(outcome).toEqual({ kind: "contact_export", stashed: true, rowCount: 2, skipped: 0 });
    expect(stashForward).toHaveBeenCalledTimes(1);
    const [userId, row] = stashForward.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(row.kind).toBe("contact_export");
    expect(row.html).toBe("");
    expect((row.payload as { rows: ContactRow[] }).rows).toHaveLength(2);
    expect(sendReply).toHaveBeenCalledTimes(1);
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain(`${SITE_URL}/contacts/upload`);
    expect(text).toContain("Apply");
  });

  test("stashed payload carries rows/skipped/platform, ready for the apply route", async () => {
    let stashedPayload: unknown;
    await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => CSV,
        stashForward: async (_userId, row) => {
          stashedPayload = row.payload;
          return "inserted";
        },
      }),
    );
    const payload = stashedPayload as {
      rows: ContactRow[];
      skipped: number;
      platform: string | null;
    };
    expect(payload.rows.map((r) => r.email)).toEqual(["a@example.com", "b@example.com"]);
    expect(payload.skipped).toBe(0);
  });

  test("the row cap constant is 5000 (documented ceiling, visible diff if changed)", () => {
    expect(MAX_STASH_ROWS).toBe(5000);
  });

  test("invalid emails are skipped and counted", async () => {
    const csv = ["Email,Name", "not-an-email,Bad Row", "good@example.com,Good Row"].join("\n");
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => csv,
      }),
    );
    expect(outcome).toEqual({ kind: "contact_export", stashed: true, rowCount: 1, skipped: 1 });
  });

  test("unsubscribed_members_export.csv filename forces unsubscribed:true on every stashed row", async () => {
    const csv = ["Email,Name", "gone@example.com,Gone Away"].join("\n");
    let stashedRows: ContactRow[] = [];

    await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [
              { id: "att_1", filename: "unsubscribed_members_export.csv", contentType: "text/csv" },
            ],
          }),
        fetchAttachmentText: async () => csv,
        stashForward: async (_userId, row) => {
          stashedRows = (row.payload as { rows: ContactRow[] }).rows;
          return "inserted";
        },
      }),
    );

    expect(stashedRows).toHaveLength(1);
    expect(stashedRows[0].unsubscribed).toBe(true);
  });

  test("XLSX-only attachment: logged note + polite CSV-preferred reply, no fetch attempted", async () => {
    const sendReply = mock(async () => {});
    const fetchAttachmentText = mock(async () => "should not be called");

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [
              {
                id: "att_1",
                filename: "export.xlsx",
                contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              },
            ],
          }),
        fetchAttachmentText,
        sendReply,
      }),
    );

    expect(outcome).toEqual({ kind: "export_no_csv" });
    expect(fetchAttachmentText).not.toHaveBeenCalled();
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("CSV");
  });

  test("oversized attachment (size over MAX_ATTACHMENT_BYTES) is declined without fetching it", async () => {
    const sendReply = mock(async () => {});
    const fetchAttachmentText = mock(async () => "should not be called");

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [
              {
                id: "att_1",
                filename: "huge.csv",
                contentType: "text/csv",
                size: MAX_ATTACHMENT_BYTES + 1,
              },
            ],
          }),
        fetchAttachmentText,
        sendReply,
      }),
    );

    expect(outcome).toEqual({ kind: "export_too_large" });
    expect(fetchAttachmentText).not.toHaveBeenCalled();
    const [, , text] = sendReply.mock.calls[0];
    expect(text.toLowerCase()).toContain("large");
  });

  test("attachment at or under the size cap is still fetched normally", async () => {
    const fetchAttachmentText = mock(async () => CSV);
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [
              {
                id: "att_1",
                filename: "export.csv",
                contentType: "text/csv",
                size: MAX_ATTACHMENT_BYTES,
              },
            ],
          }),
        fetchAttachmentText,
      }),
    );
    expect(fetchAttachmentText).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "contact_export", stashed: true, rowCount: 2, skipped: 0 });
  });

  test("attachment fetch failure is skipped, not thrown; no valid contacts found reply sent", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => null,
        sendReply,
      }),
    );
    expect(outcome).toEqual({ kind: "contact_export", stashed: false, rowCount: 0, skipped: 0 });
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("didn't find any valid contacts");
  });

  test("duplicate message_id (Svix redelivery, 23505) skips the reply", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => CSV,
        stashForward: async () => "duplicate",
        sendReply,
      }),
    );
    expect(outcome).toEqual({
      kind: "contact_export",
      stashed: false,
      rowCount: 2,
      skipped: 0,
      duplicate: true,
    });
    expect(sendReply).not.toHaveBeenCalled();
  });

  test("stash write error: apologetic reply, not the success message", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => CSV,
        stashForward: async () => "error",
        sendReply,
      }),
    );
    expect(outcome).toEqual({ kind: "contact_export", stashed: false, rowCount: 2, skipped: 0 });
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("problem");
  });
});

describe("processForwardEmail — campaign (stash-then-confirm)", () => {
  const CAMPAIGN_HTML =
    "<html><body><p>Latest listings here.</p><p>About Jane Smith — 15 years selling SWFL homes.</p></body></html>";

  test("stashes the about-text + platform + domain, never writes agent_profile_facts directly", async () => {
    const stashForward = mock(async () => "inserted" as const);
    const sendReply = mock(async () => {});
    const mailchimpHtml = `${CAMPAIGN_HTML} <a href="https://mailchimp.com/unsubscribe">unsub</a>`;

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ from: "agent@rival-esp.com", html: mailchimpHtml }),
        stashForward,
        sendReply,
      }),
    );

    expect(outcome).toEqual({ kind: "campaign", stashed: true });
    expect(stashForward).toHaveBeenCalledTimes(1);
    const [userId, row] = stashForward.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(row.kind).toBe("campaign");
    expect(row.platform).toBe("mailchimp");
    expect(row.senderDomain).toBe("rival-esp.com");
    expect(row.html).toBe(mailchimpHtml);
    const payload = row.payload as { about: string | null; platform: string | null };
    expect(payload.about).toContain("About Jane Smith");
    expect(payload.platform).toBe("mailchimp");
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("sign in to apply");
  });

  test("about-text absent: payload.about is null, still stashes", async () => {
    const stashForward = mock(async () => "inserted" as const);
    await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ html: "<html><body><p>hi</p></body></html>" }),
        stashForward,
      }),
    );
    const [, row] = stashForward.mock.calls[0];
    expect((row.payload as { about: string | null }).about).toBeNull();
  });

  test("html tail is capped at MAX_FORWARD_HTML", async () => {
    const { MAX_FORWARD_HTML } = await import("./forward-inbound");
    const huge = "x".repeat(MAX_FORWARD_HTML + 1000);
    const stashForward = mock(async () => "inserted" as const);
    await processForwardEmail(
      baseEvent(),
      makeDeps({ fetchBody: async () => baseBody({ html: huge }), stashForward }),
    );
    const [, row] = stashForward.mock.calls[0];
    expect(row.html.length).toBe(MAX_FORWARD_HTML);
    expect(row.html).toBe(huge.slice(-MAX_FORWARD_HTML));
  });

  test("duplicate message_id skips the reply", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ html: CAMPAIGN_HTML }),
        stashForward: async () => "duplicate",
        sendReply,
      }),
    );
    expect(outcome).toEqual({ kind: "campaign", stashed: false, duplicate: true });
    expect(sendReply).not.toHaveBeenCalled();
  });
});

describe("processForwardEmail — unknown", () => {
  test("no attachments, no html: polite reply listing what we accept", async () => {
    const sendReply = mock(async () => {});
    const outcome = await processForwardEmail(baseEvent(), makeDeps({ sendReply }));
    expect(outcome).toEqual({ kind: "unknown" });
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("campaign email");
    expect(text).toContain("contact-export");
  });
});

// ── applyForward: the authenticated write path ──────────────────────────────

function makeForwardRow(overrides: Partial<SwitchForwardRow> = {}): SwitchForwardRow {
  return {
    id: "fwd_1",
    userId: "user_1",
    kind: "contact_export",
    status: "pending",
    messageId: "email_1",
    payload: { rows: [], skipped: 0, platform: "mailchimp" },
    ...overrides,
  };
}

function makeApplyDeps(overrides: Partial<ApplyForwardDeps> = {}): ApplyForwardDeps {
  return {
    log: () => {},
    loadForward: async () => makeForwardRow(),
    markApplied: async () => {},
    markDismissed: async () => {},
    upsertContacts: async (_userId, rows) => ({ added: rows.length, error: null }),
    activatePass: async () => ({ activated: true }),
    insertProfileFact: async () => "inserted",
    ...overrides,
  };
}

describe("applyForward — ownership + status gate", () => {
  test("no such row: not_found/no_row, nothing written", async () => {
    const upsertContacts = mock(async () => ({ added: 0, error: null }));
    const outcome = await applyForward(
      "missing",
      "user_1",
      false,
      makeApplyDeps({ loadForward: async () => null, upsertContacts }),
    );
    expect(outcome).toEqual({ kind: "not_found", reason: "no_row" });
    expect(upsertContacts).not.toHaveBeenCalled();
  });

  test("row belongs to a different user: not_found/not_yours, nothing written", async () => {
    const upsertContacts = mock(async () => ({ added: 0, error: null }));
    const outcome = await applyForward(
      "fwd_1",
      "attacker",
      false,
      makeApplyDeps({
        loadForward: async () => makeForwardRow({ userId: "victim" }),
        upsertContacts,
      }),
    );
    expect(outcome).toEqual({ kind: "not_found", reason: "not_yours" });
    expect(upsertContacts).not.toHaveBeenCalled();
  });

  test("row already applied: not_found/not_pending, nothing written again", async () => {
    const markApplied = mock(async () => {});
    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () => makeForwardRow({ status: "applied" }),
        markApplied,
      }),
    );
    expect(outcome).toEqual({ kind: "not_found", reason: "not_pending" });
    expect(markApplied).not.toHaveBeenCalled();
  });

  test("dismissed row can't be re-applied either", async () => {
    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({ loadForward: async () => makeForwardRow({ status: "dismissed" }) }),
    );
    expect(outcome).toEqual({ kind: "not_found", reason: "not_pending" });
  });
});

describe("applyForward — dismiss", () => {
  test("dismiss:true marks the row dismissed and writes nothing else", async () => {
    const markDismissed = mock(async () => {});
    const upsertContacts = mock(async () => ({ added: 0, error: null }));
    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      true,
      makeApplyDeps({ markDismissed, upsertContacts }),
    );
    expect(outcome).toEqual({ kind: "dismissed" });
    expect(markDismissed).toHaveBeenCalledTimes(1);
    expect(upsertContacts).not.toHaveBeenCalled();
  });
});

describe("applyForward — contact_export", () => {
  const rows: ContactRow[] = [
    { name: "A", email: "a@example.com", phone: null, tags: [], attribs: {} },
    { name: "B", email: "b@example.com", phone: null, tags: [], attribs: {} },
  ];

  test("happy path: upserts, activates the pass, marks applied", async () => {
    const upsertContacts = mock(async (_userId: string, r: ContactRow[]) => ({
      added: r.length,
      error: null,
    }));
    const activatePass = mock(async () => ({ activated: true }));
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({ payload: { rows, skipped: 0, platform: "mailchimp" } }),
        upsertContacts,
        activatePass,
        markApplied,
      }),
    );

    expect(outcome).toEqual({
      kind: "applied_contact_export",
      added: 2,
      skipped: 0,
      passActivated: true,
      passReason: undefined,
      partial: false,
    });
    expect(activatePass).toHaveBeenCalledTimes(1);
    const [userId, proof] = activatePass.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(proof.lane).toBe("forwarded_email");
    expect(proof.platform).toBe("mailchimp");
    expect(proof.contactsImported).toBe(2);
    expect(markApplied).toHaveBeenCalledTimes(1);
  });

  test("partial-import honesty: upsert error with added > 0 still activates and marks applied", async () => {
    const activatePass = mock(async () => ({ activated: true }));
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({ payload: { rows, skipped: 0, platform: "mailchimp" } }),
        upsertContacts: async () => ({ added: 1, error: "batch 2 failed" }),
        activatePass,
        markApplied,
      }),
    );

    expect(outcome).toEqual({
      kind: "applied_contact_export",
      added: 1,
      skipped: 0,
      passActivated: true,
      passReason: undefined,
      partial: true,
    });
    expect(activatePass).toHaveBeenCalledTimes(1);
    expect(markApplied).toHaveBeenCalledTimes(1);
  });

  test("pure failure (added === 0, upsert error): apply_failed, row stays pending", async () => {
    const activatePass = mock(async () => ({ activated: true }));
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({ payload: { rows, skipped: 0, platform: "mailchimp" } }),
        upsertContacts: async () => ({ added: 0, error: "db down" }),
        activatePass,
        markApplied,
      }),
    );

    expect(outcome).toEqual({ kind: "apply_failed", reason: "db down" });
    expect(activatePass).not.toHaveBeenCalled();
    expect(markApplied).not.toHaveBeenCalled();
  });

  test("below MIN_SWITCH_IMPORT: activatePass's own gate reports below_minimum, row still marked applied", async () => {
    const activatePass = mock(async (_userId: string, _proof: { contactsImported: number }) => ({
      activated: false,
      reason: "below_minimum",
    }));
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({ payload: { rows, skipped: 0, platform: "mailchimp" } }),
        activatePass,
        markApplied,
      }),
    );

    expect(outcome.kind).toBe("applied_contact_export");
    if (outcome.kind === "applied_contact_export") {
      expect(outcome.passActivated).toBe(false);
      expect(outcome.passReason).toBe("below_minimum");
    }
    expect(markApplied).toHaveBeenCalledTimes(1);
  });
});

describe("applyForward — campaign", () => {
  test("about present: writes ONE agent_profile_facts row, marks applied", async () => {
    const insertProfileFact = mock(async () => "inserted" as const);
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({
            kind: "campaign",
            payload: {
              about: "About Jane Smith.",
              platform: "mailchimp",
              senderDomain: "rival.com",
            },
          }),
        insertProfileFact,
        markApplied,
      }),
    );

    expect(outcome).toEqual({ kind: "applied_campaign", factWritten: true });
    expect(insertProfileFact).toHaveBeenCalledTimes(1);
    const [userId, value, messageId] = insertProfileFact.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(value).toBe("About Jane Smith.");
    expect(messageId).toBe("email_1");
    expect(markApplied).toHaveBeenCalledTimes(1);
  });

  test("about absent: writes nothing, still marks applied", async () => {
    const insertProfileFact = mock(async () => "inserted" as const);
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({
            kind: "campaign",
            payload: { about: null, platform: null, senderDomain: null },
          }),
        insertProfileFact,
        markApplied,
      }),
    );

    expect(outcome).toEqual({ kind: "applied_campaign", factWritten: false });
    expect(insertProfileFact).not.toHaveBeenCalled();
    expect(markApplied).toHaveBeenCalledTimes(1);
  });

  test("duplicate live fact (23505): first forward wins, still marks applied", async () => {
    const insertProfileFact = mock(async () => "duplicate" as const);
    const markApplied = mock(async () => {});

    const outcome = await applyForward(
      "fwd_1",
      "user_1",
      false,
      makeApplyDeps({
        loadForward: async () =>
          makeForwardRow({
            kind: "campaign",
            payload: { about: "About Jane.", platform: null, senderDomain: null },
          }),
        insertProfileFact,
        markApplied,
      }),
    );

    expect(outcome).toEqual({ kind: "applied_campaign", factWritten: false });
    expect(markApplied).toHaveBeenCalledTimes(1);
  });
});
