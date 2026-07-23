// app/pulse/page.tsx
// SWFL Social Pulse — public weekly digest of what's earning engagement in
// SWFL real-estate Instagram. Anonymous surface (spec §3): current week only.
import Link from "next/link";
import { loadLatestDigest } from "@/lib/social-pulse/load";
import { AREA_LABELS } from "@/lib/social-pulse/terms";

export const revalidate = 3600;

export const metadata = {
  title: "SWFL Social Pulse — what's working in Southwest Florida real-estate social",
  description:
    "Weekly engagement benchmarks, winning formats, and top posts from a live Instagram scan of Southwest Florida real-estate content.",
};

export default async function PulsePage() {
  const latest = await loadLatestDigest();
  if (!latest) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold">SWFL Social Pulse</h1>
        <p className="text-text-secondary mt-4">
          The first weekly scan hasn&apos;t landed yet. Check back shortly.
        </p>
      </main>
    );
  }
  const { digest, narrative } = latest;
  const swfl = digest.benchmarks.find((b) => b.area === "swfl");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold">SWFL Social Pulse</h1>
      <p className="text-text-secondary mt-1 text-sm">
        Live Instagram scan ({digest.asOf}) · SWFL Data Gulf
      </p>

      {swfl ? (
        <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Posts scanned" value={String(swfl.postCount)} />
          <Stat label="Median likes" value={swfl.medianLikes.toLocaleString()} />
          <Stat label="Top-quartile likes" value={swfl.topQuartileLikes.toLocaleString()} />
        </section>
      ) : null}

      {narrative ? <p className="mt-8 leading-relaxed">{narrative}</p> : null}

      {digest.formats.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Formats earning likes this week</h2>
          <ul className="mt-3 space-y-2">
            {digest.formats.map((f) => (
              <li
                key={f.format}
                className="border-gulf-haze/40 flex items-baseline justify-between border-b pb-2"
              >
                <span className="capitalize">{f.format}</span>
                <span className="text-text-secondary text-sm">
                  {Math.round(f.share * 100)}% of posts · median {f.medianLikes.toLocaleString()}{" "}
                  likes
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.topPosts.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Top posts by area</h2>
          <ul className="mt-3 space-y-4">
            {digest.topPosts.map((p) => (
              <li key={p.permalink}>
                <a
                  href={p.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  @{p.username}
                </a>
                <span className="text-text-secondary ml-2 text-sm">
                  {AREA_LABELS[p.area as keyof typeof AREA_LABELS] ?? p.area} ·{" "}
                  {p.likeCount.toLocaleString()} likes · {p.commentCount.toLocaleString()} comments
                  · {p.format}
                </span>
                {p.captionPreview ? (
                  <p className="text-text-secondary mt-1 text-sm">
                    {p.captionPreview}
                    {p.captionTruncated ? "…" : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.hashtags.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Hashtag reach</h2>
          <ul className="mt-3 space-y-2">
            {digest.hashtags.map((h) => (
              <li
                key={h.name}
                className="border-gulf-haze/40 flex items-baseline justify-between border-b pb-2"
              >
                <span>#{h.name}</span>
                <span className="text-text-secondary text-sm">
                  {h.mediaCount != null ? `${h.mediaCount.toLocaleString()} posts` : "—"}
                  {h.deltaFromPrev != null
                    ? ` · ${h.deltaFromPrev >= 0 ? "+" : ""}${h.deltaFromPrev.toLocaleString()} vs prior scan`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {digest.topics?.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-medium">Trending topics</h2>
          <ul className="mt-3 space-y-2">
            {digest.topics.map((t) => (
              <li
                key={t.topic}
                className="border-gulf-haze/40 flex items-baseline justify-between border-b pb-2"
              >
                <span>{t.label}</span>
                <span className="text-text-secondary text-sm">
                  {t.postCount.toLocaleString()} posts · median {t.medianLikes.toLocaleString()}{" "}
                  likes
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-text-secondary mt-12 text-xs">
        Engagement figures are read from public Instagram posts as written — never estimated. Posts
        link to their creators on Instagram.{" "}
        <Link href="/" className="underline underline-offset-2">
          Built by SWFL Data Gulf
        </Link>
        .
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-gulf-haze/60 rounded-lg border p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-text-secondary mt-1 text-xs">{label}</div>
    </div>
  );
}
