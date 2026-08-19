# Cal.com embed options — official surfaces, verbatim

**Fetched 08/19/2026 via crawl4ai.** Sources actually crawled (all live, all public):

- https://cal.com/docs/llms.txt (docs index — confirms the old `/docs/developing/guides/embeds/*`
  path is gone; API v2 reference only)
- https://developer.cal.com/embed/install-with-react → redirects to
  https://cal.com/help/embedding/adding-embed
- https://developer.cal.com/embed/install-with-javascript → redirects to the same page
- https://cal.com/help/embedding/adding-embed
- https://cal.com/help/embedding/embed-instructions
- https://cal.com/help/embedding/embed-snippet-generator
- https://www.npmjs.com/package/@calcom/embed-react (v1.5.3, points to developer.cal.com)
- https://raw.githubusercontent.com/calcom/cal.com/main/packages/embeds/README.md
- https://raw.githubusercontent.com/calcom/cal.com/main/packages/embeds/embed-core/README.md
- https://raw.githubusercontent.com/calcom/cal.com/main/packages/embeds/embed-react/README.md
- **Note:** the cal.com monorepo now lives at `github.com/calcom/cal.diy` (rebrand); `calcom/cal.com`
  raw URLs still resolve/redirect there. Source-of-truth files pulled directly from `cal.diy`:
  - `packages/embeds/embed-react/src/Cal.tsx`
  - `packages/embeds/embed-react/src/index.ts`
  - `packages/embeds/embed-react/src/useEmbed.ts`
  - `packages/embeds/embed-snippet/src/index.ts` (the literal loader IIFE)
  - `packages/features/embed/lib/EmbedCodes.tsx` (the exact code templates the in-app "Embed"
    generator emits, for HTML / React / React-Atom, for all embed types)
  - `packages/features/embed/lib/EmbedTabs.tsx` (the literal minified snippet string + the `ui`
    instruction JSON the generator writes)
  - `packages/features/embed/lib/constants.ts`, `getDimension.tsx`, `getApiName.tsx`,
    `types/index.d.ts`

No API key or auth involved anywhere in this surface — confirmed below.

---

## 1. The three (really four) embed modes

Cal.com's own docs list **four** ways to embed, but three are the classic "embed modes" and the
fourth (floating button) is popup-via-click with a pre-built trigger:

1. **Inline** — the booker renders directly in the page flow, inside a container `div`.
2. **Pop-up via element click** — any existing element on your page (e.g. a `<button>`) opens the
   booker in a modal when clicked.
