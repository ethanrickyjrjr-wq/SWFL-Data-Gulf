import { describe, expect, it } from "bun:test";
import { extractBlastAction } from "./blast-events";

describe("extractBlastAction", () => {
  it("maps a did-tagged clicked event", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked" });
  });

  it("returns null when the did tag is absent (not one of our blast sends)", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: {} },
      }),
    ).toBeNull();
  });

  it("returns null for an untracked event type", () => {
    expect(
      extractBlastAction({
        type: "email.received",
        data: { email_id: "re_1", tags: { did: "dlv-abc" } },
      }),
    ).toBeNull();
  });

  it("carries the variant tag when present", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc", variant: "1" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked", variant: "1" });
  });

  it("omits variant when the tag is absent", () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked" });
  });

  it('carries variant "0" (cohort 0 is 0-based, present in every split test)', () => {
    expect(
      extractBlastAction({
        type: "email.clicked",
        data: { email_id: "re_1", tags: { did: "dlv-abc", variant: "0" } },
      }),
    ).toEqual({ did: "dlv-abc", emailId: "re_1", event: "clicked", variant: "0" });
  });
});
