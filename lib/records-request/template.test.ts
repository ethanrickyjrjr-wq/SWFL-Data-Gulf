import { test, expect } from "bun:test";
import { draftRequestBody, draftSubject } from "./template";

const body = draftRequestBody({
  targetAgency: "Florida Department of Business and Professional Regulation",
  dataset: "Email addresses on file for all active Lee and Collier real estate licensees.",
});

test("names the agency and the dataset", () => {
  expect(body).toContain("Florida Department of Business and Professional Regulation");
  expect(body).toContain("Lee and Collier real estate licensees");
});

test("cites Chapter 119 and the specific fee/exemption subsections", () => {
  expect(body).toContain("ch. 119");
  expect(body).toContain("119.07(4)"); // special-service-charge cost-estimate ask
  expect(body).toContain("119.07(1)"); // redact-and-cite-exemption ask
});

test("asks for a cost estimate before fulfillment and for electronic delivery", () => {
  expect(body.toLowerCase()).toContain("cost estimate");
  expect(body.toLowerCase()).toContain("electronic");
});

test("carries NO marketing / unsubscribe text (transactional)", () => {
  expect(body.toLowerCase()).not.toContain("unsubscribe");
  expect(body.toLowerCase()).not.toContain("opt out");
});

test("subject references the dataset succinctly", () => {
  expect(draftSubject("Assessment roll (NAL) for Collier County")).toMatch(
    /public records request/i,
  );
});
