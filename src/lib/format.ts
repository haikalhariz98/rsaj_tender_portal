import { dayIn } from "./dates";
import { formatMoney, parseSen } from "./money";

/// Ringgit, the way the manuals write it: "RM300,000" with no decimals unless the
/// amount has sen.
export function formatRM(value: number | null | undefined): string {
  if (value == null) return "—";
  const hasSen = Math.round(value * 100) % 100 !== 0;
  return (
    "RM" +
    value.toLocaleString("en-MY", {
      minimumFractionDigits: hasSen ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

/// A value band spelled out, e.g. "More than RM15,000 and up to RM300,000".
export function formatBand(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Any value";
  if (min == null) return `Up to ${formatRM(max)}`;
  if (max == null) return `More than ${formatRM(min)}`;
  return `More than ${formatRM(min)} and up to ${formatRM(max)}`;
}

type Amount = { toString(): string } | string;

/**
 * A route's value band as its pinned rule had it, spelled out (FR-APR-019, ruling R4):
 * "More than RM50,000 and up to and including RM300,000".
 *
 * Every edge is (min, max] — more than the floor, up to and including the ceiling —
 * except an edge exactly on the boundary, where the comparison the route stored
 * decides: "GT" keeps (min, max]; "GTE" puts a value exactly on the boundary in the
 * upper band, so that band starts "at least" there and the band below ends "below" it.
 * The operator is the one stored when the route was opened (the issue's boundary
 * setting and the rule's own switch, already combined), never re-derived from current
 * configuration. An edge on the stored boundary with no operator recorded says so.
 *
 * Amounts are read in exact sen from their stored decimal text, never through a float.
 */
export function formatRouteBand(
  band: { min: Amount | null; max: Amount | null },
  boundary: { value: Amount | null; operator: "GT" | "GTE" | null },
  currency = "RM",
): string {
  const sen = (a: Amount) => parseSen(a.toString());
  const lo = band.min == null ? null : sen(band.min);
  const hi = band.max == null ? null : sen(band.max);
  if (lo == null && hi == null) return "Any value";
  const b = boundary.value == null ? null : sen(boundary.value);
  const atBoundary = (e: bigint | null) => e != null && b != null && e === b;
  const parts: string[] = [];
  if (lo != null) parts.push(atBoundary(lo) && boundary.operator === "GTE" ? `at least ${formatMoney(lo, currency)}` : `more than ${formatMoney(lo, currency)}`);
  if (hi != null) parts.push(atBoundary(hi) && boundary.operator === "GTE" ? `below ${formatMoney(hi, currency)}` : `up to and including ${formatMoney(hi, currency)}`);
  const text = parts.join(" and ");
  const unrecorded = (atBoundary(lo) || atBoundary(hi)) && boundary.operator == null;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${unrecorded ? ` — which band a value of exactly ${formatMoney(b!, currency)} falls in was not recorded` : ""}`;
}

/// Ringgit shortened the way the bands are printed: RM 500, RM 50K, RM 3M.
function compactRM(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const m = value / 1_000_000;
    return `RM ${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    const k = value / 1_000;
    return `RM ${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return `RM ${value.toLocaleString("en-MY")}`;
}

/**
 * A value band in the compact notation the matrix uses in tables:
 *
 *   ≤ RM 500        a ceiling with no floor
 *   RM 500 – RM 50K a band with both
 *   > RM 300K       a floor with no ceiling
 *
 * Long enough to read at a glance, short enough for a column. The prose form
 * {@link formatBand} is for places with room to spell it out.
 */
export function formatValueBand(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Any value";
  if (min == null) return `≤ ${compactRM(max!)}`;
  if (max == null) return `> ${compactRM(min)}`;
  return `${compactRM(min)} – ${compactRM(max)}`;
}

/// A percentage band, for variations: "≤ 20%", "20% – 50%", "> 50%".
export function formatPercentBand(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min == null) return `≤ ${max}%`;
  if (max == null) return `> ${min}%`;
  return `${min}% – ${max}%`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/// "02 Nov 2026": two-digit day, three-letter month, every time — the locale's "Sept"
/// beside "Nov" read as two formats. Days are stored at midnight UTC, so read in UTC.
const dayText = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return dayText(d);
}

/**
 * The organisation's calendar day an instant fell on, formatted as `formatDate` does.
 * For timestamps (when a check ran, a route opened, a change was made), so they read on
 * the same day as the days typed beside them. With the zone unset the day is read in
 * UTC and says so (ruling BD-32): an unset zone is not UTC, so the day is marked
 * rather than passed off as the organisation's.
 */
export function formatOrgDay(instant: Date | null | undefined, timeZone: string | null): string {
  if (!instant) return "—";
  const day = dayText(new Date(`${dayIn(instant, timeZone)}T00:00:00.000Z`));
  return timeZone ? day : `${day} (UTC — time zone not set)`;
}

/**
 * An instant as the organisation reads it: its day and the time on its clock,
 * "01 Oct 2026 · 04:00". With the zone unset both are UTC and it says so (ruling BD-32).
 */
export function formatOrgDateTime(instant: Date | null | undefined, timeZone: string | null): string {
  if (!instant) return "—";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timeZone ?? "UTC" }).format(instant);
  const day = dayText(new Date(`${dayIn(instant, timeZone)}T00:00:00.000Z`));
  return timeZone ? `${day} · ${time}` : `${day} · ${time} (UTC — time zone not set)`;
}

/// Two initials for an avatar. Malaysian names often carry bin/binti/a/l — those are
/// connectors, not name parts, so they are skipped.
const CONNECTORS = new Set(["bin", "binti", "bt", "a/l", "a/p", "al", "ap"]);

export function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((p) => p && !CONNECTORS.has(p.toLowerCase()));
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/// Stable colour for an avatar, so the same person is the same colour everywhere.
export function avatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return `avatar--n${(Math.abs(hash) % 6) + 1}`;
}

/**
 * Money at a glance, as the sample writes it in a table: "RM 8.60M", "RM 921.5K".
 *
 * Millions keep two decimals including a trailing zero; thousands keep one and drop
 * it when it is zero. Compacting is for reading a column of figures against each
 * other — never for a figure somebody has to reconcile, which is why the drawer
 * shows the same number in full.
 */
export function formatCompactRM(sen: bigint): string {
  const negative = sen < 0n;
  const abs = negative ? -sen : sen;
  const sign = negative ? "−" : "";
  const ringgit = Number(abs) / 100;

  if (ringgit >= 1_000_000) return `${sign}RM ${(ringgit / 1_000_000).toFixed(2)}M`;
  if (ringgit >= 1_000) {
    const thousands = (ringgit / 1_000).toFixed(1);
    return `${sign}RM ${thousands.endsWith(".0") ? thousands.slice(0, -2) : thousands}K`;
  }
  return `${sign}RM ${ringgit.toFixed(0)}`;
}
