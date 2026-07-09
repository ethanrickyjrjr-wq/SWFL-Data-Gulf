/**
 * Local-only capture: renders every SEED_DOCS template — previewFill'd with
 * real, sourced display data — to committed .webp gallery tiles under
 * public/showcase/seed-previews/<seed-id>.webp.
 *
 * Mirrors scripts/capture-showcase.mjs: uses the pinned crawl4ai venv's Python
 * Playwright (chromium installed) + Pillow so the repo gains NO runtime/build
 * browser dependency. RE-RUN whenever a SEED_DOCS template visually changes
 * (seed-previews.test.ts only guards asset EXISTENCE, not freshness), then
 * commit the .webp outputs. Coordinate with content work: land
 * email_cadence_enrichment first when possible, or plan a re-run after it.
 *
 *   bun scripts/capture-seed-previews.mts
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { SEED_DOCS } from "../lib/email/doc/default-docs";
import { previewFill } from "../lib/email/doc/preview-fill";
import { renderEmailDocHtml } from "../lib/email/render-email-doc";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PY = "C:\\Users\\ethan\\crawl4ai-venv\\Scripts\\python.exe";
const OUT_DIR = join(ROOT, "public", "showcase", "seed-previews");
const PUBLIC_FILE_PREFIX = `file:///${ROOT.replace(/\\/g, "/")}/public/`;

// Screenshot each rendered email at its natural 700px frame (600px content +
// padding — same width the showcase email captures use), then convert to webp.
const PY_SRC = `
import json, sys
from PIL import Image
from playwright.sync_api import sync_playwright
jobs = json.load(open(sys.argv[1], encoding="utf-8"))
with sync_playwright() as p:
    b = p.chromium.launch()
    for j in jobs:
        ctx = b.new_context(viewport={"width": 700, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto("file:///" + j["html"].replace("\\\\", "/"))
        page.wait_for_timeout(1200)  # local assets settle fast
        page.screenshot(path=j["png"], full_page=True)
        ctx.close()
        Image.open(j["png"]).convert("RGB").save(j["webp"], "WEBP", quality=82, method=6)
        print("captured", j["webp"])
    b.close()
`;

const tmp = mkdtempSync(join(tmpdir(), "seed-previews-"));
mkdirSync(OUT_DIR, { recursive: true });

const jobs: { html: string; png: string; webp: string }[] = [];
for (const seed of SEED_DOCS) {
  const filled = previewFill(seed.build(), { seedId: seed.id });
  let html = await renderEmailDocHtml(filled);
  // Root-relative asset paths (committed photos/charts) must resolve from the
  // throwaway file:// page — prod URLs stay untouched. Overlay images (the
  // magazine-issue cover) ride in CSS background-image:url(/...), not src=,
  // so rewrite both forms or the capture shows the gray fallback band.
  html = html.replaceAll('src="/', `src="${PUBLIC_FILE_PREFIX}`);
  html = html.replaceAll("url(/", `url(${PUBLIC_FILE_PREFIX}`);
  const htmlPath = join(tmp, `${seed.id}.html`);
  writeFileSync(htmlPath, html);
  jobs.push({
    html: htmlPath,
    png: join(tmp, `${seed.id}.png`),
    webp: join(OUT_DIR, `${seed.id}.webp`),
  });
}

writeFileSync(join(tmp, "cap.py"), PY_SRC);
writeFileSync(join(tmp, "jobs.json"), JSON.stringify(jobs));
const r = spawnSync(PY, [join(tmp, "cap.py"), join(tmp, "jobs.json")], { stdio: "inherit" });
rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0) process.exit(1);
console.log(`\nwrote ${jobs.length} captures to ${OUT_DIR}`);
