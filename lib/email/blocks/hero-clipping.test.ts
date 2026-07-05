// lib/email/blocks/hero-clipping.test.ts
// A BANDED hero carrying a figure is the agent-launch "stat clipping" — the
// personal letter's one piece of hard evidence, pinned with an accent left
// border. Unbanded heros render byte-identically to before (agent-launch L3).
import { describe, expect, it } from "bun:test";
import { render } from "@react-email/render";
import { HeroBlock } from "./HeroBlock";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";

const gs = { ...DEFAULT_GLOBAL_STYLE, accentColor: "#A98A4E" };

describe("hero clipping", () => {
  it("banded hero with a value gets the accent left border", async () => {
    const html = await render(
      HeroBlock({
        props: {
          kicker: "Bonita Springs",
          value: "$412",
          label: "one honest line",
          sectionBg: "#ffffff",
        },
        globalStyle: gs,
      }),
    );
    expect(html).toContain("border-left:4px solid #A98A4E");
  });

  it("dark-banded hero keeps the border legible via legibleAccent", async () => {
    const html = await render(
      HeroBlock({
        props: { kicker: "k", value: "$1", label: "l", sectionBg: "#10201a" },
        globalStyle: gs,
      }),
    );
    expect(html).toMatch(/border-left:4px solid #[0-9a-fA-F]{6}/);
  });

  it("unbanded hero is unchanged (no left border)", async () => {
    const html = await render(
      HeroBlock({ props: { kicker: "k", value: "$1", label: "l" }, globalStyle: gs }),
    );
    expect(html).not.toContain("border-left:4px");
  });
});
