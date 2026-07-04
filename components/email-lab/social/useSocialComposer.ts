"use client";
// components/email-lab/social/useSocialComposer.ts
//
// Lifts ALL social-composer state + actions out of the canvas component so the
// right-column "AI assistant" aside (in EmailLabGridShell) can drive the center
// canvas — the email-page layout, mirrored. The canvas (SocialComposer) becomes a
// thin presentational consumer of this handle. Effect-free until an action fires, so
// it's idle/free when the shell is in email mode.
import { useRef, useState } from "react";
import type Konva from "konva";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";
import { newDesign, designToSkeleton, applyDesignPatch } from "@/lib/social/design/serialize";
import type { SocialDesign, SocialElement } from "@/lib/social/design/types";
import { brandingToTokens } from "@/lib/email/brand/branding-to-tokens";
import { mintBlockId } from "@/lib/email/doc/schema";
import { findPlaceholder, type ShowcaseRecipe } from "@/lib/showcase/recipe";

export interface UseSocialComposerArgs {
  scope?: { kind?: string; value?: string };
  projectId?: string;
  branding: Record<string, string>;
  /** Showcase "Make this →" carry for a social-target recipe (see
   *  lib/showcase/recipe.ts recipeDestination). Seeds the prompt box with the
   *  blank still literal in it; `author()` refuses to build until it's gone,
   *  same guard the email lab's Build box has for its own recipes. */
  initialRecipe?: ShowcaseRecipe | null;
}

function isDesign(d: unknown): d is SocialDesign {
  return (
    !!d &&
    typeof d === "object" &&
    (d as SocialDesign).version === 1 &&
    Array.isArray((d as SocialDesign).elements)
  );
}

