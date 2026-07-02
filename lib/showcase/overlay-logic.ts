import type { Showcase } from "./registry";

/** Content slides + the component-rendered tier slide. */
export function totalSteps(s: Showcase): number {
  return s.slides.length + 1;
}

export function clampStep(step: number, total: number): number {
  return Math.min(Math.max(step, 0), total - 1);
}

export function stepLabel(s: Showcase, step: number): string {
  const total = totalSteps(s);
  const name = step === total - 1 ? "What you get" : s.slides[step].title;
  return `Step ${step + 1} of ${total} · ${name}`;
}
