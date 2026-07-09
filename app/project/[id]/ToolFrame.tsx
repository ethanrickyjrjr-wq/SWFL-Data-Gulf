"use client";

import { useState, type ReactNode } from "react";
import { ToolSwitcher } from "./ToolSwitcher";
import { LastDidContext } from "./LastDidContext";

/**
 * Cockpit D1 tool frame. Wraps ToolSwitcher + the tool pages so both can share
 * `lastDid` (the most recently opened/saved block-canvas deliverable) without
 * the layout re-fetching on every tab click — `layout.tsx` seeds it once from
 * the DB (most-recent by `data_as_of`); the email page pushes fresh values in
 * via `useLastDid().setLastDid` right after a save, so a same-session first
 * save is reflected immediately, no reload needed.
 */
export function ToolFrame({
  id,
  initialLastDid,
  children,
}: {
  id: string;
  initialLastDid: string | null;
  children: ReactNode;
}) {
  const [lastDid, setLastDid] = useState<string | null>(initialLastDid);
  return (
    <LastDidContext.Provider value={{ lastDid, setLastDid }}>
      <div className="flex h-full min-h-0 flex-col">
        <ToolSwitcher id={id} lastDid={lastDid} />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </LastDidContext.Provider>
  );
}
