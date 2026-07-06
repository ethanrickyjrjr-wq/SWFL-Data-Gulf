/** Eastern wall-clock hour of a UTC instant — display metadata for once rows
 *  (send_hour_et is informational there; firing time is next_run_at). */
export function etHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );
}
