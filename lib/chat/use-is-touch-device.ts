"use client";

import { useSyncExternalStore } from "react";

/**
 * True on coarse-pointer (touch) devices — phones/tablets with no reliable
 * Shift modifier, where "Enter submits, Shift+Enter for a new line" isn't
 * achievable. Chat inputs use this to let Enter insert a newline on touch
 * devices instead, leaving the send button as the only way to submit.
 *
 * Read via useSyncExternalStore so the SERVER snapshot is always false and the
 * real client value lands AFTER hydration — no mismatch, and no
 * set-state-in-effect (this repo hard-errors on both). Same pattern as
 * AiBriefcasePill.tsx / use-ai-context.ts / PhoneContactPicker.tsx.
 */
const noopSubscribe = () => () => {};
function touchSnapshot(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(noopSubscribe, touchSnapshot, () => false);
}
