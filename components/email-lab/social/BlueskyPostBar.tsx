// components/email-lab/social/BlueskyPostBar.tsx
//
// "Post to Bluesky" action bar — Task 5 of the post-now build
// (.superpowers/sdd/2026-07-26-bluesky-post-now/). Exports the composer's
// canvas via the re-encode ladder (bluesky-post-bar-logic.ts's shrinkToCap),
// then calls POST /api/social/post-now directly — NOT the OAuth/cron
// schedule lane (see app/api/social/post-now/route.ts's header comment: this
// route posts via an env app-password credential, right now, to
// @swfldatagulf.com).
//
// Its caption + alt fields are intentionally their OWN state, independent of
// the composer's AI-authored caption editor rendered above it in
// SocialComposer.tsx — this is a quick one-off post, not a second view onto
// the same value.
"use client";
import { useState } from "react";
import { MAX_CAPTION_GRAPHEMES } from "@/lib/social/post-now-validate";
import {
  captionState,
  resolveInitialCaption,
  shrinkToCap,
  type ExportImageFn,
} from "./bluesky-post-bar-logic";

export interface BlueskyPostBarProps {
  /** Exports the composer's Konva stage at the given pixelRatio/mimeType/
   *  quality — see bluesky-post-bar-logic.ts's ExportImageFn. Returns null on
   *  export failure (no stage mounted, or a CORS-blocked canvas image). */
  exportImage: ExportImageFn;
  /** Prefill for the alt-text input — the card's headline text when the
   *  composer model has one, else the platform default. Computed by the
   *  caller via bluesky-post-bar-logic.ts's deriveAltDefault. */
  altDefault: string;
  /** One-shot seed for the caption textarea — typically the composer's own
   *  AI-authored caption (SocialComposer.tsx's `caption`), read ONCE at
   *  mount. NOT a live sync: after the seed, this field edits independently
   *  of the caption editor above it (Bluesky's MAX_CAPTION_GRAPHEMES cap may
   *  force trimming a caption that fits elsewhere). See
   *  bluesky-post-bar-logic.ts's resolveInitialCaption. */
  initialCaption?: string;
}

type PostResult = { url: string } | { error: string };

export function BlueskyPostBar({ exportImage, altDefault, initialCaption }: BlueskyPostBarProps) {
  const [caption, setCaption] = useState(() => resolveInitialCaption(initialCaption));
  const [alt, setAlt] = useState(altDefault);
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);

  const { count, overLimit } = captionState(caption);

  async function post() {
    if (posting || overLimit) return;
    setPosting(true);
    setResult(null);
    try {
      const shrunk = shrinkToCap(exportImage);
      if ("error" in shrunk) {
        setResult({ error: shrunk.error });
        return;
      }
      const res = await fetch("/api/social/post-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption, imageDataUrl: shrunk.dataUrl, alt: alt || undefined }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        url?: string;
        error?: string;
      } | null;
      // 200 {ok:true,url,uri} is the only success shape; every failure shape
      // (403/503/400/413/409 {error} · 502 {ok:false,error}) lands here and
      // the server's message is shown verbatim, never rewritten.
      if (!res.ok || data?.ok === false || !data?.url) {
        setResult({ error: data?.error ?? "Something went wrong — try again." });
        return;
      }
      setResult({ url: data.url });
    } catch {
      setResult({ error: "Something went wrong — try again." });
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="shrink-0 border-t border-white/8 bg-[#0b1620] p-4">
      <p className="mb-1 text-[10px] uppercase tracking-[0.15em] text-white/35">Post to Bluesky</p>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        placeholder="Write a caption for Bluesky…"
        className="w-full resize-none rounded bg-[#0a141a] p-2 text-[12px] text-white/80 ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-gulf-teal/50"
      />
      <p className={`mt-1 text-[10px] ${overLimit ? "text-red-400" : "text-white/35"}`}>
        {count}/{MAX_CAPTION_GRAPHEMES}
      </p>
      <input
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        placeholder="Image alt text"
        className="mt-2 w-full rounded bg-[#0a141a] p-2 text-[12px] text-white/80 ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-gulf-teal/50"
      />
      <button
        type="button"
        onClick={() => void post()}
        disabled={posting || overLimit}
        className="mt-2 rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-sm text-gulf-teal transition-colors hover:bg-gulf-teal/20 disabled:opacity-40"
      >
        {posting ? "Posting…" : "Post to Bluesky"}
      </button>
      {result && "error" in result && (
        <p className="mt-2 text-[11px] text-amber-300/80">{result.error}</p>
      )}
      {result && "url" in result && (
        <p className="mt-2 text-[11px] text-gulf-teal/80">
          Posted ✓{" "}
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
            {result.url}
          </a>
        </p>
      )}
    </div>
  );
}
