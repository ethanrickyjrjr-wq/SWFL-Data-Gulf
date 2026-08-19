// NORTH-STAR renderer — the guard for the "always a different answer" shape
// (operator, 08/19/2026: "BUT IT'S ALWAYS A DIFFERENT ANSWER FROM YOU!!! AND WHY ARE WE
// NOT ACTIVELY DOING THESE THINGS OR BRINGING IT UP!!!"). Sessions re-diagnosed from
// scratch because nothing forced the standing plan in front of them; this prints
// _ASSISTANT/NORTH-STAR.md verbatim at the TOP of session start.
//
// Verbatim by design: the file is the contract (≤60 lines by its own rule), so no
// parsing to drift out of sync with it. The cap is a backstop against the file itself
// bloating — past MAX_LINES it truncates loudly instead of silently eating the session's
// context, because an oversized standing plan is the disease this guard treats.

export const MAX_LINES = 80;

export function renderNorthStar(text) {
  const body = text.replace(/\s+$/, "");
  if (body === "") return "";
  const lines = body.split("\n");
  const shown = lines.slice(0, MAX_LINES);
  const out = [];
  out.push("========================================================================");
  out.push("NORTH STAR — the standing plan. CONTINUE IT; a fresh diagnosis is the defect.");
  out.push("========================================================================");
  out.push(...shown);
  if (lines.length > MAX_LINES) {
    out.push(
      `  ⚠ TRUNCATED at ${MAX_LINES} of ${lines.length} lines — NORTH-STAR.md has bloated past its own ≤60-line rule; shrink it.`,
    );
  }
  return out.join("\n") + "\n";
}
