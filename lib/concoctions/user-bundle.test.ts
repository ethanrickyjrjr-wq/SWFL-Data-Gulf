import { describe, it, expect } from "bun:test";
import { materializeUserFigure } from "./user-bundle";
import { checkDocFreshness } from "./freshness";
import { stubSb } from "./defs/test-stub";

describe("materializeUserFigure", () => {
  const block = materializeUserFigure(
    { label: "My building's rent", value: "$21.50", attribution: "operator" },
    { id: "user-1", asOf: "07/12/2026" },
  );

  it("metric-card with the stated value VERBATIM + attribution", () => {
    expect(block.type).toBe("metric-card");
    const p = block.props as { metricValue?: string; metricLabel?: string; sub?: string };
    expect(p.metricValue).toBe("$21.50");
    expect(p.metricLabel).toBe("My building's rent");
    expect(p.sub).toBe("Provided by operator");
  });
  it("binding: lane user, attribution in the source line, caller-supplied asOf", () => {
    expect(block.binding?.lane).toBe("user");
    expect(block.binding?.bundleRef).toBe("user-stated");
    expect(block.binding?.sourceLine).toBe("Figure provided by operator");
    expect(block.binding?.asOf).toBe("07/12/2026");
  });
  it("freshness ignores user-lane blocks (nothing to re-probe)", async () => {
    const map = await checkDocFreshness([block], { sb: stubSb([]) });
    expect(map[block.id]).toBeUndefined();
  });
});
