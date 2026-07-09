"use client";

import { createContext, useContext } from "react";

// Cockpit tab-switch fix: the Email tool tab needs to know which deliverable was
// last opened/saved so its href can carry `?did=` — without it, leaving Email
// (Watch/Social/Overview) and coming back always lands on a fresh/blank doc even
// though the saved one is sitting fine in `deliverables` (spec: 2026-07-09 email
// cockpit bug sweep). ToolFrame seeds this from the DB on first load; the email
// page pushes a fresh value in immediately after every save so it's right even
// before any reload.
export interface LastDidState {
  lastDid: string | null;
  setLastDid: (did: string) => void;
}

export const LastDidContext = createContext<LastDidState | null>(null);

/** Returns null when rendered outside a project ToolFrame (e.g. the standalone,
 *  project-less /email-lab) — callers must handle that case, not assume it's set. */
export function useLastDid(): LastDidState | null {
  return useContext(LastDidContext);
}
