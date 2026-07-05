// lib/email/blocks/agent-card-render.test.ts
// Agent photos are professional half-body portraits — the render is an
// editorial rectangular crop, never a circle avatar (agent-launch L1).
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { AgentCardBlock } from "./AgentCardBlock";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";

describe("AgentCardBlock portrait", () => {
  it("renders the photo as a rectangular editorial crop, never a circle", async () => {
    const html = await render(
      AgentCardBlock({
        props: { photoUrl: "https://example.com/p.png", name: "A", title: "Agent" },
        globalStyle: DEFAULT_GLOBAL_STYLE,
      }),
    );
    expect(html).not.toContain("border-radius:50%");
    expect(html).toContain("border-radius:10px");
  });
});
