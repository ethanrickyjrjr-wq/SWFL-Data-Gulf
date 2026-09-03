import { describe, expect, it } from "bun:test";
import {
  FIRST_TOUCH_LINK_RE,
  renderFirstTouchHtml,
  toComposedMessage,
  validateFirstTouchDraft,
  type FirstTouchDraft,
} from "./first-touch";

const POSTAL = "7191 Cypress Lake Drive STE 3, Fort Myers, FL 33907";
const LINK =
  "https://www.swfldatagulf.com/insiders?utm_source=outreach&utm_medium=email&utm_campaign=first-touch-001&utm_content=jane";

function draft(over: Partial<FirstTouchDraft> = {}): FirstTouchDraft {
  return {
    email: "jane@example-brokerage.com",
    name: "Jane Doe",
    zip: "33907",
    subject: "33907 home values, as of 07/24/2026",
    body: `Home value in 33907 is $204,209 as of 07/24/2026, down 11.64% year over year.\n\nSaw your market update last month. That figure comes from our own lake, and you can build a branded version for your own zip code on the site, free, no card, same data behind it.\n\nIssue 001 of the Insiders Edition is here if you want to see what it looks like on paper. Worth a look for your farm?\n\n${LINK}\n\nRicky Cooper\nSWFL DATA GULF`,
    number_used: "$204,209",
    link: LINK,
    ...over,
  };
}

describe("renderFirstTouchHtml — failure modes named first", () => {
  it("a send without the CAN-SPAM postal address cannot render (no-invention floor)", () => {
    expect(() => renderFirstTouchHtml(draft(), "")).toThrow(/postal/i);
  });

  it("carries the unsubscribe token AND the postal address in the footer", () => {
    const html = renderFirstTouchHtml(draft(), POSTAL);
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(html).toContain(POSTAL);
  });

  it("escapes HTML in the body (a scouted name is untrusted input)", () => {
    const html = renderFirstTouchHtml(
      draft({ body: `<script>x</script>\n\n${LINK}\n\nRicky Cooper\nSWFL DATA GULF` }),
      POSTAL,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the one link as an anchor, verbatim", () => {
    const html = renderFirstTouchHtml(draft(), POSTAL);
    expect(html).toContain(`href="${LINK}"`);
  });
});

describe("validateFirstTouchDraft — the compliance floor, in code not in a doc", () => {
  it("passes a clean draft", () => {
    expect(validateFirstTouchDraft(draft())).toEqual([]);
  });

  it("rejects a body over 120 words", () => {
    const long = Array.from({ length: 121 }, (_, i) => `w${i}`).join(" ") + `\n${LINK}`;
    expect(validateFirstTouchDraft(draft({ body: long }))).toContain("body over 120 words");
  });

  it("rejects a missing or malformed insiders UTM link", () => {
    const errs = validateFirstTouchDraft(
      draft({ body: "no link here\n\nRicky", link: "https://example.com" }),
    );
    expect(errs.some((e) => /link/.test(e))).toBe(true);
  });

  it("rejects a second link", () => {
    const errs = validateFirstTouchDraft(
      draft({
        body: `${LINK}\n\nhttps://www.swfldatagulf.com/other\n\nRicky Cooper\nSWFL DATA GULF`,
      }),
    );
    expect(errs).toContain("more than one link");
  });

  it("rejects exclamation marks and ALL-CAPS shouting", () => {
    expect(
      validateFirstTouchDraft(
        draft({ body: `Big news!\n\n${LINK}\n\nRicky Cooper\nSWFL DATA GULF` }),
      ),
    ).toContain("exclamation mark");
    expect(
      validateFirstTouchDraft(
        draft({ body: `HURRY today\n\n${LINK}\n\nRicky Cooper\nSWFL DATA GULF` }),
      ),
    ).toContain("all-caps word");
  });

  it("rejects a body whose number_used is absent (an invented or altered number)", () => {
    expect(validateFirstTouchDraft(draft({ number_used: "$999,999" }))).toContain(
      "number_used not present verbatim in body",
    );
  });

  it("rejects 'free' in the subject and a subject over 60 chars", () => {
    expect(validateFirstTouchDraft(draft({ subject: "Free report for you" }))).toContain(
      "subject contains 'free'",
    );
    expect(validateFirstTouchDraft(draft({ subject: "x".repeat(61) }))).toContain(
      "subject over 60 chars",
    );
  });

  it("playbook §1.7: a first name alone is not a sign-off to a stranger", () => {
    const firstNameOnly = draft().body.replace("Ricky Cooper\nSWFL DATA GULF", "Ricky");
    expect(validateFirstTouchDraft(draft({ body: firstNameOnly }))).toContain(
      "not signed Ricky Cooper / SWFL DATA GULF",
    );
    const withPhone = draft().body.replace(
      "Ricky Cooper\nSWFL DATA GULF",
      "Ricky Cooper\n(239) 555-0100\nSWFL DATA GULF",
    );
    expect(validateFirstTouchDraft(draft({ body: withPhone }))).toEqual([]);
  });

  it("rejects a bad email address", () => {
    expect(validateFirstTouchDraft(draft({ email: "not-an-email" }))).toContain("invalid email");
  });

  it("playbook §1.9a: never the word ZIP in customer-facing copy", () => {
    const errs = validateFirstTouchDraft(
      draft({ body: draft().body.replace("your own zip code", "your farm ZIP") }),
    );
    expect(errs).toContain("says ZIP — write zip code");
  });

  it("playbook §1.9: the 50-word floor bites, and a first touch asks a question", () => {
    const short = `Home value in 33907 is $204,209 as of 07/24/2026. Worth a look?\n\n${LINK}\n\nRicky Cooper\nSWFL DATA GULF`;
    expect(validateFirstTouchDraft(draft({ body: short }))).toContain("body under 50 words");
    const noQ = draft().body.replace("Worth a look for your farm?", "Worth a look for your farm.");
    expect(validateFirstTouchDraft(draft({ body: noQ }))).toContain("no question asked");
  });
});

describe("toComposedMessage", () => {
  it("produces a ready message the existing Resend batch builder accepts", () => {
    const m = toComposedMessage(draft(), POSTAL);
    expect(m.status).toBe("ready");
    expect(m.email).toBe("jane@example-brokerage.com");
    expect(m.zip).toBe("33907");
    expect(m.html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(m.usedHouseBrand).toBe(true);
    expect(m.arrivalUrl).toBe(LINK);
  });
});

describe("FIRST_TOUCH_LINK_RE", () => {
  it("matches only the insiders URL with all four UTM params", () => {
    expect(FIRST_TOUCH_LINK_RE.test(LINK)).toBe(true);
    expect(FIRST_TOUCH_LINK_RE.test("https://www.swfldatagulf.com/insiders")).toBe(false);
  });
});
