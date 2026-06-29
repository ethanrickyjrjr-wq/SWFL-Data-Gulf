/**
 * scripts/render-email-assets.mts
 *
 * SVG → PNG → email-media pipeline. Converts every .svg in public/email-assets/
 * to an Outlook-safe PNG via Inkscape (144 dpi, file-in/file-out) and upserts to
 * the public email-media/email-assets/ path in Supabase.
 *
 * Run from the email-assets GHA workflow (after apt-get install inkscape), or
 * locally when Inkscape is on PATH:
 *
 *   bun run scripts/render-email-assets.mts
 *
 * Requires: SUPABASE_URL + SUPABASE_SERVICE_KEY
 */

import { readdir, readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { hostEmailPng } from "../lib/email/chart-image";

const ASSETS_DIR = join(import.meta.dir, "..", "public", "email-assets");
const UPLOAD_PREFIX = "email-assets";
const DPI = 144;

async function svgToPng(svgBuffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "email-assets-"));
  const inPath = join(dir, "in.svg");
  const outPath = join(dir, "out.png");
  try {
    await writeFile(inPath, svgBuffer);
    const proc = Bun.spawn(
      [
        "inkscape",
        inPath,
        "--export-type=png",
        `--export-filename=${outPath}`,
        `--export-dpi=${DPI}`,
      ],
      { stderr: "pipe" },
    );
    const [stderrText, status] = await Promise.all([
      Bun.readableStreamToText(proc.stderr!),
      proc.exited,
    ]);
    if (status !== 0) {
      throw new Error(`inkscape exited ${status}: ${stderrText.slice(0, 300)}`);
    }
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  let entries: string[];
  try {
    entries = await readdir(ASSETS_DIR);
  } catch {
    console.log(`[email-assets] public/email-assets/ not found — nothing to render`);
    return;
  }

  const svgs = entries.filter((f) => extname(f).toLowerCase() === ".svg");
  if (!svgs.length) {
    console.log("[email-assets] no .svg files found — nothing to render");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const file of svgs) {
    const slug = basename(file, extname(file));
    const key = `${UPLOAD_PREFIX}/${slug}.png`;
    try {
      const svg = await readFile(join(ASSETS_DIR, file));
      process.stdout.write(`[email-assets] ${file} → ${key} …`);
      const png = await svgToPng(svg);
      const url = await hostEmailPng(key, png);
      console.log(` ✓  ${url}`);
      ok++;
    } catch (e) {
      console.log(` ✗`);
      console.error(`  ${(e as Error).message}`);
      fail++;
    }
  }

  if (fail) {
    console.error(`[email-assets] ${fail} failure(s), ${ok} ok`);
    process.exit(1);
  }
  console.log(`[email-assets] ${ok} asset(s) uploaded to email-media/${UPLOAD_PREFIX}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
