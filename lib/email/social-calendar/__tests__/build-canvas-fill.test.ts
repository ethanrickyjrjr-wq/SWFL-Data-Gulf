import { test, expect } from "bun:test";
import { canvasFillPrompt } from "@/lib/email/social-calendar/build-canvas-fill";

test("canvasFillPrompt renders the element skeleton as id->text lines", () => {
  const skeleton = {
    t1: { type: "text", text: "Headline" },
    s1: { type: "stat", value: "", label: "median price" },
  };
  const msg = canvasFillPrompt(skeleton);
  expect(msg).toContain("t1");
  expect(msg).toContain("Headline");
  expect(msg).toContain("s1");
  expect(msg).toContain("median price");
});
