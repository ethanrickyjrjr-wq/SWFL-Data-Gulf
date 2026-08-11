// .claude/hooks/lib/strikes-guard.mjs — Gate 17's rules, pure.
//
// THE POINT (operator, 08/10/2026: "what is the fucking point of updating strikes
// if no one does anything"): _ASSISTANT/STRIKES.md counted failure shapes, the
// printer painted them red every session, and a session could STILL write the
// third strike, leave `guard: OWED`, and ship. The registry was a diary with a
// ban nobody enforced. This makes the ban mechanical: a shape at 3+ strikes whose
// guard is OWED and names NO tracked home (an open `checks` key) blocks every
// push — not just pushes that touch related files — until the mechanism is built
// (guard flipped to BUILT) or explicitly tracked (`check open: <key>` in the
// guard line, which the session-start printer then surfaces forever).
//
// Format contract parsed here (STRIKES.md's own header states it):
//   `## shape: <slug>` then one `guard: <OWED ...| BUILT ...>` line, then
//   `- strike:` lines.

/** Parse STRIKES.md into [{ slug, guard, strikes }]. Tolerant: a shape with no
 *  guard line parses with guard "" (and counts as unguarded at 3+ strikes —
 *  a malformed registry must not read as a safe one). */
export function parseStrikes(md) {
  const shapes = [];
  let cur = null;
  for (const line of String(md ?? "").split(/\r?\n/)) {
    const shape = /^##\s*shape:\s*(\S+)/.exec(line);
    if (shape) {
      cur = { slug: shape[1], guard: "", strikes: 0 };
      shapes.push(cur);
      continue;
    }
    if (!cur) continue;
    const guard = /^guard:\s*(.*)$/.exec(line);
    if (guard && !cur.guard) cur.guard = guard[1].trim();
    if (/^-\s*strike:/.test(line)) cur.strikes += 1;
  }
  return shapes;
}

/** A guard line counts as TRACKED when it names where the mechanism lives:
 *  either it is BUILT, or its OWED text points at an open checks key
 *  (`check open: <key>` / `Check open: <key>` — both spellings live in the
 *  registry today). */
export function guardIsTracked(guard) {
  const g = String(guard ?? "");
  if (/^BUILT\b/.test(g)) return true;
  return /check\s+open:\s*[a-z0-9_]+/i.test(g);
}

/** The verdict Gate 17 blocks on: shapes at >= minStrikes with an untracked
 *  guard. minStrikes defaults to 3 — RULE 2 §0b's own threshold. */
export function unguardedShapes(shapes, minStrikes = 3) {
  return shapes.filter((s) => s.strikes >= minStrikes && !guardIsTracked(s.guard));
}
