/**
 * A stamp as the supplier reads it. Its own file, with nothing of node's behind it, so a screen in the browser can use it (step 11).
 */

/// An instant as the supplier reads it on a receipt: the day, and the time to the second on the organisation's clock. With the zone unset both are UTC and it says so.
export function stampText(instant: Date, timeZone: string | null): string {
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone ?? "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(instant);
  return timeZone ? text : `${text} (UTC)`;
}
