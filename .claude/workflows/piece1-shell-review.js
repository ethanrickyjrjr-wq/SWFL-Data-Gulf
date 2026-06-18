export const meta = {
  name: "piece1-shell-review",
  description: "Adversarial review of FINAL BOSS Piece 1 §D/§E/§F/§G/§I workspace-shell build",
  phases: [{ title: "Review" }, { title: "Verify" }],
};

const REPO = "C:\\Users\\ethan\\dev\\brain-platform";

const CHANGED_FILES = `
NEW:
- lib/project/derive-name.ts (+ derive-name.test.ts)        [§G auto-naming]
- components/ui/Modal.tsx                                     [§D portal modal]
- components/project/ProjectSearch.tsx                        [§F bottom-bar search "Add to project"]
- lib/deliverable/template-labels.ts                          [shared label map]
- app/project/[id]/workspace/DeliverableThumbnail.tsx        [§D built-lane card]
- app/project/[id]/workspace/DeliverableModal.tsx            [§D open-big iframe]
MODIFIED:
- lib/briefcase/pill-mount.ts (+ test)                        [§D enabler: suppress AI pill on /p/*]
- app/project/layout.tsx                                      [§F: mount ProjectSearch + build search index]
- app/project/[id]/page.tsx                                   [load ui_state, email_schedules, enriched deliverables, parse ?seed=]
- app/project/[id]/ProjectWorkspace.tsx                       [thread ui_state/emailSchedules/seed; seed banner; runBuild overrides; non-dirty server-items reconciliation]
- app/project/[id]/workspace/types.ts                         [DeliverableRow+exec_summary/preview_chart, EmailScheduleRow, ProjectUiState, SearchEntry]
- app/project/[id]/workspace/DeliverableLanes.tsx            [§D built thumbnails + emailing lane]
- app/project/[id]/workspace/ConnectMcpBlock.tsx            [§E three modes via ui_state.mcp_dismissed_count + disconnect confirm]
- app/project/[id]/workspace/BrandingBlock.tsx              [§E collapse on save]
- app/api/projects/import/route.ts                           [§G derive title when absent]
- app/api/claim/route.ts                                     [§G derive title fallback]
`;

const SPEC = `
Source of truth: ${REPO}\\FINAL BOSS\\01-piece-1-workspace-shell.md (sections D,E,F,G,I) and 00-MASTER-PLAN.md (journeys J1-J4).
Key locked constraints:
- react-hooks/set-state-in-effect is a BUILD-BLOCKING ESLint error — collapse/dismiss/reconcile must use lazy useState + event handlers or "set state during render", NEVER props->state in an effect.
- Persistence: never add key={pathname} above the AI/pill (would remount).
- §D: built lane = live compact mini-render thumbnails opening big in a modal (P1 = <iframe src=/p/[id]>); emailing lane = schedule-driven cards (email_schedules has NO deliverable_id); live "this week's email" render is DEFERRED to P4.
- §E: branding collapses when filled + on save; MCP open until mcp_key!=null (connected) OR ui_state.mcp_dismissed_count>=2 (collapsed); connected-state derives from mcp_key NEVER ui_state; disconnect = confirm -> DELETE mcp-key. ui_state is additive-keys-only.
- §F: search reports (BRAIN_CATALOG) + charts (saved_charts), "Add" appends a ProjectItem via the {items} PATCH path; bottom bar in the layout (persists across switches).
- §G: deriveProjectName(items) pure; brand follows EVERY creation path (already via apply-brand); auto-name on import + claim.
- §I: seed-on-load ?seed= pre-stages a build; the LLM auto-fire/selective pre-build is P2, NOT P1.
`;

phase("Review");

