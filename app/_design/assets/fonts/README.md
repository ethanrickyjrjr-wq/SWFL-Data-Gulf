# Fonts

Six `.woff2` files: four weights of **Inter** (regular body + display)
and two weights of **JetBrains Mono** (monospace).

| File                       | Use                                                                |
| -------------------------- | ------------------------------------------------------------------ |
| `inter-400.woff2`          | Body copy (1rem, body small 0.875rem, captions)                    |
| `inter-500.woff2`          | Metric labels, emphasis, section headers                           |
| `inter-600.woff2`          | Display — hero, H1 (direction word), metric values                 |
| `inter-700.woff2`          | Heaviest display weight; rarely needed but reserved for hero scale |
| `jetbrains-mono-400.woff2` | Freshness token, install command on `/connect`                     |
| `jetbrains-mono-500.woff2` | Mono labels, code-style chips, emphasis in mono blocks             |

## On Inter Display

The spec in `05-color-and-type.md` recommends "Inter Display" for the
hero scale. Inter Display is the same family as Inter, optically sized
for 28px+ usage. Using **Inter at weight 600/700** for display sizes
works as a practical substitute. If you want the optical version, the
fontsource package needed a version pin that wasn't resolving cleanly
when these were downloaded — pull from
<https://rsms.me/inter/> directly.

## Attaching to Claude Design

Attach all six `.woff2` files to Claude Design's "fonts, logos and
assets" slot. Claude Design will resolve them and use them rather than
substituting "a similar geometric sans."

## How to use in code

```css
@font-face {
  font-family: "Inter";
  src: url("/_design/assets/fonts/inter-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* repeat for 500 / 600 / 700 */

@font-face {
  font-family: "JetBrains Mono";
  src: url("/_design/assets/fonts/jetbrains-mono-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* repeat for 500 */

:root {
  --font-display: "Inter", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

**Always on numbers:** `font-variant-numeric: tabular-nums;` per
`05-color-and-type.md` and `06-voice-and-microcopy.md`.

## Licenses

- **Inter** — SIL Open Font License 1.1.
  <https://github.com/rsms/inter/blob/master/LICENSE.txt>
- **JetBrains Mono** — SIL Open Font License 1.1.
  <https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt>

Both are free to ship in production with attribution preserved in
source.

## Refreshing

```bash
# Inter
for w in 400 500 600 700; do
  curl -sL "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-${w}-normal.woff2" -o "inter-${w}.woff2"
done

# JetBrains Mono
for w in 400 500; do
  curl -sL "https://cdn.jsdelivr.net/npm/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-${w}-normal.woff2" -o "jetbrains-mono-${w}.woff2"
done
```
