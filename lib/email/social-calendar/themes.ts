// lib/email/social-calendar/themes.ts
import type { DayTheme } from "./types";

/**
 * The New Listing Socials launch arc — one narrative beat per weekday, mapped
 * onto DAY_THEMES[0..4] (Mon–Fri). When the campaign is requested, buildWeek
 * pins ONE listing across every card (no rotation) and steers each day's copy
 * toward its stage. `stage` becomes the card's visible theme label; `addendum`
 * is appended to that day's system addendum (no-invention rules untouched — the
 * model still only fills fields it can cite). Kept beside DAY_THEMES so the
 * arc-length parity guard (campaigns.test.ts) can import both without the
 * network-heavy build-week module.
 */
export const LISTING_LAUNCH_ARC: { stage: string; addendum: string }[] = [
  {
    stage: "Just Listed",
    addendum:
      "CAMPAIGN STAGE — Just Listed: announce THIS featured home hitting the market. Lead with its area, price, and one standout spec.",
  },
  {
    stage: "Feature Spotlight",
    addendum:
      "CAMPAIGN STAGE — Feature Spotlight: highlight one concrete standout of THIS home buyers care about (space, view, lot, build).",
  },
  {
    stage: "Open House",
    addendum:
      "CAMPAIGN STAGE — Open House: invite people to see THIS home in person. If no date is provided, use a [Need: open house date and time] placeholder.",
  },
  {
    stage: "Neighborhood",
    addendum:
      "CAMPAIGN STAGE — Neighborhood: sell the location around THIS home with one cited local signal for its ZIP or area.",
  },
  {
    stage: "Price & CTA",
    addendum:
      "CAMPAIGN STAGE — Price & CTA: make the price case for THIS home with a cited comparable, and end with one clear showing CTA.",
  },
];

export const DAY_THEMES: DayTheme[] = [
  {
    day: "mon",
    label: "Market Monday",
    cardBlocks: ["hero", "stats"],
    systemAddendum:
      "Lead with the most surprising or actionable market number for this scope. hero.value must be a real cited figure (price, DOM, or inventory). stats must have exactly 2 supporting KPIs. Caption: open with the hero number, one sentence of interpretation, one CTA.",
  },
  {
    day: "tue",
    label: "Tip Tuesday",
    cardBlocks: ["signal", "text"],
    systemAddendum:
      "One concrete buyer or seller tip backed by exactly one cited SWFL figure. signal.title is the tip headline (imperative). signal.body is the number that justifies it. text.body is a 2–3 sentence expansion. No more than one number in the whole post. Caption: the tip as a direct instruction in the first sentence.",
  },
  {
    day: "wed",
    label: "Neighborhood Spotlight",
    cardBlocks: ["hero", "text"],
    systemAddendum:
      "Pick the single strongest signal for the agent's scope — one ZIP, corridor, or area. hero.kicker is the place name. hero.value is that area's standout metric. text.body explains what it means for someone considering that area (2–3 sentences). Caption: place name + metric in the first sentence.",
  },
  {
    day: "thu",
    label: "Client Story",
    cardBlocks: ["signal", "agent-card"],
    systemAddendum:
      'Social proof. signal.kicker = "Just Closed". signal.title = the headline outcome (e.g. "Closed in 14 days, $22K over ask"). signal.body = a 2-sentence story with a [Need: client quote] placeholder. Do NOT fill the agent-card — it is identity-owned. Caption: outcome first, then the brief story, then the CTA.',
  },
  {
    day: "fri",
    label: "Local Life",
    cardBlocks: ["text", "image"],
    systemAddendum:
      "Community/lifestyle post. text.body is a 3–4 sentence paragraph that makes the area feel like a place people want to live (restaurants, character, local identity). If the lake has no community data, use a [Need: local landmark or detail] placeholder. image.alt describes the photo the agent should add. Caption: open with something sensory about the place, not a market stat.",
  },
];
