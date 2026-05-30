/**
 * Fixture-mode sentinels — the canonical list of strings that mark a brain
 * artifact as having been rendered against synthetic fixture data instead of
 * live sources. Single-sourced here so the Stage-4 build-time gate
 * (`refinery/stages/4-output.mts`), the speaker runtime backstop
 * (`refinery/render/speaker.mts`), and the packs that EMIT these caveats all
 * agree on the exact wording.
 *
 * Why the gate exists: master lifts its upstreams' committed `--- OUTPUT ---`
 * blocks without re-rendering them (the thin-pipe contract). If an upstream was
 * last built in fixture mode and never re-rendered live, master faithfully
 * ships its "Fixture mode: …" / "synthetic fixture data" caveats to end users.
 * That happened (master v60/v61, 2026-05-30). `hasFixtureSentinel()` lets a
 * LIVE build hard-fail before writing such an artifact, so the leak can never
 * recur silently.
 */
export const FIXTURE_SENTINELS: readonly RegExp[] = [
  /fixture mode:/i,
  /synthetic fixture/i,
];

/** True when `text` contains any fixture-mode sentinel. Stateless — the
 *  patterns carry no `g` flag, so `.test()` is safe to call repeatedly. */
export function hasFixtureSentinel(text: string): boolean {
  return FIXTURE_SENTINELS.some((re) => re.test(text));
}
