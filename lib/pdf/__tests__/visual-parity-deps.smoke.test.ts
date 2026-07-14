// lib/pdf/__tests__/visual-parity-deps.smoke.test.ts
//
// Proves the 4 new devDependencies actually load on this machine BEFORE any
// other visual-parity test depends on them. `canvas` is a native binding
// (node-canvas, a Cairo wrapper) that pdf-to-img's Node rendering path needs
// but doesn't declare as its own dependency (it's a devDependency of pdf-to-img
// itself) — a consumer has to install it separately, and it's the one piece
// most likely to fail on an unfamiliar machine (missing prebuilt binary for
// the host platform). This test isolates that failure mode with a clear name,
// instead of a confusing failure deep inside a real rasterization call.
import { describe, expect, it } from "bun:test";

describe("visual-parity devDependencies load", () => {
  it("pngjs exports PNG", async () => {
    const { PNG } = await import("pngjs");
    expect(typeof PNG).toBe("function");
  });

  it("pixelmatch is callable", async () => {
    const mod = await import("pixelmatch");
    const pixelmatch = mod.default ?? mod;
    expect(typeof pixelmatch).toBe("function");
  });

  it("pdf-to-img exports pdf()", async () => {
    const { pdf } = await import("pdf-to-img");
    expect(typeof pdf).toBe("function");
  });

  it("canvas (the native binding pdf-to-img's Node render path needs) loads and creates a canvas", async () => {
    const { createCanvas } = await import("canvas");
    const canvas = createCanvas(10, 10);
    expect(canvas.width).toBe(10);
  });

  it("playwright exports chromium with a launch() method", async () => {
    const { chromium } = await import("playwright");
    expect(typeof chromium.launch).toBe("function");
  });
});
