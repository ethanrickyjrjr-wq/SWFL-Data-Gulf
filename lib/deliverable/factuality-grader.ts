// promptfoo grading provider that routes the factuality judge's Anthropic call
// through the one enforced spend seam (spec 2026-07-16-factuality-ci-gate-design.md
// D1). Errors (incl. SpendCapError) propagate — a broken judge must surface as an
// ERROR, never as a pass/fail verdict (spec D7).
import { getAnthropic, SYNTHESIS_MODEL } from "../../refinery/agents/anthropic.mts";

export const seamFactualityGrader = {
  id: () => "swfl:factuality-grader-seam",
  callApi: async (prompt: string) => {
    const client = getAnthropic("factuality_ci");
    const msg = await client.messages.create({
      model: SYNTHESIS_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const output = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    return {
      output,
      tokenUsage: {
        total: msg.usage.input_tokens + msg.usage.output_tokens,
        prompt: msg.usage.input_tokens,
        completion: msg.usage.output_tokens,
      },
    };
  },
};
