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

/// A value band as the DAL states it, e.g. "More than RM15,000 and up to RM300,000".
export function formatBand(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Any value";
  if (min == null) return `Up to ${formatRM(max)}`;
  if (max == null) return `More than ${formatRM(min)}`;
  return `More than ${formatRM(min)} and up to ${formatRM(max)}`;
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
