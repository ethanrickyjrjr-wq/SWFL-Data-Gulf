// app/project/SelectedProjectContext.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * The hub's selected-project state (mission-control build 07/16/2026). Lives in
 * the AREA LAYOUT so the rail (layout) and the hub dashboard (page) share one
 * selection — the center project list that used to own it is gone. Plain state,
 * no URL round-trip: selection is a view concern, exactly like the old
 * center-row behavior it replaces.
 */
const Ctx = createContext<{
  selectedId: string | null;
  setSelectedId: (id: string) => void;
} | null>(null);

export function SelectedProjectProvider({
  initialId,
  children,
}: {
  initialId: string | null;
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  return <Ctx.Provider value={{ selectedId, setSelectedId }}>{children}</Ctx.Provider>;
}

/** Null outside the provider (e.g. an unauthenticated render) — callers guard. */
export function useSelectedProject() {
  return useContext(Ctx);
}
