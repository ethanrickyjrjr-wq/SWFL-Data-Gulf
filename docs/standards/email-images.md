# Email images — remote URL vs data URI vs CID (LOCKED policy)

**Decided 07/05/2026** after the operator saved a showcase email's `05-sold.html` attachment on iPhone
and every image rendered as a blue "?". The file and its image URLs were verified fine (HTTP 200,
`image/webp`) — iOS Quick Look sandboxes saved-file previews and blocks ALL network fetches, so any
remote `<img>` in a saved HTML file shows broken. That incident is a *viewer* property, not a bug, but
it forced the question this doc answers: which image-embedding method belongs on which surface.

Research: crawl4ai (RULE 0.4), 07/05/2026. Evidence also logged in `SESSION_LOG.md` (same date).

---

## The three methods and the evidence

**1. Remote hosted URLs** (`<img src="https://…">`) — what we ship today.
- Works in every major client; the majors (Amazon, GitHub, PayPal) ship linked images on their own
  hosts for both transactional and marketing email (mailtrap.io, embedding-images article).
- Body stays tiny — matters because Gmail clips message bodies over 102 KB (mailtrap.io, email-size).
- Trade-offs: recipient clients may hold images until "load images" is tapped (privacy default in
  Outlook, optional in Gmail/Yahoo), and the email depends on the image host staying alive.

**2. Base64 data URIs** (`<img src="data:image/png;base64,…">`).
- Gmail: **not supported on any platform** — desktop web, iOS, Android, mobile web — retested
  05/2024 (caniemail.com/features/image-base64, raw data file).
- Outlook for Windows 2007–2016: not supported; 2019 partial (no GIF). Apple Mail, Outlook
  macOS/iOS/Android, Yahoo, Proton, Thunderbird: supported.
- The Apple-renders-it/Gmail-strips-it split is a trap: demos perfectly on an iPhone, dies in the
  largest client. Also bloats the body — one hero photo in base64 exceeds Gmail's 102 KB clip alone.

**3. CID attachments** (image attached to the MIME message, referenced `<img src="cid:…">`).
- Resend supports it (`contentId` on an attachment; resend.com/docs embed-inline-images) BUT
  attachments (including inline images) are **not supported on Resend's batch endpoint** — exactly
  where blast sends live. 40 MB total message cap including base64-encoded attachments.
- Known webmail display issues; macOS Mail can render the image as a paperclip attachment instead
  (mailtrap.io). Resend's own docs: "inline images may be rejected by some clients (especially webmail)."

---

## Policy (per surface)

1. **Anything sent through Resend** — remote hosted URLs. Current behavior, unchanged, correct.
   Base64 never (Gmail strips it). CID never (batch-send blocker + webmail issues).
2. **A file the user is meant to SAVE and open offline** (a future "download as file" one-pager, or
   any HTML handed over as an attachment) — data URIs are the only images that survive sandboxed
   viewers (iOS Quick Look blocks all network fetches). No Gmail in that path, so Gmail's ban is moot.
3. **The authoring AI never chooses.** The EmailDoc always stores normal remote HTTPS URLs. The
   render layer owns the format: the send path ships URLs as-is; a download path (if built) runs a
   mechanical inline-images post-pass at render time — fetch each `img src`, swap in the data URI,
   serve the file. One doc, two render modes, zero judgment calls for the model.

---

## Known future errors (follow-ups — tracked in the `checks` ledger, not here)

- **Hotlinked listing photos WILL rot.** Showcase and listing-email heroes point at third-party CDNs
  (e.g. `ap.rdcpix.com`, realtor.com's photo CDN). Listing photos rotate after closings; a scheduled
  or occurrence email that re-sends months later gets red X's. Durable fix: mirror the resolved hero
  photo into our own storage at build time and reference our copy.
  → check `email_hero_mirror_to_storage` [email]
- **Saved-HTML artifacts break in Quick Look today.** Any HTML file we hand a user as a download or
  attachment shows broken images when previewed on iOS. If a download-as-file artifact ships, it
  needs the inline-images (data URI) render pass from policy #3 — until then, hand out hosted links
  (the showcase files are already live under `public/showcase/…`), never raw .html attachments.
  → check `download_artifact_inline_images` [email]

## Sources

- https://www.caniemail.com/features/image-base64/ (raw: github.com/hteumeuleu/caniemail, `_features/image-base64.md`)
- https://mailtrap.io/blog/embedding-images-in-html-email-have-the-rules-changed/
- https://mailtrap.io/blog/email-size/ (Gmail 102 KB clip)
- https://resend.com/docs/dashboard/emails/attachments + /embed-inline-images
