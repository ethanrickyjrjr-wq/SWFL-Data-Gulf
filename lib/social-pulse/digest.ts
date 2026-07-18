// lib/social-pulse/digest.ts
// Deterministic digest math (spec §2). NO LLM here — every figure a user sees
// is computed in this file from stored scan rows.
import { classifyTopic, TOPIC_LABELS, type PulseTopic } from "./topics";
import { AREA_LABELS, type PulseArea } from "./terms";

type PostInsertLike = {
  post_id: string;
  permalink: string;
  username: string;
  media_type: number | null;
  caption: string | null;
  like_count: number | null;
  comment_count: number | null;
  area: string;
};
type HashtagInsertLike = { name: string; media_count: number | null };

export interface PulseDigest {
  week: string;
  asOf: string; // MM/DD/YYYY, stated once by the renderer
  scanId: number;
  benchmarks: {
    area: string;
    label: string;
    medianLikes: number;
    topQuartileLikes: number;
    postCount: number;
  }[];
  formats: {
    format: "image" | "video" | "carousel" | "unknown";
    share: number;
    medianLikes: number;
  }[];
  topPosts: {
    area: string;
    permalink: string;
    username: string;
    likeCount: number;
    commentCount: number;
    format: string;
    captionPreview: string | null;
    /** True when the original caption was longer than the 140-code-point preview. */
    captionTruncated: boolean;
  }[];
  hashtags: { name: string; mediaCount: number | null; deltaFromPrev: number | null }[];
  topics: { topic: string; label: string; postCount: number; medianLikes: number }[];
}

export function medianOf(nums: number[]): number {
  return quantileOf(nums, 0.5);
}

/** Nearest-rank quantile; empty input → 0. */
export function quantileOf(nums: number[], q: number): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(q * sorted.length));
  return sorted[rank - 1];
}

export function isoWeekOf(date: Date): string {
  // ISO-8601 week number (UTC)
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Code-point-safe caption preview: naive String.slice cuts UTF-16 units and can
// split an emoji surrogate pair — the lone surrogate is invalid JSON and Postgres
// rejects the whole digest ("Empty or invalid json", seen live on scan 1). Also
// strips \u0000, which jsonb never accepts.
export function previewOf(caption: string | null): string | null {
  if (!caption) return null;
  return Array.from(caption.replace(/\u0000/g, ""))
    .slice(0, 140)
    .join("");
}

/** True when previewOf() actually cut the caption short — the sibling flag
 *  callers need so they only render a truncation ellipsis when one is real. */
export function previewTruncated(caption: string | null): boolean {
  if (!caption) return false;
  return Array.from(caption.replace(/\u0000/g, "")).length > 140;
}

function formatOf(mediaType: number | null): "image" | "video" | "carousel" | "unknown" {
  if (mediaType === 1) return "image";
  if (mediaType === 2) return "video";
  if (mediaType === 8) return "carousel";
  return "unknown";
}

export function computeDigest(input: {
  scanId: number;
  asOf: string;
  week: string;
  posts: PostInsertLike[];
  hashtags: HashtagInsertLike[];
  prevHashtags?: HashtagInsertLike[];
}): PulseDigest {
  const withLikes = input.posts.filter((p) => typeof p.like_count === "number");
  const likesOf = (list: PostInsertLike[]) => list.map((p) => p.like_count as number);

  // "swfl"-term posts belong only to the overall entry appended below — including
  // them as a per-area bucket would shadow the true SWFL-wide benchmark in the dedupe.
  const areas = [...new Set(input.posts.map((p) => p.area))].filter((a) => a !== "swfl");
  const benchmarks = [
    ...areas.map((area) => {
      const rows = withLikes.filter((p) => p.area === area);
      return {
        area,
        label: AREA_LABELS[area as PulseArea] ?? area,
        medianLikes: medianOf(likesOf(rows)),
        topQuartileLikes: quantileOf(likesOf(rows), 0.75),
        postCount: rows.length,
      };
    }),
    {
      area: "swfl",
      label: AREA_LABELS.swfl,
      medianLikes: medianOf(likesOf(withLikes)),
      topQuartileLikes: quantileOf(likesOf(withLikes), 0.75),
      postCount: withLikes.length,
    },
  ];

  const formats = (["image", "video", "carousel", "unknown"] as const)
    .map((format) => {
      const rows = withLikes.filter((p) => formatOf(p.media_type) === format);
      return {
        format,
        share: withLikes.length ? rows.length / withLikes.length : 0,
        medianLikes: medianOf(likesOf(rows)),
      };
    })
    .filter((f) => f.share > 0);

  const topPosts = [...areas, "swfl"].flatMap((area) =>
    withLikes
      .filter((p) => p.area === area)
      .sort((a, b) => (b.like_count as number) - (a.like_count as number))
      .slice(0, 3)
      .map((p) => ({
        area,
        permalink: p.permalink,
        username: p.username,
        likeCount: p.like_count as number,
        commentCount: p.comment_count ?? 0,
        format: formatOf(p.media_type),
        captionPreview: previewOf(p.caption),
        captionTruncated: previewTruncated(p.caption),
      })),
  );

  const prev = new Map((input.prevHashtags ?? []).map((h) => [h.name, h.media_count]));
  const hashtags = input.hashtags.map((h) => {
    const prevCount = prev.get(h.name);
    return {
      name: h.name,
      mediaCount: h.media_count,
      deltaFromPrev:
        typeof h.media_count === "number" && typeof prevCount === "number"
          ? h.media_count - prevCount
          : null,
    };
  });

  const byTopic = new Map<PulseTopic, PostInsertLike[]>();
  for (const p of withLikes) {
    const topic = classifyTopic(p.caption);
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), p]);
  }
  const topics = [...byTopic.entries()]
    .filter(([topic]) => topic !== "other")
    .map(([topic, rows]) => ({
      topic,
      label: TOPIC_LABELS[topic],
      postCount: rows.length,
      medianLikes: medianOf(likesOf(rows)),
    }))
    .sort((a, b) => b.postCount - a.postCount);

  return {
    week: input.week,
    asOf: input.asOf,
    scanId: input.scanId,
    benchmarks,
    formats,
    topPosts,
    hashtags,
    topics,
  };
}
