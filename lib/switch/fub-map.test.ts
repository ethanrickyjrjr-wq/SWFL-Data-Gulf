// lib/switch/fub-map.test.ts
// Coverage for the pure Follow Up Boss Person -> ContactRow mapper (Task 7).
// The Basic-auth paged fetch (fetchAllFubPeople) is a thin network adapter,
// mirroring how lib/email/mailchimp-oauth.ts's fetchAllMembers is covered
// (no dedicated test file for the network shell — only the pure mapper gets
// unit tests).
import { describe, expect, test } from "bun:test";
import { fubPeopleToContactRows, type FubPerson } from "./fub-map";

function person(overrides: Partial<FubPerson> = {}): FubPerson {
  return {
    id: 1,
    name: "Tom Minch",
    firstName: "Tom",
    lastName: "Minch",
    emails: [{ value: "tom.minch@example.com", type: "home", isPrimary: 1, status: "Valid" }],
    phones: [{ value: "555-555-1234", type: "home", status: "Invalid" }],
    ...overrides,
  };
}

describe("fubPeopleToContactRows", () => {
  test("maps the primary (isPrimary) email when present", () => {
    const { rows } = fubPeopleToContactRows([
      person({
        emails: [
          { value: "secondary@example.com", isPrimary: 0 },
          { value: "primary@example.com", isPrimary: 1 },
        ],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("primary@example.com");
  });

  test("maps the primary email when isPrimary is a real boolean (not just numeric 1)", () => {
    const { rows } = fubPeopleToContactRows([
      person({
        emails: [
          { value: "secondary@example.com", isPrimary: false },
          { value: "primary@example.com", isPrimary: true },
        ],
      }),
    ]);
    expect(rows[0].email).toBe("primary@example.com");
  });

  test("falls back to emails[0] when no email is flagged isPrimary", () => {
    const { rows } = fubPeopleToContactRows([
      person({
        emails: [{ value: "first@example.com" }, { value: "second@example.com" }],
      }),
    ]);
    expect(rows[0].email).toBe("first@example.com");
  });

  test("uses the combined name field directly", () => {
    const { rows } = fubPeopleToContactRows([
      person({ name: "Jane Doe", firstName: "Jane", lastName: "Doe" }),
    ]);
    expect(rows[0].name).toBe("Jane Doe");
  });

  test("falls back to firstName+lastName join when name is blank", () => {
    const { rows } = fubPeopleToContactRows([
      person({ name: "", firstName: "Jane", lastName: "Doe" }),
    ]);
    expect(rows[0].name).toBe("Jane Doe");
  });

  test("name is null when name, firstName, and lastName are all absent", () => {
    const { rows } = fubPeopleToContactRows([
      person({ name: null, firstName: null, lastName: null }),
    ]);
    expect(rows[0].name).toBeNull();
  });

  test("phone reads phones[0].value", () => {
    const { rows } = fubPeopleToContactRows([
      person({ phones: [{ value: "111-222-3333" }, { value: "444-555-6666" }] }),
    ]);
    expect(rows[0].phone).toBe("111-222-3333");
  });

  test("phone is null-safe when phones is empty", () => {
    const { rows } = fubPeopleToContactRows([person({ phones: [] })]);
    expect(rows[0].phone).toBeNull();
  });

  test("phone is null-safe when phones is absent", () => {
    const { rows } = fubPeopleToContactRows([person({ phones: undefined })]);
    expect(rows[0].phone).toBeNull();
  });

  test('tags are always ["followupboss"]', () => {
    const { rows } = fubPeopleToContactRows([person()]);
    expect(rows[0].tags).toEqual(["followupboss"]);
  });

  test("person with no emails array is skipped and counted", () => {
    const { rows, skipped } = fubPeopleToContactRows([person({ emails: undefined })]);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  test("person with an empty emails array is skipped and counted", () => {
    const { rows, skipped } = fubPeopleToContactRows([person({ emails: [] })]);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  test("person whose primary email is blank/whitespace is skipped and counted", () => {
    const { rows, skipped } = fubPeopleToContactRows([person({ emails: [{ value: "   " }] })]);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  test("person whose primary email fails isValidEmail is skipped and counted", () => {
    const { rows, skipped } = fubPeopleToContactRows([
      person({ emails: [{ value: "not-an-email" }] }),
    ]);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  test("skipped count accumulates across multiple bad people, valid rows unaffected", () => {
    const { rows, skipped } = fubPeopleToContactRows([
      person({ emails: [] }),
      person({ emails: [{ value: "ok@example.com" }] }),
      person({ emails: [{ value: "not-an-email" }] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ok@example.com");
    expect(skipped).toBe(2);
  });

  test("empty input returns empty rows and zero skipped", () => {
    expect(fubPeopleToContactRows([])).toEqual({ rows: [], skipped: 0 });
  });

  test("unsubscribed key is ALWAYS absent — FUB's People API has no per-person opt-out flag", () => {
    const { rows } = fubPeopleToContactRows([person()]);
    expect(Object.prototype.hasOwnProperty.call(rows[0], "unsubscribed")).toBe(false);
  });

  test("an invalid email status ('Invalid') is NOT read as an unsubscribe signal", () => {
    // emails[].status is deliverability (Valid/Invalid), never subscription state.
    const { rows } = fubPeopleToContactRows([
      person({ emails: [{ value: "person@example.com", isPrimary: 1, status: "Invalid" }] }),
    ]);
    expect(rows).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(rows[0], "unsubscribed")).toBe(false);
  });
});
