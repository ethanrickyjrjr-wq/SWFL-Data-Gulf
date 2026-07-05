# Lane-4 prompt anchors + menu-label fidelity + real unsubscribe binding

**Date:** 2026-07-05 · **Check:** `lab_email_truth_guards_live_verify` · **Plan:** `docs/superpowers/plans/2026-07-05-lab-email-truth-guards.md`

## Problem

Three residual defects from the 07/05/2026 Rainbow Meadows live send (operator: "fix it all"; the send-surface wave `2026-07-05-send-surface-hardening-design.md` fixed the other three):

1. **The author engine strips the user's own address/figures.** `lintAuthoredProse` anchors only on menu + chart numbers, so "16447 Rainbow Meadows Ct" (a bare number token) is dropped from every prose field — a listing recipe cannot name the listing it was built for. The address survived only in photo-overlay fields, which the lint doesn't walk. Four-lane rule: a figure the user typed (lane 4) is a legitimate source, never strippable.
2. **Stat labels are unaccountable.** A stats cell's VALUE is id-selected from the menu (anchored), but its LABEL is authored free text (`s.label ?? ""`, author-doc.ts:584). The first Rainbow build dressed the ZIP's real median list price as this home's "List Price" — real number, false attribution. Same hole on the hero label.
3. **The doc footer's dead `#unsubscribe` link ships in real sends.** `FooterBlock` renders `props.unsubscribeUrl` (default `#unsubscribe`) verbatim; the injected per-recipient footer beside it is real, but the in-body one is a dead link and a CAN-SPAM smell.

## Goal

A lab email can always name the property the user asked about; an id-selected figure carries its own honest label; every unsubscribe link in sent HTML resolves.

## What we're building

- **A — prompt anchors (lane 4):** `promptAnchors(prompt)` (= `extractNumbers(prompt)`) joins the author lint's anchor set in `authorDoc`. Recorded-claim gating unchanged: a prompt number still can't be dressed as "sold for $X" — recorded anchors stay menu-derived.
- **B — menu-label fidelity:** when a stats cell or hero VALUE resolves via `value_figure`, the cell/hero LABEL becomes the menu figure's own label verbatim (clamped to schema maxima: 60 stats / 80 hero). Authored labels apply only to qualitative/literal cells. The author system prompt states this so the model doesn't fight it.
- **C — unsubscribe binding:** pure `bindUnsubscribeHref(html, href)` replaces the footer's literal `#unsubscribe` target. Blast route binds the per-recipient unsubscribe URL; the scheduled EmailDoc lane (`buildEmailDocOccurrence`) and weekly-read (`finalizeIssueHtml`) bind the Resend `{{{RESEND_UNSUBSCRIBE_URL}}}` token their send paths already substitute per-recipient. A user-set real unsubscribe URL contains no `#unsubscribe` → no-op.

Out of scope: visual polish L1–L5 (already specced in `2026-07-05-agent-launch-campaign-design.md`); the author engine's web/upload gap-fill lanes (documented follow-up in build-doc.ts).

## Live-verify (operator, post-deploy)

Rebuild the Rainbow Meadows recipe email: the address appears in prose; every id-selected stat carries its menu label; the delivered email's in-body unsubscribe link resolves. Close `lab_email_truth_guards_live_verify`.
