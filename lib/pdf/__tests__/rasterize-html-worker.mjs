// lib/pdf/__tests__/rasterize-html-worker.mjs
//
// Standalone Node ESM script — NOT run by bun:test directly. Spawned as a
// child process by rasterize.ts's rasterizeHtml(), because chromium.launch()
// hangs indefinitely when called directly from the Bun runtime on Windows
// (verified in-session, 07/14/2026): Playwright's browser process actually
// launches (a real pid), but the `--remote-debugging-pipe` handshake between
// Bun and the browser never completes. This is a known, unresolved Bun
// limitation, not a bug in this code — see oven-sh/bun issues #27977, #23826,
// #15679, #10120. Node has no such problem, so the actual browser automation
// runs here instead. PDF rasterization (pdf-to-img + canvas, no subprocess)
// is unaffected and stays in-process in rasterize.ts.
//
// Protocol: reads `{ html: string, viewport: { width, height } }` as JSON from
// stdin; writes the screenshot as a base64 PNG string to stdout (nothing else
// ever goes to stdout); writes any error to stderr and exits non-zero.
import { chromium } from "playwright";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { html, viewport } = JSON.parse(input);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.setContent(html, { waitUntil: "networkidle" });
    const buf = await page.screenshot({ fullPage: true });
    process.stdout.write(buf.toString("base64"));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exitCode = 1;
});
