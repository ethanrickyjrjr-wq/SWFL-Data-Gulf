# Task 04 — Real-device print verify

**Why:** iOS Safari print fidelity is the known pain point and the operator's users are on phones. Desktop print preview is NOT sufficient (Vendor-First: this surface is real-device, not docs).

- [ ] **Step 1: iOS Safari** — open a `/project/[id]` (or `/r/`) page → Share sheet → Print → pinch-zoom preview → Save to Files as PDF. Confirm: no FAB/dock/ticker/buttons; white bg; charts full-width with non-zero bars; **every citation + freshness token visible**; items don't split awkwardly across pages.
- [ ] **Step 2: Android Chrome** — ⋮ → Share/Print → Save as PDF. Same checklist.
- [ ] **Step 3:** Note any device-specific defect in `SESSION_LOG`; fix or file a follow-up `check` if it can't be fixed in this session.
- [ ] **Step 4:** Ship the session per `../shared/conventions.md`. Build-queue: PDF sub-item → `[x]`.
