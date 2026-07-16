// lib/lab-entry/seed-start.ts
//
// THE ONE decision for what a template pick does (spec
// 2026-07-16-seed-capture-or-blank-design.md). Pure. planArrival's seed branch
// and the gallery's in-place pick both call this — the matrix cannot drift
// between the URL door and the click door.
import type { SeedSubject } from "@/lib/email/doc/default-docs";

export type SeedStartPlan =
  | { mode: "build"; subjectValue: string | null }
  | { mode: "ask"; inputKind: "address" | "area" }
  | { mode: "choice" }
  | { mode: "blank" };

const known = (s: string | null) => {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
};

export function planSeedStart(input: {
  subject: SeedSubject;
  knownAddress: string | null;
  knownArea: string | null;
  blankChosen: boolean;
}): SeedStartPlan {
  if (input.blankChosen) return { mode: "blank" };
  if (input.subject === "none") return { mode: "choice" };
  const value = input.subject === "address" ? known(input.knownAddress) : known(input.knownArea);
  if (value) return { mode: "build", subjectValue: value };
  return { mode: "ask", inputKind: input.subject };
}
