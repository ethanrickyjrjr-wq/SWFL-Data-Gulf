// lib/contacts/segment-preview-debounce.ts
//
// Debounced trigger for ContactPickerModal's server-side segment-preview
// fetch (checks_burndown finding contact_picker_no_preview_debounce): the
// filter-effect used to fire one `/api/segments/preview` request per condition
// edit with no debounce, so rapid edits visibly flashed each intermediate
// result before the final one landed. `schedule(run)` collapses a burst of
// calls into a single `run` fired `delayMs` after the LAST call; `cancel`
// clears any still-pending run (used on unmount / when the filter clears). A
// plain closure — same shape as `makeAutosaveScheduler` in
// lib/lab-entry/use-autosave.ts — so the timing logic is testable without
// mounting the component.
const DEFAULT_DELAY_MS = 300;

export function makeDebouncedRunner(delayMs = DEFAULT_DELAY_MS): {
  schedule: (run: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(run) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
