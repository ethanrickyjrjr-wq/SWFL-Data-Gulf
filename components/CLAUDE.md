# components/ — in-app UI surfaces (Class-B conventions)

**THE ONE ROOM RULE — read before building or restyling ANY signed-in app surface**
(anything rendered inside the site header: /project, /email-lab, /contacts, …):
invoke the `one-room` skill. The app is ONE room — a new page reuses the existing
chrome verbatim, never invents its own. Generic taste/design skills are for
marketing/landing pages only; applied in-app they produce a second product.

- `components/charts/CLAUDE.md` carries the typography lock for chart surfaces —
  read it when editing anything under components/charts/.
- Setting state inside useEffect is a hard error here (memory:
  feedback_react-set-state-in-effect) — derive during render or use the event handler.
- Layout: `h-full` / `dvh`, never `h-screen`.