3. **Floating button pop-up** — Cal.com injects its own floating action button that opens the
   modal. (Under the hood this is the same modal mechanism as #2 — `embed-core` README: "Adds a
   floating action button that opens the calendar in a modal. It uses modal embedding under the
   hood.")
4. (Bonus, not really a 4th "mode") You can embed a **profile page** (`username`, no event slug)
   or a **Routing Form** (`forms/YOUR_FORM_ID`) using the exact same snippets — just swap what
   `calLink` points at.

### Exact HTML/vanilla-JS snippets (verbatim from `EmbedTabs.tsx` / `EmbedCodes.tsx`)

The loader IIFE (identical for every mode, appended once, wraps the whole thing):

```html
<script type="text/javascript">
  (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if(typeof namespace === "string"){cal.ns[namespace] = cal.ns[namespace] || api;p(cal.ns[namespace], ar);p(cal, ["initNamespace", namespace]);} else p(cal, ar); return;} p(cal, ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
  Cal("init", {origin:"https://cal.com"});
</script>
```

**Inline** (adds a container div + the `inline` call):

```html
<div style="width:100%;height:100%;overflow:scroll" id="my-cal-inline"></div>
<script type="text/javascript">
  Cal("inline", {
    elementOrSelector: "#my-cal-inline",
    config: { "layout": "month_view" },
    calLink: "your-username/your-event-slug",
  });
  Cal("ui", { "hideEventTypeDetails": false, "layout": "month_view" });
</script>
```

**Floating button pop-up:**

```html
<script type="text/javascript">
  Cal("floatingButton", {
    calLink: "your-username/your-event-slug",
    "buttonPosition": "bottom-right",
    "buttonColor": "#000000",
    "buttonTextColor": "#ffffff"
  });
  Cal("ui", { "hideEventTypeDetails": false, "layout": "month_view" });
</script>
```

**Pop-up via element click** — no JS call at all for the trigger; you tag any element with data
attributes and the loader's global click listener picks it up:

```html
<button
  data-cal-link="your-username/your-event-slug"
  data-cal-namespace=""
  data-cal-config='{"layout":"month_view"}'
>
  Book time
</button>
```

`elementOrSelector` for inline accepts a CSS selector string OR a raw `HTMLElement` (from
`embed-instructions` docs).

---

## 2. `@calcom/embed-react` on React 19 / Next.js App Router

Package: `npm i @calcom/embed-react` (current published version 1.5.3, 423k weekly downloads,
repo `github.com/calcom/cal.com#readme` → now `calcom/cal.diy`). Source confirms it is a plain
client component — `"use client"` is the literal first line of every file in the package
(`Cal.tsx`, `index.ts`, `useEmbed.ts`), so it drops into an App Router client component without
adapting anything.

**Inline component** — exact generated snippet (`EmbedCodes.tsx`, `react.inline`):

```tsx
"use client";
import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";

export default function BookWithAgent() {
  useEffect(() => {
    (async function () {
      const cal = await getCalApi({});
      cal("ui", {
        theme: "light",
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();
  }, []);

  return (
    <Cal
      calLink="your-username/your-event-slug"
      style={{ width: "100%", height: "100%", overflow: "scroll" }}
      config={{ layout: "month_view" }}
    />
  );
}
```

**Popup via `getCalApi` (element click or floating button)** — same pattern, no `<Cal>` render,
just call `cal("floatingButton", {...})` or bind a click handler that calls
`cal("modal", { calLink, config })` (the vanilla equivalent is `Cal.modal(...)` per the
`embed-core` README's "Modal Embedding" section:

```ts
Cal.modal({
  calLink: "organization/event-type",
  config: { useSlotsViewOnSmallScreen: "true" },
});
```

### The exact `<Cal>` component contract (`packages/embeds/embed-react/src/Cal.tsx`, verbatim)

```tsx
type CalProps = {
  calOrigin?: string;
  calLink: string;
  initConfig?: { debug?: boolean; uiDebug?: boolean };
  namespace?: string;
  config?: PrefillAndIframeAttrsConfig;
  embedJsUrl?: string;
} & React.HTMLAttributes<HTMLDivElement>;
```

Internally it does exactly:

```ts
Cal("init", { ...initConfig, origin: calOrigin });
Cal("inline", { elementOrSelector: element, calLink, config });
```

(namespaced form calls `Cal.ns[namespace](...)` instead when `namespace` is set — lets you run
multiple independent embeds/instances on one page without collision).

`getCalApi()` (from `index.ts`, verbatim) accepts either a string (`embedJsUrl`) or
`{ embedJsUrl?, namespace? }` and resolves the `Cal` function once the loader script has attached
it to `window`:

```ts
export function getCalApi(options?: { embedJsUrl?: string; namespace?: string }): Promise<GlobalCal>;
```

---

## 3. Config options — theme, hideEventTypeDetails, layout (verbatim from source)

From `EmbedTabs.tsx`'s `getEmbedUIInstructionString`, the generator always emits a `Cal("ui", {...})`
call shaped exactly like this:

```ts
{
  theme,               // "light" | "dark" | undefined (theme=undefined when set to "auto" in the UI)
  cssVarsPerTheme,      // { light: {"cal-brand": "#..."}, dark: {"cal-brand": "#..."} } — built from brandColor/darkBrandColor
  hideEventTypeDetails, // boolean — hides the event title/duration/description card, calendar+slots only
  layout,               // BookerLayouts — the Booker's layout mode
}
```

Additional documented `ui` option from `embed-instructions`:
- `showTimezoneWhenEventDetailsHidden` (boolean, default `false`) — pairs with
  `hideEventTypeDetails: true` to still surface a timezone picker above the booker.
- `styles` — supports `body` and `eventTypeListItem` background-color overrides only (not
  arbitrary CSS). For deeper theming, cal.com instead exposes **CSS custom properties** consumed
  by the iframe (`cal-brand`, etc.) — full list linked from the snippet-generator help page at
  `github.com/calcom/cal.com/blob/main/packages/config/tailwind-preset.js#L18`.

`layout` (`BookerLayouts` type) — confirmed three values exist; the `react-atom` code generator's
inline comment names them literally as **`COLUMN_VIEW`, `MONTH_VIEW`, `WEEK_VIEW`** (the classic
iframe/vanilla `ui`/`config` instruction lower-cases them, e.g. `"month_view"`, per the generator's
default fallback `previewState.config?.layout || "MONTH_VIEW"`). Did not pull the raw enum file
(github code search required login); treat exact casing as needs-one-live-check before shipping,
everything else here is a direct source quote.

Snippet-generator UI ("Getting Embed Code Snippets" page) also configures: **size (width/height)
of the embed, brand color, floating-button text, floating-button position** (`bottom-left` /
`bottom-right`, per `PreviewState["floatingPopup"]`), and (per `data-cal-config`) any of the above
per-instance via `config`.

`instructions` doc also documents a **`preload`** instruction (`Cal("preload", { calLink })`) to
prefetch a link before the user clicks — useful to make the popup feel instant — and a
**`closeModal`** instruction (`Cal("closeModal")`, or namespaced `Cal.ns.yourns("closeModal")`) to
programmatically close a modal-based embed (element-click and floating-button types only).

---

## 4. Works for ANY hosted cal.com link, no API key required — CONFIRMED

Nothing in the embed surface (loader script, `<Cal>` component, `data-cal-*` attributes, or the
`Cal("init"/"inline"/"floatingButton")` calls) takes or requires an API key, OAuth token, or any
credential. `calLink` is just the public path — `username`, `username/event-slug`, or
`forms/FORM_ID` — and the iframe loads the public booking page at that path. This is separate and
unrelated to Cal.com's **API v2** (which does require OAuth/API keys for programmatic bookings) —
the embed is purely a "point an iframe at a public page" mechanism. Confirmed explicitly by the
help doc: "You can embed your cal.com link for an event type e.g. `rick/get-rick-rolled`... You
can embed your profile page e.g. `rick`" — no account linking step described anywhere in the embed
flow.

Practical implication for our "Book time with my agent" surface: an agent just needs to paste
their own `cal.com/<username>` or `cal.com/<username>/<event-slug>` URL; we extract the path after
`cal.com/` as `calLink` and drop it into the `<Cal>` component. No vendor handshake needed.

---

## 5. Self-hosted Cal instances — `calOrigin` / `calOrigin` origin option

Confirmed self-hosting is explicitly supported and the snippet is origin-aware:

- Help doc (`adding-embed`): "The snippets provided are automatically updated as per the cal.com
  instance. **So, even when self hosting, you can simply copy and paste the snippets from there**"
  — i.e. self-hosters get correct snippets straight from their own instance's Embed dialog.
- `<Cal>` React component takes a `calOrigin?: string` prop, passed straight through as
  `Cal("init", { origin: calOrigin })` (`Cal.tsx`, verbatim above).
- `embedJsUrl?: string` prop on `<Cal>` and `getCalApi()` lets a self-hosted instance point the
  loader at its own `embed.js` (e.g. `https://your-instance.example.com/embed/embed.js`) instead
  of `https://app.cal.com/embed/embed.js`. Default loader `EMBED_LIB_URL` resolves to
  `${WEBAPP_URL}/embed/embed.js` — i.e. it's whatever web-app origin served the page, so a
  self-hosted instance's own Embed dialog naturally bakes in the right URL.
- `EmbedCodes.tsx`'s `doWeNeedCalOriginProp()` (verbatim): the generator only emits the
  `calOrigin` prop / `data-cal-origin` attribute when
  `IS_SELF_HOSTED || (embedCalOrigin !== WEBAPP_URL && embedCalOrigin !== WEBSITE_URL)` — i.e.
  cal.com's own hosted embeds omit it (default origin is correct), self-hosted or org/team
  booking URLs on a different origin get it explicitly set.
- Vanilla/HTML mode: same idea via `data-cal-origin="..."` attribute on the trigger element for
  element-click mode, or the `origin` key inside the `Cal("init", {...})` call for inline/floating.

**For our use case:** since agents paste arbitrary `cal.com/<username>` links (not self-hosted
instances), `calOrigin`/`embedJsUrl` are not needed in the common path — only relevant if we ever
want to support someone's self-hosted Cal.com deployment, in which case we'd need to capture the
full origin from their pasted URL rather than assuming `cal.com`.
