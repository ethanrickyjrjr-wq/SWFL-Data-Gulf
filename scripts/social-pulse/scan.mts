// scripts/social-pulse/scan.mts
// SOCIAL PULSE SCANNER. Standalone Bun process the GHA cron invokes.
// DRY_RUN=true reads + logs what it WOULD insert and never writes.
// Exit: clean (incl. zero posts) → 0; top-level fatal (env, client) → 1.
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { PULSE_TERMS } from "@/lib/social-pulse/terms";
import { searchPosts, searchHashtags } from "@/lib/social-pulse/steady-client";
import { runScan, type ScanRowWriter } from "@/lib/social-pulse/scan";

const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  if (!process.env.PHOTOS_API) throw new Error("PHOTOS_API is not set");
  const supabase = createServiceRoleClient();

  const writer: ScanRowWriter = DRY_RUN
    ? {
        insertScan: async () => {
          console.log("[dry] would insert scan row");
          return -1;
        },
        finishScan: async (_id, patch) => console.log("[dry] finish", JSON.stringify(patch)),
        insertPosts: async (rows) => console.log(`[dry] would insert ${rows.length} posts`),
        insertHashtags: async (rows) => console.log(`[dry] would insert ${rows.length} hashtags`),
      }
    : {
        insertScan: async (meta) => {
          const { data, error } = await supabase
            .from("social_pulse_scans")
            .insert({ status: meta.status })
            .select("id")
            .single();
          if (error) throw new Error(`insertScan: ${error.message}`);
          return data.id;
        },
        finishScan: async (scanId, patch) => {
          const { error } = await supabase
            .from("social_pulse_scans")
            .update(patch)
            .eq("id", scanId);
          if (error) throw new Error(`finishScan: ${error.message}`);
        },
        insertPosts: async (rows) => {
          const { error } = await supabase.from("social_pulse_posts").insert(rows);
          if (error) throw new Error(`insertPosts: ${error.message}`);
        },
        insertHashtags: async (rows) => {
          const { error } = await supabase.from("social_pulse_hashtags").insert(rows);
          if (error) throw new Error(`insertHashtags: ${error.message}`);
        },
      };

  const result = await runScan({
    terms: PULSE_TERMS,
    searchPosts,
    searchHashtags,
    writer,
    pagesPerTerm: 2,
    log: (m) => console.log(m),
  });
  console.log(
    `scan ${DRY_RUN ? "(dry) " : ""}done: scan_id=${result.scanId} posts=${result.posts} hashtags=${result.hashtags} weighted_requests=${result.requests}`,
  );

  if (!DRY_RUN && result.scanId > 0) {
    const { computeDigest, isoWeekOf } = await import("@/lib/social-pulse/digest");
    const now = new Date();
    const week = isoWeekOf(now);
    const asOf = `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${now.getUTCFullYear()}`;

    const { data: posts } = await supabase
      .from("social_pulse_posts")
      .select("post_id, permalink, username, media_type, caption, like_count, comment_count, area")
      .eq("scan_id", result.scanId);
    const { data: hashtags } = await supabase
      .from("social_pulse_hashtags")
      .select("name, media_count")
      .eq("scan_id", result.scanId);

    // previous week's hashtag counts for deltas (latest digest before this week)
    const { data: prevDigest } = await supabase
      .from("social_pulse_digest")
      .select("digest")
      .lt("week", week)
      .order("week", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prevHashtags =
      (
        prevDigest?.digest as {
          hashtags?: { name: string; mediaCount: number | null }[];
        } | null
      )?.hashtags?.map((h) => ({ name: h.name, media_count: h.mediaCount })) ?? [];

    const digest = computeDigest({
      scanId: result.scanId,
      asOf,
      week,
      posts: posts ?? [],
      hashtags: hashtags ?? [],
      prevHashtags,
    });
    const { error } = await supabase
      .from("social_pulse_digest")
      .upsert(
        { week, digest, scan_id: result.scanId, built_at: now.toISOString() },
        { onConflict: "week" },
      );
    if (error) throw new Error(`digest upsert: ${error.message}`);
    console.log(`digest upserted for ${week} (scan ${result.scanId})`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
