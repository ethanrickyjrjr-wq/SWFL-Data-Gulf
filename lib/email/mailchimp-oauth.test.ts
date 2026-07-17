// lib/email/mailchimp-oauth.test.ts
// Coverage for the pure Mailchimp member -> ContactRow mapper (Task 6). The
// OAuth dance and the actual list/member fetches are thin network adapters
// covered by types, mirroring how lib/email/google-oauth.ts is covered (no
// google-oauth.test.ts exists either — only the pure mapper gets unit tests).
import { describe, expect, test } from "bun:test";
import { mailchimpMembersToContactRows, type MailchimpMember } from "./mailchimp-oauth";

function member(overrides: Partial<MailchimpMember> = {}): MailchimpMember {
  return {
    email_address: "a@example.com",
    status: "subscribed",
    merge_fields: {},
    ...overrides,
  };
}

describe("mailchimpMembersToContactRows", () => {
  test("maps email_address to email", () => {
    const rows = mailchimpMembersToContactRows([member({ email_address: "person@x.com" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("person@x.com");
  });

  test("joins FNAME + LNAME into name", () => {
    const rows = mailchimpMembersToContactRows([
      member({ merge_fields: { FNAME: "Jane", LNAME: "Doe" } }),
    ]);
    expect(rows[0].name).toBe("Jane Doe");
  });

  test("name is null when both FNAME and LNAME are empty", () => {
    const rows = mailchimpMembersToContactRows([member({ merge_fields: {} })]);
    expect(rows[0].name).toBeNull();
  });

  test("name uses whichever of FNAME/LNAME is present", () => {
    const rows = mailchimpMembersToContactRows([member({ merge_fields: { FNAME: "Jane" } })]);
    expect(rows[0].name).toBe("Jane");
  });

  test("status subscribed OMITS the unsubscribed key entirely", () => {
    const rows = mailchimpMembersToContactRows([member({ status: "subscribed" })]);
    expect(Object.prototype.hasOwnProperty.call(rows[0], "unsubscribed")).toBe(false);
  });

  test.each(["unsubscribed", "cleaned", "pending", "transactional", "archived"])(
    "status %s sets unsubscribed: true",
    (status) => {
      const rows = mailchimpMembersToContactRows([member({ status })]);
      expect(rows[0].unsubscribed).toBe(true);
    },
  );

  test('tags are always ["mailchimp"]', () => {
    const rows = mailchimpMembersToContactRows([member()]);
    expect(rows[0].tags).toEqual(["mailchimp"]);
  });

  test("missing email_address is skipped", () => {
    const rows = mailchimpMembersToContactRows([member({ email_address: undefined })]);
    expect(rows).toHaveLength(0);
  });

  test("blank/whitespace-only email_address is skipped", () => {
    const rows = mailchimpMembersToContactRows([member({ email_address: "   " })]);
    expect(rows).toHaveLength(0);
  });

  test("null email_address is skipped", () => {
    const rows = mailchimpMembersToContactRows([member({ email_address: null })]);
    expect(rows).toHaveLength(0);
  });

  test("malformed email_address (fails isValidEmail) is skipped", () => {
    const rows = mailchimpMembersToContactRows([member({ email_address: "not-an-email" })]);
    expect(rows).toHaveLength(0);
  });

  test("empty input returns empty output", () => {
    expect(mailchimpMembersToContactRows([])).toEqual([]);
  });

  test("same email on two audiences dedupes to one row", () => {
    const rows = mailchimpMembersToContactRows([
      member({ email_address: "dup@x.com", status: "subscribed" }),
      member({ email_address: "dup@x.com", status: "subscribed" }),
    ]);
    expect(rows).toHaveLength(1);
  });

  test("dedupe: an unsubscribed sighting on any audience wins over subscribed", () => {
    const rows = mailchimpMembersToContactRows([
      member({ email_address: "dup@x.com", status: "subscribed" }),
      member({ email_address: "dup@x.com", status: "unsubscribed" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].unsubscribed).toBe(true);
  });

  test("dedupe key is the EXACT email string (matches public.contacts' plain-text UNIQUE(user_id, email) — no citext/lower())", () => {
    // Different casing is NOT deduped: Postgres's own unique index treats
    // these as two distinct rows, so collapsing them here would be lossy,
    // not protective. See the mailchimpMembersToContactRows doc comment.
    const rows = mailchimpMembersToContactRows([
      member({ email_address: "Dup@X.com" }),
      member({ email_address: "dup@x.com" }),
    ]);
    expect(rows).toHaveLength(2);
  });

  test("dedupe: keeps the first non-empty name seen", () => {
    const rows = mailchimpMembersToContactRows([
      member({ email_address: "dup@x.com", merge_fields: {} }),
      member({ email_address: "dup@x.com", merge_fields: { FNAME: "Jane" } }),
    ]);
    expect(rows[0].name).toBe("Jane");
  });
});
