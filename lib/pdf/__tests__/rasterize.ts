// lib/pdf/__tests__/rasterize.ts — thin wrappers turning an HTML string or a
// PDF buffer into a decoded PNG, for the visual-parity suite only. Not
// production code; not imported outside lib/pdf/__tests__.
//
// rasterizeHtml spawns Node (rasterize-html-worker.mjs) instead of calling
// Playwright directly, because chromium.launch() hangs when invoked from the
// Bun runtime on Windows (verified in-session, 07/14/2026 — real repro: the
// browser process launches with a real pid, but Bun never completes the
// `--remote-debugging-pipe` handshake; works fine under plain Node). Known,
// unresolved Bun limitation — see oven-sh/bun issues #27977, #23826, #15679,
// #10120. PDF rasterization (pdf-to-img + canvas) has no such problem and
// stays in-process.
import { fileURLToPath } from "node:url";
import { pdf as pdfToImg } from "pdf-to-img";
import { PNG } from "pngjs";

const HTML_WORKER_PATH = fileURLToPath(new URL("./rasterize-html-worker.mjs", import.meta.url));

export async function rasterizeHtml(
  html: string,
  viewport: { width: number; height: number },
): Promise<PNG> {
  const proc = Bun.spawn(["node", HTML_WORKER_PATH], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(JSON.stringify({ html, viewport }));
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`rasterizeHtml worker failed (exit ${exitCode}): ${stderr || "(no stderr)"}`);
  }
  return PNG.sync.read(Buffer.from(stdout, "base64"));
}

export async function rasterizePdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 2,
): Promise<PNG> {
  const doc = await pdfToImg(pdfBuffer, { scale });
  try {
    const buf = await doc.getPage(pageNumber);
    return PNG.sync.read(buf);
  } finally {
    await doc.destroy();
  }
}

export async function rasterizePdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await pdfToImg(pdfBuffer);
  try {
    return doc.length;
  } finally {
    await doc.destroy();
  }
}
