import { describe, expect, test } from "bun:test";
import { normalizeCompetitorCsv } from "./export-columns";
import { parseContactsCsv } from "@/lib/email/parse-contacts-csv";

describe("normalizeCompetitorCsv", () => {
  // Real-shaped Mailchimp header row. Verified live 07/16/2026 against
  // https://mailchimp.com/help/view-export-contacts/ ("About your export
  // file"): MEMBER_RATING and OPTIN_TIME are real, verbatim Mailchimp
  // export column names. "First Name"/"Last Name" are confirmed as the
  // default audience field labels ("By default, new audiences include
  // text fields to collect first and last names" --
  // https://mailchimp.com/help/manage-audience-signup-form-fields/).
  test("Mailchimp export: Email Address + First/Last Name merge, MEMBER_RATING/OPTIN_TIME pass through", () => {
    const csv = [
      "Email Address,First Name,Last Name,MEMBER_RATING,OPTIN_TIME",
      "jane@example.com,Jane,Smith,5,2026-01-02 03:04:05",
    ].join("\n");

    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("jane@example.com");
    expect(rows[0].name).toBe("Jane Smith");
    expect(rows[0].attribs?.member_rating).toBe("5");
    expect(rows[0].attribs?.optin_time).toBe("2026-01-02 03:04:05");
  });

  // Constant Contact field vocabulary verified live 07/16/2026 against the
  // developer API doc (https://developer.constantcontact.com/api_guide/export_contacts.html
  // -- snake_case email_address/first_name/last_name/status, enum
  // active/unsubscribed/removed) and the product export article
  // (https://knowledgebase.constantcontact.com/.../37424-Select-contact-lists-to-export-into-a-spreadsheet
  // -- confirms the UI export lets a user choose these fields). No public
  // sample file exists to lift a literal header row verbatim, so this
  // fixture Title-Cases the vendor-confirmed field vocabulary -- flagged
  // in the module header as reconstructed, not screenshot-verified.
  test("Constant Contact export: Email status=unsubscribed marks the row opted out", () => {
    const csv = [
      "Email address,First name,Last name,Email status",
      "active@example.com,Ann,Active,active",
      "gone@example.com,Bob,Gone,unsubscribed",
    ].join("\n");

    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);

    expect(rows).toHaveLength(2);
    const active = rows.find((r) => r.email === "active@example.com")!;
    const gone = rows.find((r) => r.email === "gone@example.com")!;
    expect(active.attribs?.switch_unsubscribed).toBeUndefined();
    expect(gone.attribs?.switch_unsubscribed).toBe("true");
    expect(gone.name).toBe("Bob Gone");
  });

  test("Mailchimp 'cleaned' status also marks opted out", () => {
    const csv = ["Email,Status", "hard@example.com,cleaned"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].attribs?.switch_unsubscribed).toBe("true");
  });

  test("generic header: Full Name + Email, no first/last split", () => {
    const csv = ["Full Name,Email", "Carlos Ruiz,carlos@example.com"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].name).toBe("Carlos Ruiz");
    expect(rows[0].email).toBe("carlos@example.com");
  });

  test("bare Name header (not Full Name) also maps to name", () => {
    const csv = ["Name,Email", "Dee Park,dee@example.com"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].name).toBe("Dee Park");
  });

  test("E-mail header variant maps to email", () => {
    const csv = ["E-mail,Name", "x@example.com,X Y"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].email).toBe("x@example.com");
  });

  test("UNSUB_TIME: non-empty value marks the row opted out; empty does not", () => {
    const csv = [
      "Email,UNSUB_TIME",
      "left@example.com,2026-05-01 10:00:00",
      "stayed@example.com,",
    ].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    const left = rows.find((r) => r.email === "left@example.com")!;
    const stayed = rows.find((r) => r.email === "stayed@example.com")!;
    expect(left.attribs?.switch_unsubscribed).toBe("true");
    expect(stayed.attribs?.switch_unsubscribed).toBeUndefined();
  });

  test("Opted Out: truthy values (yes/true/1) mark opted out; no/blank do not", () => {
    const csv = ["Email,Opted Out", "a@example.com,Yes", "b@example.com,No", "c@example.com,"].join(
      "\n",
    );
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows.find((r) => r.email === "a@example.com")!.attribs?.switch_unsubscribed).toBe(
      "true",
    );
    expect(
      rows.find((r) => r.email === "b@example.com")!.attribs?.switch_unsubscribed,
    ).toBeUndefined();
    expect(
      rows.find((r) => r.email === "c@example.com")!.attribs?.switch_unsubscribed,
    ).toBeUndefined();
  });

  test("no signal column present: no switch_unsubscribed key ever appears", () => {
    const csv = ["Email,Name,MEMBER_RATING", "clean@example.com,Clean Row,3"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].attribs?.switch_unsubscribed).toBeUndefined();
    expect(Object.keys(rows[0].attribs ?? {})).not.toContain("switch_unsubscribed");
  });

  test("quoted field with an embedded comma survives the round trip", () => {
    const csv = ["Email,Name", 'jr@example.com,"Smith, Jr."'].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Smith, Jr.");
  });

  test("case-insensitive header matching (EMAIL ADDRESS uppercase)", () => {
    const csv = ["EMAIL ADDRESS,FIRST NAME,LAST NAME", "u@example.com,Upper,Case"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].email).toBe("u@example.com");
    expect(rows[0].name).toBe("Upper Case");
  });

  test("lone First Name without Last Name is left un-merged (passthrough, documented edge case)", () => {
    const csv = ["Email,First Name", "solo@example.com,Solo"].join("\n");
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows[0].email).toBe("solo@example.com");
    expect(rows[0].name).toBeNull();
    expect(rows[0].attribs?.["first name"]).toBe("Solo");
  });

  test("empty input returns the input unchanged", () => {
    expect(normalizeCompetitorCsv("")).toBe("");
  });

  test("header-only CSV (no data rows) still normalizes the header", () => {
    const csv = "Email Address,First Name,Last Name";
    const out = normalizeCompetitorCsv(csv);
    const { rows } = parseContactsCsv(out);
    expect(rows).toHaveLength(0);
  });
});
