import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { wrapCampaignLinks } from "../tracked-links/wrap";
import { verifyLinkToken } from "../tracked-links/token";
import type { ComposedMessage } from "../outreach/campaign";

const ORIGIN = "https://www.swfldatagulf.com";
let prevSecret: string | undefined;

beforeAll(() => {
  prevSecret = process.env.SDG_COOKIE_SECRET;
  process.env.SDG_COOKIE_SECRET = "test-secret-for-tracked-links";
});
afterAll(() => {
  if (prevSecret === undefined) delete process.env.SDG_COOKIE_SECRET;
  else process.env.SDG_COOKIE_SECRET = prevSecret;
});

function ready(over: Partial<ComposedMessage> = {}): ComposedMessage {
  return {
    email: "broker@acme.com",
    status: "ready",
    brandSource: "meta",
    brandConfidence: 0.9,
    usedHouseBrand: false,
    primary: "#0a3d62",
    arrivalUrl: "https://www.swfldatagulf.com/welcome?name=Acme&zip=33901",
    subject: "Your market update",
    html:
      '<body><a href="https://www.swfldatagulf.com/welcome?name=Acme&zip=33901">Create your own report</a>' +
      '<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></body>',
    ...over,
  };
}

const opts = {
  origin: ORIGIN,
  recipientId: (m: ComposedMessage) => `rid-${m.email}`,
  campaignId: () => "camp-a",
  step: () => 2,
};

describe("wrapCampaignLinks", () => {
  test("wraps each ready message's CTA and returns a matching sent-context", () => {
    const out = wrapCampaignLinks([ready()], opts);
    expect(out.messages).toHaveLength(1);
    const html = out.messages[0].html!;
    expect(html).not.toContain("/welcome?name=Acme&zip=33901");
    expect(html).toContain(`${ORIGIN}/api/r/`);

    expect(out.minted).toHaveLength(1);
    const m = out.minted[0];
    expect(m).toEqual({
      rid: "rid-broker@acme.com",
      cid: "camp-a",
      step: 2,
      bk: "cta",
      dest: "https://www.swfldatagulf.com/welcome?name=Acme&zip=33901",
      ch: "email",
    });

    // The wrapped token decodes back to the same destination + context.
    const tokenMatch = html.match(/\/api\/r\/([^"]+)"/);
    expect(tokenMatch).toBeTruthy();
    const v = verifyLinkToken(tokenMatch![1]);
    expect(v.ok && v.dest).toBe(m.dest);
  });

  test("leaves the unsubscribe placeholder untouched (never double-wraps opt-out)", () => {
    const out = wrapCampaignLinks([ready()], opts);
    expect(out.messages[0].html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });

  test("passes non-ready messages through and mints nothing for them", () => {
    const out = wrapCampaignLinks(
      [ready({ email: "x@y.com", status: "out_of_scope", html: undefined, arrivalUrl: "" })],
      opts,
    );
    expect(out.messages).toHaveLength(1);
    expect(out.messages[0].html).toBeUndefined();
    expect(out.minted).toHaveLength(0);
  });

  test("no signing secret → messages unchanged, nothing minted (send survives untracked)", () => {
    const saved = process.env.SDG_COOKIE_SECRET;
    delete process.env.SDG_COOKIE_SECRET;
    try {
      const input = ready();
      const out = wrapCampaignLinks([input], opts);
      expect(out.messages[0].html).toBe(input.html);
      expect(out.minted).toHaveLength(0);
    } finally {
      process.env.SDG_COOKIE_SECRET = saved;
    }
  });

  test("campaignId/step omitted → context nulls, still wraps + mints", () => {
    const out = wrapCampaignLinks([ready()], {
      origin: ORIGIN,
      recipientId: (m) => `rid-${m.email}`,
    });
    expect(out.minted[0].cid).toBeNull();
    expect(out.minted[0].step).toBeNull();
    expect(out.messages[0].html).toContain(`${ORIGIN}/api/r/`);
  });
});
