"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Mirrors app/email-lab/AutoCreateProject.tsx for the social entry: a
// signed-in visitor with ZERO projects gets one made for them, then lands on
// its Social tab (not Email) carrying the showcase recipe through.
export function AutoCreateSocialProject({
  recipe = null,
  recipeNeeds = null,
}: {
  recipe?: string | null;
  recipeNeeds?: string | null;
}) {
  const router = useRouter();
  const firedRef = useRef(false); // strict-mode double-fire would create two projects

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const params = new URLSearchParams();
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
        router.replace(data.id ? `/project/${data.id}/social${q}` : "/project");
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
