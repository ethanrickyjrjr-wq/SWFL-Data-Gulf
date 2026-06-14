# Task 03 — "Save as PDF" buttons (metered `export_print`)

**Files:** `app/project/[id]/page.tsx` (replace S4's `// TODO(S5)` marker), `app/c/[id]/page.tsx`, `app/r/[slug]/page.tsx`.

- [ ] **Step 1:** A small client `PrintButton` island: meters `export_print` (`fetch("/api/meter", {method:"POST", body: JSON.stringify({action:"export_print", report_id})})`) then `window.print()`. Give it `className="print-hide"` so it doesn't appear in the PDF.
- [ ] **Step 2:** Mount it on all three pages (project detail, `/c/[id]`, `/r/[slug]`).
- [ ] **Step 3: Verify** the meter row lands and the print dialog opens with chrome hidden.
- [ ] **Step 4: Commit.** `git add "app/project/[id]/page.tsx" "app/c/[id]/page.tsx" "app/r/[slug]/page.tsx" && git commit -m "feat(pdf): Save-as-PDF buttons, metered export_print"`
