/**
 * Which calendar day an instant falls on, for the organisation.
 *
 * Pure. "Today" depends on where the organisation keeps its dates: 07:00 in Kuala
 * Lumpur is still yesterday in UTC. The zone is `Organisation.timeZone`, an IANA
 * name. Unset, days are judged in UTC — and the screen says so, rather than assuming
 * a zone for the customer.
 */

/// The day `instant` falls on in `timeZone`, as YYYY-MM-DD. Null judges it in UTC.
export function dayIn(instant: Date, timeZone: string | null): string {
  if (!timeZone) return instant.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/// A calendar date as stored — midnight UTC of the day typed — back to YYYY-MM-DD.
/// A date field is a day, not an instant, so no zone applies.
export function storedDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/// The stored form of a day: midnight UTC.
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/// Whether a name is an IANA time zone this runtime knows.
export function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/// The hour (0–23) of `instant` in `timeZone`. Null judges it in UTC.
export function hourIn(instant: Date, timeZone: string | null): number {
  if (!timeZone) return instant.getUTCHours();
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(instant);
  return Number(h) % 24;
}

/// How the prototype greets, by the hour in the organisation's zone.
export function greetingAt(instant: Date, timeZone: string | null): string {
  const hour = hourIn(instant, timeZone);
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
