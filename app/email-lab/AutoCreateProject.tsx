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
}: {
  zip?: string | null;
  recipe?: string | null;
  recipeNeeds?: string | null;
}) {
  const router = useRouter();
  const firedRef = useRef(false); // strict-mode double-fire would create two projects

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const params = new URLSearchParams();
    if (zip && /^\d{5}$/.test(zip)) params.set("zip", zip);
    if (recipe) params.set("recipe", recipe);
    if (recipeNeeds) params.set("recipeNeeds", recipeNeeds);
    const q = params.size > 0 ? `?${params.toString()}` : "";
    fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
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
