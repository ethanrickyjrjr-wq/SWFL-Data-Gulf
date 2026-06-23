"use client";

import { useSyncExternalStore } from "react";

/**
 * Module-level store — tracks whether the CURRENT /p/* page is being viewed by its
 * owner. Lets the app-root GlobalHighlighter (a sibling of the page in the React tree)
 * know it should mount, even though /p/* is normally suppressed as a white-label route.
 *
 * Mirrors report-context-store.ts — a module-level boolean with useSyncExternalStore
 * binding. The per-page DeliverableOwnerBridge writes it; GlobalHighlighter reads it.
 */

let active = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function getDeliverableOwnerActive(): boolean {
  return active;
}

export function setDeliverableOwnerActive(value: boolean): void {
  if (active === value) return;
  active = value;
  notify();
}

export function subscribeDeliverableOwner(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeliverableOwnerActive(): boolean {
  return useSyncExternalStore(subscribeDeliverableOwner, getDeliverableOwnerActive, () => false);
}

/** Test-only: reset module state between cases. */
export function __resetDeliverableOwnerForTest(): void {
  active = false;
  listeners.clear();
}
