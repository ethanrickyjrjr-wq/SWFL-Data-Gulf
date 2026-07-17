// lib/email/blocks/agent-hero-dimensions.ts — ONE ROOT for the agent-hero photo box.
//
// The hero photo's aspect ratio must be IDENTICAL in the HTML email (AgentHeroBlock.tsx)
// and in the PDF (lib/pdf/email-doc-pdf.tsx). They drifted once: HTML held a 600×300 box
// (2:1) while the PDF rendered the photo at full page width, 612×200 (3.06:1) — so the same
// photo was cropped differently in the email a recipient sees vs. the PDF they download.
// Caught by lib/pdf/__tests__/pdf-html-visual-parity.test.ts; documented in
// docs/handoff/2026-07-14-pdf-html-visual-parity-bugs-handoff.md. Both engines now read this
// one ratio, so the two boxes can never silently disagree again.
//
// width ÷ height. 2 == a 2:1 banner.
export const AGENT_HERO_PHOTO_ASPECT_RATIO = 2;

// The HTML block sizes the photo by a fixed max width + an EXPLICIT pixel height, because
// many email clients ignore CSS `aspect-ratio` — the height must be a real px value. The PDF
// uses react-pdf's Yoga-backed `aspectRatio` style directly, so it stays 2:1 at any page
// width with no hardcoded height. Both derive from the ONE ratio above.
export const AGENT_HERO_PHOTO_MAX_WIDTH = 600;
export const AGENT_HERO_PHOTO_HEIGHT = AGENT_HERO_PHOTO_MAX_WIDTH / AGENT_HERO_PHOTO_ASPECT_RATIO; // 300