export function useSocialComposer({
  scope,
  projectId,
  branding,
  initialRecipe,
}: UseSocialComposerArgs) {
  const tokens = brandingToTokens(branding);
  const primary = tokens.PRIMARY ?? "#0f1d24";
  const accent = tokens.ACCENT ?? "#0ea5b7";
  const text = tokens.TEXT ?? "#ffffff";
  const logoUrl = tokens.LOGO_URL;

  // Default to 4:5 portrait — Meta's current recommended feed ratio (first-party
  // ads guide: "Ratio 4:5 · 1440×1800") and Sprout Social concur; square (1:1) is
  // no longer the recommended feed default. Only affects NEW designs — a saved
  // design carries its own `format`, so nothing existing re-renders.
  const [design, setDesign] = useState<SocialDesign>(() => ({
    ...newDesign("portrait"),
    background: primary,
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  // AI state (author + fill share one prompt box + status line)
  const [prompt, setPrompt] = useState(() => initialRecipe?.prompt ?? "");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  // "Make this →" recipe flow — mirrors the email lab's pendingRecipe guard
  // (components/email-lab/EmailLabGridShell.tsx handleUseRecipe/
  // placeholderBlocked): a carried recipe's [[blank]] must be filled before
  // `author()` is allowed to fire, or the build authors the literal bracket
  // text as if it were the user's real listing/farm.
  const [pendingRecipe, setPendingRecipe] = useState<ShowcaseRecipe | null>(
    () => initialRecipe ?? null,
  );
  const [recipeHint, setRecipeHint] = useState<string | null>(() => {
    if (!initialRecipe) return null;
    const ph = findPlaceholder(initialRecipe.prompt);
    return ph ? `Type ${ph.hint} over the highlighted part, then hit Build the post.` : null;
  });

  // caption editor (set after author/fill)
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [variants, setVariants] = useState<Record<string, string>>({});

  // export + schedule
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // photos
  const [promotingPath, setPromotingPath] = useState<string | null>(null);

  const selectedElement = selectedId
    ? (design.elements.find((e) => e.id === selectedId) ?? null)
    : null;

  function setFormat(format: SocialFormat) {
    setDesign((d) => ({ ...d, format }));
  }

  function updateElement(next: SocialElement) {
    setDesign((d) => ({ ...d, elements: d.elements.map((e) => (e.id === next.id ? next : e)) }));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setDesign((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== selectedId) }));
    setSelectedId(null);
  }

  function addElement(type: SocialElement["type"]) {
    const id = mintBlockId();
    const base = { id, x: 80, y: 80, width: 400, height: 120 };
    let el: SocialElement;
    switch (type) {
      case "text":
        el = {
          ...base,
          type: "text",
          text: "Your text",
          fontSize: 56,
          fontFamily: "Arial",
          fill: text,
        };
        break;
      case "stat":
        el = {
          ...base,
          type: "stat",
          height: 200,
          value: "",
          label: "label",
          valueFontSize: 120,
          labelFontSize: 32,
          fill: text,
          accent,
        };
        break;
      case "cta":
        el = {
          ...base,
          type: "cta",
          height: 70,
          text: "Learn more →",
          url: "",
          fill: accent,
          textFill: primary,
          fontSize: 30,
        };
        break;
      case "image":
        el = { ...base, type: "image", height: 400, src: "" };
        break;
      case "logo":
        el = { ...base, type: "logo", width: 240, height: 90, src: logoUrl ?? "" };
        break;
      default:
        return; // chart is author-seeded, not palette-added (placeholder render today)
    }
    setDesign((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(id);
  }

  /** True (and nags) while a carried recipe's [[blank]] is still unfilled. */
  function placeholderBlocked(): boolean {
    if (!pendingRecipe) return false;
    const ph = findPlaceholder(prompt);
    if (!ph) return false;
    setAiError(`Fill in ${ph.hint} first — it's highlighted in the box.`);
    return true;
  }

  // ── AI: author a whole post from one sentence (template-backed) ──────────────
  async function author() {
    if (placeholderBlocked()) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setPendingRecipe(null);
    setRecipeHint(null);
    setAiBusy(true);
    setAiError(null);
    setAiStatus(null);
    try {
      const res = await fetch("/api/email-lab/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: true,
          scope,
          projectId,
          prompt: trimmed,
          format: design.format,
          branding,
        }),
      });
      if (!res.ok) {
        setAiError("Couldn't build the post — try rephrasing.");
        return;
      }
      const data = (await res.json()) as {
        design?: unknown;
        caption?: string;
        hashtags?: string[];
        variants?: Record<string, string>;
      };
      if (!isDesign(data.design)) {
        setAiError("Couldn't build the post — try rephrasing.");
        return;
      }
      setDesign(data.design);
      setSelectedId(null);
      setCaption(data.caption ?? "");
      setHashtags(data.hashtags ?? []);
      setVariants(data.variants ?? {});
      setAiStatus("Built a finished post from one line — edit anything on the canvas.");
    } catch {
      setAiError("Something went wrong — try again.");
    } finally {
      setAiBusy(false);
    }
  }

  // ── AI: fill cited copy into a hand-built canvas (unchanged behavior) ─────────
  async function fill() {
    setAiBusy(true);
    setAiError(null);
    setAiStatus(null);
    try {
      // Seed a text + stat element if the canvas is empty, so there's something to fill.
      let workingDesign = design;
      if (design.elements.length === 0) {
        const id1 = mintBlockId();
        const id2 = mintBlockId();
        workingDesign = {
          ...design,
          elements: [
            {
              id: id1,
              type: "text",
              x: 80,
              y: 80,
              width: 400,
              height: 120,
              text: "Your text",
              fontSize: 56,
              fontFamily: "Arial",
              fill: text,
            },
            {
              id: id2,
              type: "stat",
              x: 80,
              y: 220,
              width: 400,
              height: 200,
              value: "",
              label: "label",
              valueFontSize: 120,
              labelFontSize: 32,
              fill: text,
              accent,
            },
          ],
        };
      }
      const skeleton = designToSkeleton(workingDesign);
      const res = await fetch("/api/email-lab/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, skeleton }),
      });
      if (!res.ok) {
        setAiError("Fill failed — try again.");
        return;
      }
      const data = (await res.json()) as {
        patch?: Record<string, Record<string, unknown>>;
        caption?: string;
        hashtags?: string[];
        variants?: Record<string, string>;
      };
      setDesign(applyDesignPatch(workingDesign, data.patch ?? {}));
      setCaption(data.caption ?? "");
      setHashtags(data.hashtags ?? []);
      setVariants(data.variants ?? {});
      setAiStatus("Filled the canvas with cited figures.");
    } catch {
      setAiError("Something went wrong — try again.");
    } finally {
      setAiBusy(false);
    }
  }

  // ── Photos: drop a real photo into the selected image/logo slot (or add one) ──
  function applyPhotoUrl(url: string) {
    const sel = selectedId ? design.elements.find((e) => e.id === selectedId) : null;
    if (sel && (sel.type === "image" || sel.type === "logo")) {
      updateElement({ ...sel, src: url });
      return;
    }
    const id = mintBlockId();
    const el: SocialElement = {
      id,
      type: "image",
      x: 80,
      y: 80,
      width: 600,
      height: 400,
      src: url,
    };
    setDesign((d) => ({ ...d, elements: [...d.elements, el] }));
    setSelectedId(id);
  }

  async function pickFiledPhoto(storagePath: string) {
    if (!projectId) return;
    setPromotingPath(storagePath);
    try {
      const res = await fetch(`/api/projects/${projectId}/email-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath }),
      });
      if (!res.ok) return;
      const { url } = (await res.json()) as { url: string };
      applyPhotoUrl(url);
    } finally {
      setPromotingPath(null);
    }
  }

  async function uploadNewPhoto(file: File) {
    setPromotingPath("__upload__");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const endpoint = projectId
        ? `/api/projects/${projectId}/email-media`
        : "/api/email-lab/media";
      const res = await fetch(endpoint, { method: "PUT", body: fd });
      if (!res.ok) return;
      const { url } = (await res.json()) as { url: string };
      applyPhotoUrl(url);
    } finally {
      setPromotingPath(null);
    }
  }

  // ── Output: export the canvas to PNG, then schedule the post ─────────────────
  async function exportPng(): Promise<string | null> {
    const stage = stageRef.current;
    if (!stage) return null;
    setExporting(true);
    setExportError(null);
    try {
      if (typeof document !== "undefined" && document.fonts?.ready) await document.fonts.ready;
      const targetW = SOCIAL_FORMATS[design.format].width;
      const pixelRatio = targetW / stage.width();
      let dataUrl: string;
      try {
        dataUrl = stage.toDataURL({ pixelRatio, mimeType: "image/png" });
      } catch {
        setExportError(
          "An image on the canvas blocks export (it's hosted somewhere that doesn't allow it). Use an uploaded photo or one from your library.",
        );
        return null;
      }
      const blob = await (await fetch(dataUrl)).blob();
      const fd = new FormData();
      fd.append("file", blob, "post.png");
      const res = await fetch("/api/email-lab/social/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setExportError("Couldn't save the image — try again.");
        return null;
      }
      const { url } = (await res.json()) as { url: string };
      setMediaUrl(url);
      return url;
    } finally {
      setExporting(false);
    }
  }

  async function openSchedule() {
    const url = mediaUrl ?? (await exportPng());
    if (!url) return; // export error already surfaced
    setScheduleOpen(true);
  }

  const displayWidth = design.format === "story" ? 320 : design.format === "portrait" ? 380 : 460;
  const hasElements = design.elements.length > 0;

  return {
    // canvas
    design,
    selectedId,
    setSelectedId,
    stageRef,
    displayWidth,
    updateElement,
    // ai
    prompt,
    setPrompt,
    author,
    fill,
    aiBusy,
    aiStatus,
    aiError,
    recipeHint,
    // caption
    caption,
    setCaption,
    hashtags,
    variants,
    // elements / palette
    selectedElement,
    addElement,
    deleteSelected,
    setFormat,
    hasElements,
    // photos
    applyPhotoUrl,
    pickFiledPhoto,
    uploadNewPhoto,
    promotingPath,
    // output
    exportPng,
    openSchedule,
    exporting,
    exportError,
    mediaUrl,
    scheduleOpen,
    setScheduleOpen,
  };
}

export type SocialComposerHandle = ReturnType<typeof useSocialComposer>;
