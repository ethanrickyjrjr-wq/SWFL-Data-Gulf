/**
 * Unit tests for processForwardEmail -- pure orchestration core, mocked deps.
 * TDD: covers unmatched-sender reply, export happy/partial/below-minimum,
 * campaign with about-text present/absent/duplicate, unknown, and the
 * ignored/gating paths.
 */
import { describe, test, expect, mock } from "bun:test";
import {
  processForwardEmail,
  type ForwardDeps,
  type ForwardEvent,
  type ForwardEmailBody,
} from "./forward-handler";
import { MIN_SWITCH_IMPORT } from "./activate";

function baseEvent(overrides: Partial<ForwardEvent["data"]> = {}): ForwardEvent {
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
    findUserIdByEmail: async () => "user_1",
    fetchBody: async () => baseBody(),
    fetchAttachmentText: async () => null,
    upsertContacts: async (_userId, rows) => ({ added: rows.length, error: null }),
    activatePass: async (_userId, proof) =>
      proof.contactsImported < MIN_SWITCH_IMPORT
        ? { activated: false, reason: "below_minimum" }
        : { activated: true },
    insertProfileFact: async () => "inserted",
    stashForward: async () => {},
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

describe("processForwardEmail — contact_export", () => {
  const CSV = ["Email,Name", "a@example.com,A One", "b@example.com,B Two"].join("\n");

  test("happy path: imports rows, activates pass, confirmation reply", async () => {
    // 25 valid rows so activatePass clears MIN_SWITCH_IMPORT.
    const rows = Array.from(
      { length: MIN_SWITCH_IMPORT },
      (_, i) => `u${i}@example.com,U ${i}`,
    ).join("\n");
    const csv = `Email,Name\n${rows}`;

    const sendReply = mock(async () => {});
    const activatePass = mock(async (_userId: string, _proof: { contactsImported: number }) => ({
      activated: true,
    }));

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => csv,
        activatePass,
        sendReply,
      }),
    );

    expect(outcome).toEqual({
      kind: "contact_export",
      added: MIN_SWITCH_IMPORT,
      skipped: 0,
      passActivated: true,
      passReason: undefined,
    });
    expect(activatePass).toHaveBeenCalledTimes(1);
    const [, proof] = activatePass.mock.calls[0];
    expect(proof.lane).toBe("forwarded_email");
    expect(proof.contactsImported).toBe(MIN_SWITCH_IMPORT);
    expect(sendReply).toHaveBeenCalledTimes(1);
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("60 days of Starter");
  });

  test("below MIN_SWITCH_IMPORT: no pass, reply says how many more are needed", async () => {
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => CSV,
      }),
    );

    expect(outcome.kind).toBe("contact_export");
    if (outcome.kind === "contact_export") {
      expect(outcome.added).toBe(2);
      expect(outcome.passActivated).toBe(false);
      expect(outcome.passReason).toBe("below_minimum");
    }
  });

  test("partial-import honesty: upsert error with added > 0 still activates the pass", async () => {
    const rows = Array.from(
      { length: MIN_SWITCH_IMPORT },
      (_, i) => `u${i}@example.com,U ${i}`,
    ).join("\n");
    const csv = `Email,Name\n${rows}`;
    const sendReply = mock(async () => {});
    const activatePass = mock(async () => ({ activated: true }));

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => csv,
        upsertContacts: async () => ({ added: 25, error: "batch 3 failed" }),
        activatePass,
        sendReply,
      }),
    );

    expect(outcome.kind).toBe("contact_export");
    if (outcome.kind === "contact_export") {
      expect(outcome.added).toBe(25);
      expect(outcome.passActivated).toBe(true);
    }
    expect(activatePass).toHaveBeenCalledTimes(1);
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("imported 25");
  });

  test("pure failure (added === 0, upsert error): no pass activation attempted", async () => {
    const activatePass = mock(async () => ({ activated: true }));
    const sendReply = mock(async () => {});

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => CSV,
        upsertContacts: async () => ({ added: 0, error: "db down" }),
        activatePass,
        sendReply,
      }),
    );

    expect(outcome).toEqual({
      kind: "contact_export",
      added: 0,
      skipped: 0,
      passActivated: false,
      passReason: "error",
    });
    expect(activatePass).not.toHaveBeenCalled();
    const [, , text] = sendReply.mock.calls[0];
    expect(text).toContain("nothing was saved");
  });

  test("unsubscribed_members_export.csv filename forces unsubscribed:true on every row", async () => {
    const csv = ["Email,Name", "gone@example.com,Gone Away"].join("\n");
    let upserted: unknown[] = [];

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
        upsertContacts: async (_userId, rows) => {
          upserted = rows;
          return { added: rows.length, error: null };
        },
      }),
    );

    expect(upserted).toHaveLength(1);
    expect((upserted[0] as { unsubscribed?: boolean }).unsubscribed).toBe(true);
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

    expect(outcome.kind).toBe("contact_export");
    if (outcome.kind === "contact_export") {
      expect(outcome.added).toBe(1);
      expect(outcome.skipped).toBe(1);
    }
  });

  test("XLSX-only attachment: logged note + polite CSV-preferred reply, no import attempted", async () => {
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

  test("attachment fetch failure is skipped, not thrown", async () => {
    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () =>
          baseBody({
            attachments: [{ id: "att_1", filename: "export.csv", contentType: "text/csv" }],
          }),
        fetchAttachmentText: async () => null,
      }),
    );
    expect(outcome.kind).toBe("contact_export");
    if (outcome.kind === "contact_export") {
      expect(outcome.added).toBe(0);
    }
  });
});

