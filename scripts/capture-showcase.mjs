/**
 * Local-only capture: renders public/showcase HTML to committed .webp slides.
 * Uses the pinned crawl4ai venv's Python Playwright (chromium already installed)
 * so the repo gains NO runtime/build browser dependency. Re-run whenever a
 * showcase HTML changes, then commit the .webp outputs.
 *   node scripts/capture-showcase.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PY = "C:\\Users\\ethan\\crawl4ai-venv\\Scripts\\python.exe";

// slide order here IS the registry slide order (minus the component-rendered tier slide)
const SHOWCASES = [
  {
    id: "listing-to-close",
    width: 700,
    files: [
      "01-coming-soon.html",
      "02-new-listing.html",
      "03-comps.html",
      "04-pending.html",
      "05-sold.html",
    ],
  },
  {
    id: "agent-launch",
    width: 700,
    files: ["01-letter.html", "02-headlines-vs-here.html", "03-review-snapshot.html"],
  },
  { id: "launch-blitz", width: 700, files: ["agent-intro.html"] },
  { id: "launch-blitz", width: 1440, files: ["social-pack.html"], startAt: 2 },
  { id: "market-pulse", width: 1100, files: ["ask.html"] },
  { id: "market-pulse", width: 700, files: ["pulse-email.html"], startAt: 2 },
  { id: "market-pulse", width: 1440, files: ["socials.html"], startAt: 3 },
  { id: "market-pulse", width: 1200, files: ["vintages.html"], startAt: 4 },
];

const PY_SRC = `
import json, sys
from playwright.sync_api import sync_playwright
jobs = json.load(open(sys.argv[1], encoding="utf-8"))
with sync_playwright() as p:
    b = p.chromium.launch()
    for j in jobs:
        ctx = b.new_context(viewport={"width": j["width"], "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto("file:///" + j["html"].replace("\\\\", "/"))
        page.wait_for_timeout(2500)  # let remote listing photos land
        page.screenshot(path=j["png"], full_page=True)
        ctx.close()
        print("captured", j["png"])
    b.close()
`;

const tmp = mkdtempSync(join(tmpdir(), "showcase-cap-"));
const jobs = [];
for (const s of SHOWCASES) {
  let n = s.startAt ?? 1;
  for (const f of s.files) {
    jobs.push({
      width: s.width,
      html: join(ROOT, "public", "showcase", s.id, "live", f),
      png: join(tmp, `${s.id}-step-${n}.png`),
      out: join(ROOT, "public", "showcase", s.id, `step-${n}.webp`),
      id: s.id,
      step: n,
    });
    n++;
  }
}
writeFileSync(join(tmp, "cap.py"), PY_SRC);
writeFileSync(join(tmp, "jobs.json"), JSON.stringify(jobs));
const r = spawnSync(PY, [join(tmp, "cap.py"), join(tmp, "jobs.json")], { stdio: "inherit" });
if (r.status !== 0) {
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

for (const j of jobs) {
  await sharp(j.png).webp({ quality: 82 }).toFile(j.out);
  if (j.step === 1) {
    await sharp(j.png)
      .resize({ width: 480 })
      .webp({ quality: 75 })
      .toFile(join(ROOT, "public", "showcase", j.id, "thumb.webp"));
  }
  console.log("wrote", j.out);
}
rmSync(tmp, { recursive: true, force: true });
