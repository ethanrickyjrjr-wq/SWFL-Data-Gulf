// components/email-lab/social/SocialComposer.tsx
"use client";
import dynamic from "next/dynamic";
import { useCallback } from "react";
import { SOCIAL_FORMATS } from "@/lib/social/formats";
import type { SocialComposerHandle } from "./useSocialComposer";
import { BlueskyPostBar } from "./BlueskyPostBar";
import { deriveAltDefault, type ExportImageFn } from "./bluesky-post-bar-logic";

// react-konva is browser-only (it touches `window`); never server-render it.
const KonvaStage = dynamic(() => import("./KonvaStage"), {
  ssr: false,
  loading: () => <div className="p-6 text-xs text-white/40">Loading composer…</div>,
});

/**
 * Canvas-only now: all controls (AI author/fill, inspector, palette, brand, photos,
 * export, schedule) live in the grid shell's right "AI assistant" aside — the email-page
 * layout, mirrored. This component just renders the Konva stage + the caption strip,
 * driven by the shared `useSocialComposer` handle.
 */
export function SocialComposer({
  composer,
  showBlueskyPostBar = false,
}: {
  composer: SocialComposerHandle;
  /** Opt-in, default false. This composer mounts in TWO places — the project
   *  Social tab (ProjectSocialClient.tsx, the spec'd surface for "Post to
   *  Bluesky") AND the client-facing Email Lab grid shell
   *  (EmailLabGridShell.tsx). Only ProjectSocialClient.tsx passes true; the
   *  grid shell must never render this bar. */
  showBlueskyPostBar?: boolean;
}) {
  const {
    design,
    displayWidth,
    selectedId,
    setSelectedId,
    updateElement,
    stageRef,
    caption,
    setCaption,
    hashtags,
    variants,
    hasElements,
  } = composer;

  // Exposes the stage the same way useSocialComposer.ts's exportPng does
  // (stage.toDataURL({ pixelRatio, mimeType })), but parameterized so
  // BlueskyPostBar's re-encode ladder (bluesky-post-bar-logic.ts's
  // shrinkToCap) can ask for progressively cheaper exports. `baseRatio`
  // mirrors exportPng's own `targetW / stage.width()` normalization — the
  // on-screen stage is shrunk to `displayWidth`, so the ladder's pixelRatio
  // (2, 1.5, 1) is a multiple of the format's real publish width, not of the
  // shrunk preview.
  const exportImage: ExportImageFn = useCallback(
    (opts) => {
      const stage = stageRef.current;
      if (!stage) return null;
      const targetW = SOCIAL_FORMATS[design.format].width;
      const baseRatio = targetW / stage.width();
      try {
        return stage.toDataURL({ ...opts, pixelRatio: baseRatio * opts.pixelRatio });
      } catch {
        return null;
      }
    },
    [design.format, stageRef],
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex flex-1 items-center justify-center bg-[#0a141a] p-6">
        <div className="shadow-2xl">
          <KonvaStage
            design={design}
            displayWidth={displayWidth}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={updateElement}
            stageRef={stageRef}
          />
        </div>
      </div>

      {/* Caption editor — appears after Author / Fill */}
      {caption !== "" && (
        <div className="shrink-0 border-t border-white/8 bg-[#0b1620] p-4">
          <p className="mb-1 text-[10px] uppercase tracking-[0.15em] text-white/35">Caption</p>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={4}
            className="w-full resize-none rounded bg-[#0a141a] p-2 text-[12px] text-white/80 ring-1 ring-white/10 focus:outline-none focus:ring-1 focus:ring-gulf-teal/50"
          />
          {hashtags.length > 0 && (
            <p className="mt-1 text-[10px] text-white/40">
              {hashtags.map((h) => `#${h}`).join(" ")}
            </p>
          )}
          {Object.keys(variants).length > 0 && (
            <p className="mt-1 text-[10px] text-white/30">
              Variants: {Object.keys(variants).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Post to Bluesky — opt-in (ProjectSocialClient.tsx's Social tab ONLY;
          EmailLabGridShell.tsx's client-facing grid never passes this true).
          Mirrors the "Export PNG"/"Schedule post" hasElements gate — nothing
          to post from a blank canvas. */}
      {showBlueskyPostBar && hasElements && (
        <BlueskyPostBar
          exportImage={exportImage}
          altDefault={deriveAltDefault(design.elements)}
          initialCaption={caption}
          aspectRatio={SOCIAL_FORMATS[design.format]}
        />
      )}
    </div>
  );
}
