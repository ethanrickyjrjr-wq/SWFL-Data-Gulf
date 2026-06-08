# Highlighter UX Session — 2026-06-07 Handoff

**Status:** Merged to `main`. `HIGHLIGHTER_UI=1` flipped ON in Vercel production as of this session.

---

## What Was Built (PRs #68 + #69)

The Highlighter is an in-page AI layer on every `/r/[slug]` report page. Users select text or numbers → a popup appears → they ask questions grounded in the live SWFL dossier. It is behind the `HIGHLIGHTER_UI` env flag (now ON).

Components:
- `components/highlighter/HighlighterLayer.tsx` — single mount point, sibling of report content
- `components/highlighter/HighlightPopup.tsx` — fact popup (compose → answer flow)
- `components/highlighter/AskAiDock.tsx` — persistent bottom-right chat dock
- `components/highlighter/AskAiFab.tsx` — floating action button that opens the dock
- `components/highlighter/DiscoveryTicker.tsx` — ambient awareness ticker
- `components/highlighter/FirstTouchHint.tsx` — coachmark on first load
- `lib/highlighter/use-highlight.ts` — selection engine
- `lib/highlighter/use-converse.ts` — SSE streaming hook
- `lib/highlighter/converse.ts` — API call logic
- `app/api/converse/route.ts` — Haiku-backed streaming endpoint

---

## What Was Done This Session

### Selection Engine Fixes (`use-highlight.ts`)

**Problems seen:**
- Popup fired mid-drag (while mouse still held)
- Words cut off mid-character ("national macro (be", "ude). Note")
- Garbage selections (fragments, mid-word starts) showed broken popups
- Large blob selections (whole table) showed raw text as title

**Fixes applied:**
1. `mouseIsDown` guard — `selectionchange` no longer fires snapshot while mouse button is held. Popup only appears on `mouseup`.
2. `expandRangeToWordEnd()` — when drag releases mid-word, snaps forward to word boundary automatically.
3. `isWorthySelection()` — rejects selections < 4 chars, unclosed parentheses (fragments), pure punctuation. Clears the DOM selection visually so user knows it didn't register.
4. Mid-word start check — if char before selection start is alphanumeric (selection started inside a word), reject and clear.
5. **Section mode** — selections > 25 words switch to "section mode": header shows the section heading (not the 200-word blob), chips become generic exploration prompts ("Give me a plain-English summary", "What's the most important thing here?", "What should I be watching?", "Break this down further"). Claude gets the section heading as context, not the raw text.

### Context Enrichment (`use-highlight.ts` + `HighlightPopup.tsx`)

Added `context?: string` to `SelectedFact`. `extractRowContext()` walks up the DOM from the selection anchor to find the nearest `<tr>` first cell (metric label) or nearest heading. This means highlighting "100.00%" now tells Claude "Arts, Entertainment & Recreation (NAICS 71) — best SWFL SBA survival rate: 100.00%" instead of just "100.00%".

### AI Response Quality (`app/api/converse/route.ts`)

Added FORMAT instruction appended to the system prompt:
- No markdown (no `**`, `##`, bullet dashes, backticks)
- Speak like a knowledgeable local market analyst talking to a client
- Never use internal terms: "master", "brain", "grounded data", "payload", "grain"
- Give real, useful answers — not "I don't have that breakdown"

### Dock UX (`AskAiDock.tsx`)

- Seed prompts updated: more action-oriented and comparative
- Description updated: "Ask comparative questions, dig into specific metrics, or explore trends across SWFL"
- **Summarize flow**: new "Summarize for my AI →" link opens 3-chip summarize stage:
  - "Just the highlights — 2-3 sentences"
  - "Full session recap — key metrics + bottom line"
  - Custom focus input ("Tell me what you care about most…")
  - After summary streams, a "Copy this summary" button appears inline. Copies the AI-written summary only (no raw Q&A dump). The /r/ link is embedded in the summary by Claude automatically.
- Session Q&A history tracked: "Ask another →" archives each Q&A pair so the summarize export includes the full session context.
- "Upload your data · soon" — disabled placeholder for future document ingestion (Janitor integration).

### Branding (`AskAiDock.tsx`, `AskAiFab.tsx`, `public/logo-transparent.svg`)

- Created `public/logo-transparent.svg` — three-wave brand mark, no black background, `#00d4aa` stroke
- Dock header: replaced star icon + "Ask AI" with transparent wave logo + "SWFL Data Gulf" in `#00d4aa`
- FAB button: inline SVG waves using `currentColor` (dark on teal button), "SWFL Data Gulf" label
- Both popup and dock containers: `bg-[#2c3539]` gunmetal, `border border-[#00d4aa]` teal outline, black font (`text-gray-900`)
- Internal dividers: `border-[#00d4aa]/30`

---

## What Still Needs Work (Next Session)

### Critical
- **Verify popup end-to-end in a real browser** — run `HIGHLIGHTER_UI=1 bun run dev`, navigate to any `/r/[slug]`, select text and trigger the popup. Confirm: popup appears, context label shows metric name, AI answers in plain prose, no markdown, no internal terms.
- **Verify dock summarize flow** — open dock, ask a question, hit "Ask another →", then "Summarize for my AI →", pick an option, confirm copy works.

### Data Gap Handling (deferred — think through first)
The current response when data isn't available can still sound robotic. **The decided direction (Option B):** tiered response — lake fact → inference tagged [estimated] → Google search link when truly out of scope. Not yet implemented. Needs a system prompt change + a link renderer in the popup answer view.

### Real Data Flowing Back from Chats
**Important missing piece:** Right now every `/api/converse` response is ephemeral — it answers and disappears. We are not capturing what users are asking about or what questions go unanswered. This is critical flywheel data:
- What metrics are users asking about most? → prioritize those brain improvements
- What questions can't we answer? → expose data gaps for sourcing
- What did users find most useful? → inform master thesis emphasis

**Options to explore:**
- Log each `ask()` call to a `highlighter_sessions` table (report_id, fact, question, had_answer bool, reach_slugs used)
- An "Ask for more data" button in the popup/dock: if the AI can't fully answer, a button appears: "Request this data →" which logs the gap to a `data_requests` table. Operator reviews weekly. This directly feeds the source roadmap.
- The summarize export already packages the session — consider also auto-logging it server-side (opt-in) so we see what users wanted to share with their own AI.

### Font / Visual Polish
- Container bg is `#2c3539` gunmetal with black font — may need adjustment. If contrast feels off, try `#f8f9fa` (near-white) or a slightly lighter gunmetal.
- Popup header value font: currently `font-mono` for numbers — check if it still looks right with the new dark bg + teal border.
- Mobile sheet version of the dock — verify it respects the new dark styling.

### Coachmark / Discovery
- `FirstTouchHint` and `DiscoveryTicker` — not verified in a real browser yet. Confirm they render and dismiss correctly.

---

## Flag Status

`HIGHLIGHTER_UI=1` is now set in Vercel production. To turn off: `vercel env rm HIGHLIGHTER_UI production` or set to `0` in the Vercel dashboard.

To run locally: add `HIGHLIGHTER_UI=1` to `.env.local`.
