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

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
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