describe("processForwardEmail — campaign", () => {
  const CAMPAIGN_HTML =
    "<html><body><p>Latest listings here.</p><p>About Jane Smith — 15 years selling SWFL homes.</p></body></html>";

  test("about-text present: writes ONE agent_profile_facts row, stashes, acks", async () => {
    const insertProfileFact = mock(async () => "inserted" as const);
    const stashForward = mock(async () => {});
    const sendReply = mock(async () => {});

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ html: CAMPAIGN_HTML }),
        insertProfileFact,
        stashForward,
        sendReply,
      }),
    );

    expect(outcome).toEqual({ kind: "campaign", factWritten: true, factReason: "written" });
    expect(insertProfileFact).toHaveBeenCalledTimes(1);
    const [userId, value, messageId] = insertProfileFact.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(value).toContain("About Jane Smith");
    expect(messageId).toBe("email_1");
    expect(stashForward).toHaveBeenCalledTimes(1);
    const [, stashRow] = stashForward.mock.calls[0];
    expect(stashRow.html).toBe(CAMPAIGN_HTML);
    expect(stashRow.messageId).toBe("email_1");
    const [, , replyText] = sendReply.mock.calls[0];
    expect(replyText).toContain("rebuilding your campaign");
  });

  test("about-text absent: writes NOTHING, still stashes and acks", async () => {
    const insertProfileFact = mock(async () => "inserted" as const);
    const stashForward = mock(async () => {});

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ html: "<html><body><p>hi</p></body></html>" }),
        insertProfileFact,
        stashForward,
      }),
    );

    expect(outcome).toEqual({ kind: "campaign", factWritten: false, factReason: "absent" });
    expect(insertProfileFact).not.toHaveBeenCalled();
    expect(stashForward).toHaveBeenCalledTimes(1);
  });

  test("duplicate live fact (23505): skips write, logs, first forward wins", async () => {
    const insertProfileFact = mock(async () => "duplicate" as const);

    const outcome = await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ html: CAMPAIGN_HTML }),
        insertProfileFact,
      }),
    );

    expect(outcome).toEqual({ kind: "campaign", factWritten: false, factReason: "duplicate" });
    expect(insertProfileFact).toHaveBeenCalledTimes(1);
  });

  test("platform + sender domain are threaded into the stash row", async () => {
    const stashForward = mock(async () => {});
    const mailchimpHtml = `${CAMPAIGN_HTML} <a href="https://mailchimp.com/unsubscribe">unsub</a>`;

    await processForwardEmail(
      baseEvent(),
      makeDeps({
        fetchBody: async () => baseBody({ from: "agent@rival-esp.com", html: mailchimpHtml }),
        stashForward,
      }),
    );

    const [, stashRow] = stashForward.mock.calls[0];
    expect(stashRow.platform).toBe("mailchimp");
    expect(stashRow.senderDomain).toBe("rival-esp.com");
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
