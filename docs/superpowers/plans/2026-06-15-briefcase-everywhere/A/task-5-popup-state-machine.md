# A-5 — Panel state machine — **SONNET**

## Goal
A state-branching pill panel: pitch + examples when logged-out/empty; the draft + build path when
there's work; CTAs that point at the ladder.

## Behaviour
- **Logged-out / empty:** pitch + the 4 live example cards (A-4). Two exits aligned to the ladder:
  - **"Build & send here"** → `LoginModal` (rung 1 auth wall).
  - **"Use me in your own Claude — free"** → `MCPInstall` (shows `claude mcp add ...`, rung 0).
- **Has draft:** filed items + the build affordance. On `/r/*`: the shared thread + file-this-chart.

## Copy (decision 3 — do not violate)
- Say **"context-aware,"** never **"learns how you work."** No behavioral-learning promise.
- Ladder copy: *"Build free. First month's builds are clean; after that they carry our mark — go Pro
  for clean, branded, emailable (MCP-connected = discount)."* **Builds are never blocked.**

## Create-gate (SONNET)
Logged-out **"Build"** → open `LoginModal`, **never** POST the build API. Ship a **bypass test**
asserting the API is not hit while logged out.

## Acceptance test
- Logged-out popup shows pitch + 4 example cards; both exits work (`LoginModal`; `MCPInstall` shows
  the `claude mcp add` line).
- Logged-out "Build" opens `LoginModal` and does **not** POST the build route (bypass test).
- With a draft present, the panel shows items + the build path.
