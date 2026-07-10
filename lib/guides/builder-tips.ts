import { EMAIL_LAB_LANDING } from "@/lib/lab-entry/destination";
import { SEED_PREVIEWS } from "@/lib/email/doc/seed-previews";
import type { GuideDef, GuideSection } from "./types";

/**
 * Guide 3 — hidden builder features (spec §5, strand 3). Every tip verified in
 * code 07/09/2026; the spec's rule is cut-don't-soften, and one clause WAS cut:
 * per-image click tracking (lib/email/tracked-links/wrap.ts wraps the campaign
 * CTA on the send path, not every block link), so the image tip claims the
 * link, not the tracking. Paid-only features (photoEditor, socialCalendar per
 * lib/email/lab/capabilities.ts FEATURE_ROUTING) say "on paid plans" in plain
 * words. Anchors: ImageBlock.tsx linkUrl · build-doc.ts buildChartForQuestion ·
 * SendToSelfModal · ScheduleSendModal + SocialCalendarPanel · brand/apply-brand
 * · api/deliverables/[id]/pdf · lab/phone-tabs · doc/seed-previews ·
 * doc/history · FilerobotModal + PhotopeaModal.
 */
const TIPS: GuideSection[] = [
  {
    id: "image-links",
    heading: "Any image can be a link",
    body: [
      "Every image block can carry a destination link: tap the photo, land on the listing page, the sign-up form, wherever you point it. A photo that goes somewhere gets clicked far more than a bare button.",
    ],
  },
  {
    id: "chart-your-figure",
    heading: "Chart a figure only you have",
    body: [
      "Hand the builder a number of your own — “our average days on market is 12” — or upload a document, and it charts it, attributed to you. Your data is as chartable as ours.",
    ],
  },
  {
    id: "send-to-self",
    heading: "Send it to yourself first",
    body: [
      "One click sends the draft to your own inbox, so you check it where your clients will read it — real mail app, real rendering — before anyone else sees it.",
    ],
  },
  {
    id: "schedule-and-social",
    heading: "Schedule sends and plan socials on one calendar",
    body: [
      "Emails can be scheduled ahead instead of sent on the spot, and on paid plans the social calendar lines up the matching posts alongside them. One campaign, one timeline.",
    ],
  },
  {
    id: "brand-once",
    heading: "Set your brand once",
    body: [
      "Colors, logo, headshot, contact details: set them one time and every email, template, and export picks them up automatically.",
    ],
  },
  {
    id: "pdf-twin",
    heading: "Every email is also a PDF",
    body: [
      "The same document exports as a print-ready PDF — leave-behinds, listing presentations, a printed farm piece — without rebuilding anything.",
    ],
  },
  {
    id: "phone-builder",
    heading: "The whole builder works on your phone",
    body: [
      "The builder is laid out phone-first — preview and edit tabs sized for a phone screen — so you can fix a typo or approve a send from anywhere.",
    ],
  },
  {
    id: "starting-layouts",
    heading: `${SEED_PREVIEWS.length} starting layouts, already filled`,
    body: [
      "The showcase holds every layout filled with live Southwest Florida figures, so you see what each becomes before you pick it. Start from one and the AI refills it with your area, your brand, your voice.",
    ],
    tryIt: { label: "Browse the layouts", href: "/showcase" },
  },
  {
    id: "undo-redo",
    heading: "Undo anything",
    body: [
      "Every edit is history-tracked — undo and redo work the way they should, so experimenting with a layout costs nothing.",
    ],
  },
  {
    id: "photo-editing",
    heading: "Edit photos without leaving",
    body: [
      "On paid plans you can crop, retouch, and adjust photos inside the builder — two built-in photo editors, no round trip through other software.",
    ],
  },
];

export const BUILDER_TIPS: GuideDef = {
  slug: "builder-tips",
  title: `${TIPS.length} things the builder does that you might miss`,
  kind: "tips",
  description:
    "Small features that don't get a tour — image links, self-previews, PDF twins, and more.",
  cardImage: "/showcase/seed-previews/agent-spotlight.webp",
  hook: "The builder does a lot quietly. These are the features people find in week three and wish they'd known on day one.",
  expect: [],
  sections: TIPS,
  tryIt: { label: "Open the builder and poke around", href: EMAIL_LAB_LANDING },
};
