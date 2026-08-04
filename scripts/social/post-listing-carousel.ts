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

async function main() {
  const args = process.argv.slice(2);
  const recordPath = args.find((a) => !a.startsWith("--"));
  const doPost = args.includes("--post");
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

  if (!doPost) {
    console.log(
      `\n✓ dry run complete — ${rendered.length} cards in ${OUT_DIR}/. Re-run with --post.`,
    );
    return;
  }

  // ── 3. Confirm the account BEFORE posting (handoff §5, wrong-account mode) ─
  const identifier = process.env.BSKY_IDENTIFIER;
  const appPassword = process.env.BSKY_APP_PASSWORD;
  if (!identifier || !appPassword) die("BSKY_IDENTIFIER / BSKY_APP_PASSWORD not set");
  console.log(`\n── posting as: ${identifier} ──`);

  const result = await postToBluesky({ caption, images: rendered }, { identifier, appPassword });
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

  const failures: string[] = [];
  if (rec.embed?.$type !== "app.bsky.embed.images") {
    failures.push(`record embed is ${rec.embed?.$type}, not app.bsky.embed.images`);
  }
  if (!embed.$type?.startsWith("app.bsky.embed.images")) {
    failures.push(`view embed is ${embed.$type}, not an images view`);
  }
  if (embed.external) {
    failures.push("an EXTERNAL embed rode along — tapping a photo would navigate away");
  }
  if (!Array.isArray(embed.images) || embed.images.length !== rendered.length) {
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
  console.log(
    `\n✓ verified live: ${rendered.length}-image carousel, no external embed, link facet present.`,
  );
  console.log(`  ${result.url}`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
