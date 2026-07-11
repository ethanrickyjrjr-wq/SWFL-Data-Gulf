// lib/social/design/types.ts
//
// The serializable canvas-design model. Pure data, no DOM/Konva imports — safe to
// import from the client composer, the AI-fill server route, and lib/social/types.ts.
import type { SocialFormat } from "@/lib/social/formats";

export type SocialElementType = "text" | "image" | "stat" | "chart" | "cta" | "logo";

interface BaseElement {
  id: string;
  type: SocialElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  align?: "left" | "center" | "right";
  fontStyle?: string; // "bold" | "italic" | "bold italic" | "normal"
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string; // public / Storage URL (CORS-safe, same-origin in v1)
}

export interface StatElement extends BaseElement {
  type: "stat";
  value: string; // shown verbatim; the user controls layout, no auto-placeholder
  label: string;
  valueFontSize: number;
  labelFontSize: number;
  fill: string;
  accent: string;
}

export interface ChartElement extends BaseElement {
  type: "chart";
  /** The registry ChartSpec that produced this chart — kept typed `unknown` here
   *  to keep lib/social refinery-free; carried for re-render / coherence context.
   *  null while a manual "Add Chart" is still building. */
  spec: unknown;
  /** The rasterized chart PNG (hosted in email-media, CORS-safe for Konva export).
   *  Mirrors ImageElement.src. Empty/undefined = "still rendering" → placeholder. */
  src?: string;
}

export interface CtaElement extends BaseElement {
  type: "cta";
  text: string;
  url: string; // ride-along link; also injected into the caption
  fill: string;
  textFill: string;
  fontSize: number;
}

export interface LogoElement extends BaseElement {
  type: "logo";
  src: string; // brand logo URL
}

export type SocialElement =
  TextElement | ImageElement | StatElement | ChartElement | CtaElement | LogoElement;

export interface SocialDesign {
  version: 1;
  /** Carries the aspect so the cron knows the publish ratio without re-deriving it. */
  format: SocialFormat;
  background: string;
  elements: SocialElement[];
  /** element id -> metric binding (Phase-2 auto-refresh). Populated when AI fills from a metric. */
  bindings?: Record<string, { metric: string; source?: string }>;
}
