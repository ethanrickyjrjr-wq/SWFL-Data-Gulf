// lib/booking/calendar-links.ts — the zero-provider rung of the booking ladder.
//
// An agent with NO booking link still gets a working offer: add-to-calendar
// links the email can carry as plain <a href>. Param shapes verified 08/19/2026
// (Google template URL + Outlook compose deeplink replayed live):
// _RESEARCH/email-and-social/2026-08-19-add-to-calendar-and-propose-times.md.
// Google uses `render?action=TEMPLATE` — NOT `eventedit`, which breaks on
// Android. A raw .ics attachment is banned for our stack: Resend batch sends
// cannot carry attachments (same research file); a hosted .ics URL is the only
// compatible third format and ships separately when a consumer needs it.
//
// PURE string templating; instants are UTC ISO in, vendor formats out.

export interface CalendarEvent {
  title: string;
  startISO: string;
  endISO: string;
  /** Display zone hint for Google's ctz param. */
  timeZone: string;
  location?: string;
  description?: string;
}

/** "20260825T180000Z" — UTC basic format Google's dates param requires. */
function utcBasic(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", ev.title);
  u.searchParams.set("dates", `${utcBasic(ev.startISO)}/${utcBasic(ev.endISO)}`);
  u.searchParams.set("ctz", ev.timeZone);
  if (ev.description) u.searchParams.set("details", ev.description);
  if (ev.location) u.searchParams.set("location", ev.location);
  return u.toString();
}

export function outlookComposeUrl(ev: CalendarEvent): string {
  const u = new URL("https://outlook.live.com/calendar/deeplink/compose");
  u.searchParams.set("path", "/calendar/action/compose");
  u.searchParams.set("rru", "addevent");
  u.searchParams.set("startdt", ev.startISO);
  u.searchParams.set("enddt", ev.endISO);
  u.searchParams.set("subject", ev.title);
  if (ev.description) u.searchParams.set("body", ev.description);
  if (ev.location) u.searchParams.set("location", ev.location);
  return u.toString();
}
