import type { ClaimSeed } from "./claim-store";

/**
 * Build the post-claim landing URL. With a seed, replays the existing §I
 * `/project/[id]?seed=<template>&scope_kind=&scope_value=` mechanism so the claimed
 * project lands pre-staging a deliverable; without one, the bare project URL.
 * Pure — used by ClaimOnLogin after /api/claim returns `{ id, seed }`.
 */
export function claimRedirectUrl(id: string, seed?: ClaimSeed | null): string {
  if (!seed?.template) return `/project/${id}`;
  const p = new URLSearchParams();
  p.set("seed", seed.template);
  if (seed.scopeKind) p.set("scope_kind", seed.scopeKind);
  if (seed.scopeValue) p.set("scope_value", seed.scopeValue);
  return `/project/${id}?${p.toString()}`;
}
