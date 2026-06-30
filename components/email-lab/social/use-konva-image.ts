// components/email-lab/social/use-konva-image.ts
"use client";
import { useEffect, useState } from "react";

type ImageStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Load an image element for Konva with crossOrigin="anonymous" so the canvas stays
 * EXPORTABLE (toDataURL throws SECURITY_ERR on a tainted canvas — vendor-confirmed).
 * Returns [image, status]. A load error resolves to status "error" (caller omits it),
 * never a throw.
 *
 * Status is DERIVED during render (no synchronous setState in the effect body — that
 * trips react-hooks/set-state-in-effect, a hard error here). The effect only kicks off
 * the async load and resolves the outcome in the onload/onerror callbacks, which are
 * deferred — the only place setState is allowed to fire from an effect.
 */
export function useKonvaImage(src: string | undefined): [HTMLImageElement | null, ImageStatus] {
  // Outcomes keyed by the src that produced them, so a src change re-derives "loading"
  // during render without any reset-in-effect.
  const [loaded, setLoaded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!src) return; // nothing to load — render already derives "idle"
    const image = new window.Image();
    // CORS-safe: set BEFORE src so the fetch carries the anonymous flag; keeps the
    // canvas untainted so toDataURL (export) doesn't throw later.
    image.crossOrigin = "anonymous";
    let alive = true;
    image.onload = () => {
      if (alive) setLoaded({ src, img: image });
    };
    image.onerror = () => {
      if (alive) setErroredSrc(src);
    };
    image.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  if (!src) return [null, "idle"];
  if (loaded && loaded.src === src) return [loaded.img, "loaded"];
  if (erroredSrc === src) return [null, "error"];
  return [null, "loading"];
}
