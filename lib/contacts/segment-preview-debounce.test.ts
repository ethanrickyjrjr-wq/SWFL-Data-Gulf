// lib/contacts/segment-preview-debounce.test.ts
//
// Targets contact_picker_no_preview_debounce: rapid condition edits used to
// fire one /api/segments/preview request per keystroke with no debounce,
// flashing whichever intermediate result landed. These tests pin the
// debounce timing logic ContactPickerModal now schedules its fetch through.
import { describe, expect, test } from "bun:test";
import { makeDebouncedRunner } from "./segment-preview-debounce";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("makeDebouncedRunner (contact_picker_no_preview_debounce)", () => {
  test("collapses a burst of schedule() calls into a single run", async () => {
    const runner = makeDebouncedRunner(20);
    let calls = 0;
    runner.schedule(() => calls++);
    runner.schedule(() => calls++);
    runner.schedule(() => calls++);
    await wait(40);
    expect(calls).toBe(1);
  });

  test("cancel() stops a pending run from ever firing", async () => {
    const runner = makeDebouncedRunner(20);
    let calls = 0;
    runner.schedule(() => calls++);
    runner.cancel();
    await wait(40);
    expect(calls).toBe(0);
  });

  test("resets the clock on every schedule() call — fires delayMs after the LAST edit, not the first", async () => {
    const runner = makeDebouncedRunner(30);
    let calls = 0;
    runner.schedule(() => calls++);
    await wait(15);
    runner.schedule(() => calls++); // a second edit before the first would have fired
    await wait(20);
    expect(calls).toBe(0); // only 20ms since the reset — not yet due
    await wait(20);
    expect(calls).toBe(1); // now ~30ms past the reset — fired exactly once
  });
});
