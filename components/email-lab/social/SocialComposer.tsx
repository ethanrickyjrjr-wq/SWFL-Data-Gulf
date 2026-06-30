// components/email-lab/social/SocialComposer.tsx
"use client";
import dynamic from "next/dynamic";
import type { SocialComposerHandle } from "./useSocialComposer";

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
export function SocialComposer({ composer }: { composer: SocialComposerHandle }) {
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
  } = composer;

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
    </div>
  );
}
