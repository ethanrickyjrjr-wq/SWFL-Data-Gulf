/**
 * scripts/social/post-listing-carousel.ts
 *
 * Listing record (JSON on disk) → four composited cards → ONE Bluesky post
 * whose only embed is `app.bsky.embed.images`, with the realtor.com link
 * riding in the post text as a rich-text facet.
 *
 *   bun scripts/social/post-listing-carousel.ts <record.json>
 *   bun scripts/social/post-listing-carousel.ts <record.json> --post
 *
 * default    renders the cards to ./.carousel-out/ and prints the caption.
 *            No network write.
 * --post     publishes, then READS THE RECORD BACK from the public appview and
 *            asserts the embed is images (and that no external embed rode
 *            along). The return value of postToBluesky is NOT the acceptance
 *            test — the read-back is (feedback_checks-prod-evidence-not-dev-
 *            attestation, handoff §6.5).
 *
 * The Apify pull is deliberately NOT in here. `lib/listings/apify-comps.ts` is
 * being written by a parallel session; this script takes a record that has
 * already been pulled so the two builds never contend for one file.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { buildCarouselCards, buildCarouselCaption } from "@/lib/social/listing-carousel";
import { renderListingCard, MAX_BLOB_BYTES } from "@/lib/social/listing-card-render";
import { postToBluesky, detectLinkFacets } from "@/lib/social/channels/bluesky";

const APPVIEW = "https://public.api.bsky.app";
const OUT_DIR = ".carousel-out";

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Read the post back from the read-only appview and prove what actually shipped. */
async function readBack(uri: string): Promise<Record<string, unknown>> {
  // The appview lags the PDS by a beat; give the record a moment to propagate.
  await new Promise((r) => setTimeout(r, 2500));
  const url = `${APPVIEW}/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`;
  const res = await fetch(url);
  if (!res.ok) die(`read-back failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { thread?: { post?: Record<string, unknown> } };
  const post = json.thread?.post;
  if (!post) die("read-back returned no post");
  return post;
}

const SLIDE_SECS = 2.5;
const XFADE_SECS = 0.5;

/**
 * Encode the rendered slides into ONE looping slideshow mp4.
 *
 * This is what makes it an actual carousel. `app.bsky.embed.images` renders
 * 2-4 photos as a static MOSAIC GRID in the official client — there is no
 * swipeable multi-image embed on this platform. `app.bsky.embed.video` with
 * `presentation: "gif"` autoplays, loops, and drops the player chrome, which
 * is the auto-advancing carousel the operator asked for. `slideleft` is the
 * transition that reads as a swipe.
 *
 * ffmpeg is a LOCAL binary (verified 8.1.2). If it is missing this throws and
 * the caller aborts — it never silently falls back to the grid.
 */
async function encodeSlideshow(slides: string[], out: string): Promise<void> {
  const inputs = slides.flatMap((s) => ["-loop", "1", "-t", String(SLIDE_SECS), "-i", s]);
  // Each xfade eats XFADE_SECS of overlap, so the Nth transition starts at
  // N * (SLIDE - XFADE) — 2.0, 4.0, 6.0 for 2.5s slides with 0.5s crossfades.
  const step = SLIDE_SECS - XFADE_SECS;
  const chain = slides
    .slice(1)
    .map((_, i) => {
      const from = i === 0 ? "[0]" : `[v${i - 1}]`;
      const label = i === slides.length - 2 ? "" : `[v${i}]`;
      const offset = ((i + 1) * step).toFixed(2);
      return `${from}[${i + 1}]xfade=transition=slideleft:duration=${XFADE_SECS}:offset=${offset}${label}`;
    })
    .join(";");
  const filter = `${chain},format=yuv420p,fps=30[v]`;

  await new Promise<void>((resolve, reject) => {
    const p = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        ...inputs,
        "-filter_complex",
        filter,
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-movflags",
        "+faststart",
        out,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const recordPath = args.find((a) => !a.startsWith("--"));
  const doPost = args.includes("--post");
  const asVideo = args.includes("--video");
  if (!recordPath) die("usage: bun scripts/social/post-listing-carousel.ts <record.json> [--post]");

  const record = JSON.parse(await readFile(recordPath, "utf8"));

  // ── 1. Model ──────────────────────────────────────────────────────────────
  const cards = buildCarouselCards(record);
  if (cards.length === 0) {
    die("no usable photos on this record — aborting rather than posting a card with a hole in it");
  }
  const caption = buildCarouselCaption(record);
  console.log(`\n── caption (${caption.length} chars) ──\n${caption}`);
  console.log(`\n── link facets detected: ${detectLinkFacets(caption).length} ──`);
  console.log(`\n── ${cards.length} cards ──`);
  for (const c of cards) {
    console.log(
      `  ${c.index}/${c.total} ${c.role.padEnd(8)} ${c.address} · ${c.specs.join(" · ")}`,
    );
  }

  // ── 2. Render ─────────────────────────────────────────────────────────────
  await mkdir(OUT_DIR, { recursive: true });
  const rendered = [];
  for (const card of cards) {
    const out = await renderListingCard(card);
    if (!out) die(`card ${card.index}/${card.total} failed to render — aborting the whole post`);
    if (out.bytes.length > MAX_BLOB_BYTES) die(`card ${card.index} is ${out.bytes.length} bytes`);
    const file = path.join(OUT_DIR, `slide-${card.index}.jpg`);
    await writeFile(file, out.bytes);
    console.log(`  rendered ${file} — ${out.bytes.length.toLocaleString()} bytes`);
    rendered.push(out);
  }

  // ── 2b. The slideshow — the only shape that reads as a carousel here. ─────
  let videoPath: string | null = null;
  if (asVideo) {
    videoPath = path.join(OUT_DIR, "carousel.mp4");
    const slides = cards.map((c) => path.join(OUT_DIR, `slide-${c.index}.jpg`));
    await encodeSlideshow(slides, videoPath);
    const size = (await readFile(videoPath)).length;
    console.log(`  encoded ${videoPath} — ${size.toLocaleString()} bytes`);
    if (size > 100_000_000) die(`slideshow is ${size} bytes, over the 100 MB lexicon ceiling`);
  }

  if (!doPost) {
    console.log(
      `\n✓ dry run complete — ${rendered.length} cards in ${OUT_DIR}/${videoPath ? " + carousel.mp4" : ""}. Re-run with --post.`,
    );
    return;
  }

  // ── 3. Confirm the account BEFORE posting (handoff §5, wrong-account mode) ─
  const identifier = process.env.BSKY_IDENTIFIER;
  const appPassword = process.env.BSKY_APP_PASSWORD;
  if (!identifier || !appPassword) die("BSKY_IDENTIFIER / BSKY_APP_PASSWORD not set");
  console.log(`\n── posting as: ${identifier} ──`);

  const result = await postToBluesky(
    videoPath
      ? {
          caption,
          video: {
            bytes: new Uint8Array(await readFile(videoPath)),
            mime: "video/mp4",
            alt: cards[0].alt,
            aspectRatio: rendered[0].aspectRatio,
            // autoplay + loop + no chrome == an auto-advancing carousel.
            presentation: "gif",
          },
        }
      : { caption, images: rendered },
    { identifier, appPassword },
  );
  if (!result.ok) die(`post failed: ${result.error}`);
  console.log(`\n✓ posted: ${result.url}`);

  // ── 4. READ IT BACK — the only real acceptance test ───────────────────────
  const post = await readBack(result.uri!);
  const embed = (post.embed ?? {}) as { $type?: string; images?: unknown[]; external?: unknown };
  const rec = (post.record ?? {}) as { embed?: { $type?: string }; facets?: unknown[] };

  console.log("\n── read-back from public.api.bsky.app ──");
  console.log(`  view embed  : ${embed.$type}`);
  console.log(`  record embed: ${rec.embed?.$type}`);
  console.log(`  images      : ${Array.isArray(embed.images) ? embed.images.length : 0}`);
  console.log(`  external    : ${embed.external ? "PRESENT (BUG)" : "none"}`);
  console.log(`  facets      : ${Array.isArray(rec.facets) ? rec.facets.length : 0}`);

  const want = videoPath ? "app.bsky.embed.video" : "app.bsky.embed.images";
  const failures: string[] = [];
  if (rec.embed?.$type !== want) {
    failures.push(`record embed is ${rec.embed?.$type}, not ${want}`);
  }
  if (!embed.$type?.startsWith(want)) {
    failures.push(`view embed is ${embed.$type}, not a ${videoPath ? "video" : "images"} view`);
  }
  if (embed.external) {
    failures.push("an EXTERNAL embed rode along — tapping would navigate away");
  }
  if (videoPath) {
    // presentation:"gif" is the whole difference between a carousel and a
    // video with a play button. Assert it survived the round trip.
    const pres = (rec.embed as { presentation?: string } | undefined)?.presentation;
    if (pres !== "gif") failures.push(`presentation is ${pres}, not "gif" — it will not autoplay`);
    if (!("playlist" in embed)) failures.push("video view carries no playlist — it will not play");
  } else if (!Array.isArray(embed.images) || embed.images.length !== rendered.length) {
    failures.push(
      `expected ${rendered.length} images, read back ${(embed.images as unknown[])?.length ?? 0}`,
    );
  }
  if (!Array.isArray(rec.facets) || rec.facets.length === 0) {
    failures.push("no link facet — the realtor.com url would render as dead text");
  }

  if (failures.length) {
    console.error("\n✗ VERIFICATION FAILED:");
    for (const f of failures) console.error(`   - ${f}`);
    process.exit(1);
  }
  // Say ONLY what the read-back proves. It proves a DATA SHAPE, never a
  // rendering — claiming "carousel" off this JSON is exactly how post
  // 3ms7pytoefj23 shipped as a 2x2 grid while this line called it a carousel.
  console.log(
    videoPath
      ? `\n✓ embed verified: app.bsky.embed.video, presentation="gif", playlist present, link facet present.` +
          `\n  NOT verified here: autoplay/loop in a signed-in feed. OPEN THE POST AND WATCH IT.`
      : `\n✓ embed verified: ${rendered.length} images, no external embed, link facet present.` +
          `\n  NOTE: images render as a mosaic GRID in the official client, NOT a carousel. Use --video.`,
  );
  console.log(`  ${result.url}`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
