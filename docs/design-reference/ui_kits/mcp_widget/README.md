# SWFL Data Gulf — MCP Inline Widget UI Kit

Hi-fi recreation of the inline widget that renders inside an AI chat
bubble (Claude, ChatGPT, Cursor) when a user asks their AI for SWFL
data via the MCP integration.

## Files

| File           | Role                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `index.html`   | Mount point — wires React + Babel.                                                |
| `widget.jsx`   | `Widget` (the bubble itself) + `App` (faux chat host + mode toggle).              |
| `widget.css`   | Widget layout — 560px max, mode bar, host bubbles for context.                    |

## Width contract

The widget must reflow gracefully between **480px and 640px**. Below 480
the rows collapse to one column.

## Modes (read the room)

The host passes a `mode` hint via prop / tool-call args:

- **`subtle`** (default) — total motion ≤ 300ms. Verdict pops in
  briefly; metrics and conclusion fade in as one block.
- **`impress`** — total motion ≤ 600ms. Verdict spring rises longer;
  metrics fade in with a small delay. Still no per-row stagger.

Toggle modes via the inline "HOST MODE" bar above the widget.

## What's interactive

- **Mode toggle** — replays the animation under the new budget.
- **Caveats** — expand/collapse in place. 200ms height/opacity.
- **Source links** — open the dataset in a new tab.
- **"View full report ↗"** — links to `../report/index.html` (the
  destination page).

## What's stubbed

- The host bubble (user prompt, "Claude" tag) is a context shell. In
  reality the widget renders embedded in the host's own bubble.
- Mode is selected via a local UI bar; in production it arrives via
  `props.mode` from the MCP runtime.

## Open it

`ui_kits/mcp_widget/index.html` — defaults to subtle mode.