const DIMENSIONS = [
  {
    key: "react-next",
    prompt: `Read-only REACT/NEXT correctness review of a Next.js (App Router, React 19) change in ${REPO}.
${CHANGED_FILES}
${SPEC}
Read each NEW + MODIFIED file. Hunt specifically for:
1. react-hooks/set-state-in-effect violations OR any props->state effect (build-blocking). Inspect ProjectWorkspace's "set state during render" reconciliation (initialItems !== serverItems): can it infinite-loop? Does it correctly converge? Does it clobber unsaved edits?
2. Hydration mismatch risk in components/ui/Modal.tsx (createPortal + typeof document guard) and anywhere else.
3. RSC/client boundary: page.tsx (server) passes seed/preview_chart/charts/emailSchedules/uiState to ProjectWorkspace (client) — all JSON-serializable? Any function/Date/class leaking across the boundary?
4. Event bubbling in DeliverableThumbnail: does clicking Revoke or SendWeeklyHandle accidentally trigger the open-modal button? (Check nesting.)
5. router.refresh() correctness for the search-Add and revoke flows given useState-initialized children.
6. Any client component importing server-only code, or a "use client" file importing something that breaks the client bundle (e.g. BRAIN_CATALOG, gazetteer) — note ProjectSearch imports only a type; layout (server) imports BRAIN_CATALOG.
Report concrete findings only (file:line). For each: severity (bug|polish), what's wrong, and the fix. If a concern is actually fine, do NOT report it.`,
  },
  {
    key: "spec",
    prompt: `Read-only SPEC-COMPLIANCE review in ${REPO}. Read the spec docs "FINAL BOSS\\01-piece-1-workspace-shell.md" (§D,§E,§F,§G,§I) and "FINAL BOSS\\00-MASTER-PLAN.md" (J1-J4), THEN read the changed files.
${CHANGED_FILES}
${SPEC}
For EACH of §D, §E, §F, §G, §I: does the implementation satisfy the locked decisions + acceptance bar? Flag any MISSED requirement or a place the code contradicts the spec. Specifically check:
- §D: thumbnails open big in a modal; emailing lane is schedule-driven cards; SendWeeklyHandle still reachable; kill-switch (revoke) preserved.
- §E: branding collapses on save AND when pre-filled; MCP collapses at dismissed_count>=2 and when keyed; connected derives from key not ui_state; disconnect confirms.
- §F: search surfaces reports + charts; Add persists via {items} PATCH; bar is in the layout (persists).
- §G: deriveProjectName wired into import AND claim; brand still applied on all paths (not regressed).
- §I: ?seed= pre-stages a one-click build, does NOT auto-fire an LLM build (P1 boundary).
Report only real gaps (file:line + which spec line). If a section is fully satisfied, say so briefly.`,
  },
  {
    key: "logic",
    prompt: `Read-only LOGIC / EDGE-CASE review in ${REPO}. Read the changed files (esp. lib/project/derive-name.ts, components/project/ProjectSearch.tsx, app/project/[id]/page.tsx, ProjectWorkspace.tsx, DeliverableLanes.tsx, ConnectMcpBlock.tsx).
${CHANGED_FILES}
${SPEC}
Hunt for real defects:
1. derive-name: ZIP regex false positives/negatives; topic precedence; the "most specific place" scan; the dated UTC fallback; empty/whitespace title handling in import/claim.
2. ProjectSearch read-modify-write: race vs unsaved local edits; crypto.randomUUID availability; PATCH item shape valid vs projectItemsSchema (report {kind,slug,title}+base, chart {kind,chart_id,title}+base, origin "web"); behavior when no active project (on /project list).
3. page.tsx: preview_chart extraction (frames vs charts); exec_summary null-safety; email_schedules status filter (.neq stopped) — does it correctly show active+paused; searchParams parsing of seed/scope.
4. ConnectMcpBlock: the three-mode state machine — can a user get stuck? does dismiss persist correctly? mint->connected transition shows snippet? disconnect resets state?
5. Emailing lane cadence/hour formatting correctness (day_of_week index, am/pm, 12am/12pm edge).
Report only real bugs (file:line + the failing scenario + fix). Skip nitpicks.`,
  },
];

const reviews = await parallel(
  DIMENSIONS.map(
    (d) => () =>
      agent(d.prompt, {
        label: `review:${d.key}`,
        phase: "Review",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["findings"],
          properties: {
            findings: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["severity", "file", "title", "detail", "fix"],
                properties: {
                  severity: { type: "string", enum: ["bug", "spec-gap", "polish"] },
                  file: { type: "string" },
                  line: { type: "string" },
                  title: { type: "string" },
                  detail: { type: "string" },
                  fix: { type: "string" },
                },
              },
            },
          },
        },
      }),
  ),
);

const allFindings = reviews
  .filter(Boolean)
  .flatMap((r, i) => (r.findings || []).map((f) => ({ ...f, dim: DIMENSIONS[i].key })));

log(`Collected ${allFindings.length} candidate findings; verifying adversarially…`);

phase("Verify");

const verified = await parallel(
  allFindings.map(
    (f) => () =>
      agent(
        `Adversarially VERIFY this code-review finding against the ACTUAL code in ${REPO}. Open the file and read the relevant lines yourself. Default to isReal=false unless you can demonstrate the defect is genuine and material (would cause a wrong result, a build/runtime failure, or a real spec violation — not a style preference).
FINDING:
- severity: ${f.severity}
- file: ${f.file}${f.line ? " line " + f.line : ""}
- title: ${f.title}
- detail: ${f.detail}
- proposed fix: ${f.fix}
Verify whether the defect actually exists in the current code. Quote the lines that prove your verdict.`,
        {
          label: `verify:${f.file.split("/").pop()}`,
          phase: "Verify",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["isReal", "reasoning", "severity"],
            properties: {
              isReal: { type: "boolean" },
              reasoning: { type: "string" },
              severity: { type: "string", enum: ["bug", "spec-gap", "polish", "not-a-bug"] },
            },
          },
        },
      ).then((v) => ({ ...f, verdict: v })),
  ),
);

const confirmed = verified.filter(Boolean).filter((f) => f.verdict?.isReal);
const dismissed = verified.filter(Boolean).filter((f) => !f.verdict?.isReal);

return {
  confirmed_count: confirmed.length,
  dismissed_count: dismissed.length,
  confirmed: confirmed.map((f) => ({
    severity: f.verdict.severity,
    file: f.file,
    line: f.line,
    title: f.title,
    detail: f.detail,
    fix: f.fix,
    why_real: f.verdict.reasoning,
  })),
  dismissed_titles: dismissed.map((f) => `${f.file}: ${f.title} — ${f.verdict.reasoning}`),
};
