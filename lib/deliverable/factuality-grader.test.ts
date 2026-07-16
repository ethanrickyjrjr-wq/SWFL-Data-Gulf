import { describe, expect, mock, test } from "bun:test";
import * as anthropicModule from "../../refinery/agents/anthropic.mts";

const calls: Array<{ callType: string; body: Record<string, unknown> }> = [];

mock.module("../../refinery/agents/anthropic.mts", () => ({
  ...anthropicModule,
  getAnthropic: (callType: string) =>
    ({
      messages: {
        create: async (body: Record<string, unknown>) => {
          calls.push({ callType, body });
          return {
            content: [{ type: "text", text: "(D) There is a disagreement." }],
            usage: { input_tokens: 120, output_tokens: 9 },
          };
        },
      },
    }) as never,
}));

const { seamFactualityGrader } = await import("./factuality-grader");

describe("seamFactualityGrader", () => {
  test("routes through the seam with the factuality_ci call type and SYNTHESIS_MODEL", async () => {
    const res = await seamFactualityGrader.callApi("RUBRIC PROMPT");
    expect(calls).toHaveLength(1);
    expect(calls[0].callType).toBe("factuality_ci");
    expect(calls[0].body.model).toBe(anthropicModule.SYNTHESIS_MODEL);
    expect(res.output).toBe("(D) There is a disagreement.");
    expect(res.tokenUsage).toEqual({ total: 129, prompt: 120, completion: 9 });
  });

  test("has a stable provider id", () => {
    expect(seamFactualityGrader.id()).toBe("swfl:factuality-grader-seam");
  });
});
