# TASK 11 — Undo/redo history   🟢 SONNET

**Wave:** 1 · **Depends on:** 00 · **Parallel-safe with:** 10, 12, 31, 32
**Owns (only edit these):**
- `lib/email/doc/history.ts`

## Build
Pure, dependency-free functions over an `EmailDoc` history (spec → *Undo/redo*):
```ts
interface DocHistory { past: EmailDoc[]; present: EmailDoc; future: EmailDoc[]; }
const LIMIT = 50;
pushDoc(h, next)  // cap past at LIMIT, clear future
undo(h) / redo(h) // move present between past/future
```
No React here — just the reducer-style helpers. The client (Task 33/40) wires keystroke **coalescing** (push on blur / 500 ms idle) and ⌘Z / ⌘⇧Z.

## Acceptance
- `bun test` green with a unit test: push×3 → undo×2 → redo → correct present; `past` capped at 50.

## Isolation
Imports only the `EmailDoc` type from `lib/email/doc/types.ts`. One file.
