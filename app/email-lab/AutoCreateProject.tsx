"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { projectEmailLabBase } from "@/lib/lab-entry/destination";

// Cockpit D4 — a signed-in lab visitor with ZERO projects gets one made for
// them via POST /api/projects (tokenless; the saved brand profile applies
// server-side). Redirect race / create failure falls back to /project.
// A homepage-map ?zip= or a showcase ?recipe=/?recipeNeeds= rides through so
// the fresh project's Email tab opens with the ZIP prebuild or the recipe
// prompt ready.
export function AutoCreateProject({
  zip = null,
  recipe = null,
  recipeNeeds = null,
  rkey = null,
  addr = null,
  seed = null,
  blank = false,
}: {
  zip?: string | null;
  recipe?: string | null;
  recipeNeeds?: string | null;
  /** The recipe KEY — the deliverable's identity, carried into the fresh project. */
  rkey?: string | null;
  addr?: string | null;
  /** A template pick (?seed=) rides into the fresh project's capture-or-blank arrival. */
  seed?: string | null;
  blank?: boolean;
}) {
  const router = useRouter();
  const firedRef = useRef(false); // strict-mode double-fire would create two projects

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const params = new URLSearchParams();
    if (zip && /^\d{5}$/.test(zip)) params.set("zip", zip);
    if (recipe) params.set("recipe", recipe);
    if (rkey) params.set("rkey", rkey);
    if (recipeNeeds) params.set("recipeNeeds", recipeNeeds);
    if (addr) params.set("addr", addr);
    if (seed) {
      params.set("seed", seed);
      if (blank) params.set("blank", "1");
    }
    const q = params.size > 0 ? `?${params.toString()}` : "";
    // An address arrival is a listing project — persist the subject on the row
    // (not just in the redirect query) so the address lane survives return visits.
    fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(addr ? { title: addr, kind: "listing", subject_address: addr } : {}),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("create failed"))))
      .then((data: { id?: string }) => {
        router.replace(data.id ? `${projectEmailLabBase(data.id)}${q}` : "/project");
      })
      .catch(() => router.replace("/project"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center">
      <p className="flex items-center gap-2 text-sm text-white/50">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-gulf-teal" />
        Setting up your project…
      </p>
    </div>
  );
}
