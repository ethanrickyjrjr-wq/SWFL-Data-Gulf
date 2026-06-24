// app/api/projects/[id]/materials/route.test.ts
import { describe, test, expect } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";

const validDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#1BB8C9",
    fontFamily: "MODERN_SANS",
    textColor: "#242424",
    backdropColor: "#F8F8F8",
  },
  blocks: [{ type: "header", props: { companyName: "Acme" } }],
};

describe("materials POST contract", () => {
  test("EmailDocSchema accepts a valid doc (block id minted)", () => {
    expect(EmailDocSchema.safeParse(validDoc).success).toBe(true);
  });
  test("EmailDocSchema rejects empty blocks", () => {
    expect(EmailDocSchema.safeParse({ ...validDoc, blocks: [] }).success).toBe(false);
  });
});
