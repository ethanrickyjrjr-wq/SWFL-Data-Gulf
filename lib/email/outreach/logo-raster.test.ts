// lib/email/outreach/logo-raster.test.ts
import { describe, expect, it } from "bun:test";
import { ensureRasterLogo } from "./logo-raster";

const svgFetch = (async () =>
  new Response("<svg xmlns='http://www.w3.org/2000/svg'/>", {
    status: 200,
    headers: { "content-type": "image/svg+xml" },
  })) as typeof fetch;

describe("ensureRasterLogo", () => {
  it("raster formats pass through unchanged (no fetch, no rasterize, no host)", async () => {
    let rastered = 0;
    const noFetch = (async () => {
      throw new Error("must not fetch");
    }) as unknown as typeof fetch;
    const url = await ensureRasterLogo("https://cdn.x.com/logo.png", "bhhs", {
      fetchImpl: noFetch,
      raster: () => {
        rastered++;
        return Buffer.from("");
      },
      host: async () => "should-not-happen",
    });
    expect(url).toBe("https://cdn.x.com/logo.png");
    expect(rastered).toBe(0);
  });

  it("SVG content-type rasterizes and hosts as logos/<key>.png", async () => {
    const calls: string[] = [];
    const url = await ensureRasterLogo("https://cdn.x.com/brand", "BHHS Florida!", {
      fetchImpl: svgFetch,
      raster: (svg) => {
        expect(svg).toContain("<svg");
        return Buffer.from("png");
      },
      host: async (key, _buf, type) => {
        calls.push(`${key}|${type}`);
        return `https://media.example.com/${key}`;
      },
    });
    expect(calls).toEqual(["logos/bhhs_florida_.png|image/png"]);
    expect(url).toBe("https://media.example.com/logos/bhhs_florida_.png");
  });

  it(".svg extension triggers rasterize even without an svg content-type", async () => {
    const anyFetch = (async () =>
      new Response("<svg/>", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })) as typeof fetch;
    const url = await ensureRasterLogo("https://cdn.x.com/l.svg", "k", {
      fetchImpl: anyFetch,
      raster: () => Buffer.from("png"),
      host: async (key) => `hosted/${key}`,
    });
    expect(url).toBe("hosted/logos/k.png");
  });

  it("throws on a non-ok fetch", async () => {
    const notFound = (async () => new Response("x", { status: 404 })) as typeof fetch;
    await expect(
      ensureRasterLogo("https://cdn.x.com/l.svg", "k", { fetchImpl: notFound }),
    ).rejects.toThrow("404");
  });
});
