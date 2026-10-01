/**
 * A time zone as a person says it. The stored value is an IANA name ("Asia/Kuala_Lumpur"),
 * a configuration key that never reaches a screen: it reads "Malaysia (Kuala Lumpur,
 * UTC+8)". Pure apart from reading the runtime's own zone data.
 */

/// The country a zone is named for, where the region alone ("Asia") would say too little.
/// Zones not listed read by their region and city, which is still not a code.
const COUNTRY: Record<string, string> = {
  "Asia/Kuala_Lumpur": "Malaysia",
  "Asia/Kuching": "Malaysia",
  "Asia/Singapore": "Singapore",
  "Asia/Brunei": "Brunei",
  "Asia/Jakarta": "Indonesia",
  "Asia/Makassar": "Indonesia",
  "Asia/Jayapura": "Indonesia",
  "Asia/Bangkok": "Thailand",
  "Asia/Ho_Chi_Minh": "Vietnam",
  "Asia/Manila": "Philippines",
  "Asia/Yangon": "Myanmar",
  "Asia/Phnom_Penh": "Cambodia",
  "Asia/Vientiane": "Laos",
  "Asia/Hong_Kong": "Hong Kong",
  "Asia/Shanghai": "China",
  "Asia/Taipei": "Taiwan",
  "Asia/Tokyo": "Japan",
  "Asia/Seoul": "South Korea",
  "Asia/Kolkata": "India",
  "Asia/Colombo": "Sri Lanka",
  "Asia/Dhaka": "Bangladesh",
  "Asia/Karachi": "Pakistan",
  "Asia/Dubai": "United Arab Emirates",
  "Asia/Riyadh": "Saudi Arabia",
  "Australia/Sydney": "Australia",
  "Australia/Perth": "Australia",
  "Australia/Brisbane": "Australia",
  "Australia/Melbourne": "Australia",
  "Pacific/Auckland": "New Zealand",
  "Europe/London": "United Kingdom",
  "Europe/Paris": "France",
  "Europe/Berlin": "Germany",
  "America/New_York": "United States",
  "America/Chicago": "United States",
  "America/Denver": "United States",
  "America/Los_Angeles": "United States",
  UTC: "Coordinated Universal Time",
};

/// "UTC+8", "UTC+5:30", "UTC-3", "UTC" — the offset at `at`.
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  // "GMT+08:00" | "GMT-03:30" | "GMT"
  const m = /^GMT(?:([+-−])(\d{1,2})(?::(\d{2}))?)?$/.exec(part ?? "");
  if (!m || !m[1]) return "UTC";
  const sign = m[1] === "−" ? "-" : m[1];
  const hours = String(Number(m[2]));
  return `UTC${sign}${hours}${m[3] && m[3] !== "00" ? `:${m[3]}` : ""}`;
}

const spaced = (s: string) => s.replace(/_/g, " ");

/// "Malaysia (Kuala Lumpur, UTC+8)"; "Asia (Karachi, UTC+5)" where no country is known.
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  const offset = utcOffsetLabel(timeZone, at);
  const parts = timeZone.split("/");
  const city = spaced(parts[parts.length - 1]);
  const country = COUNTRY[timeZone];
  if (timeZone === "UTC") return `${COUNTRY.UTC} (${offset})`;
  if (country) return `${country} (${city === country ? offset : `${city}, ${offset}`})`;
  const region = spaced(parts[0]);
  return parts.length === 1 ? `${city} (${offset})` : `${region} (${city}, ${offset})`;
}

/// Every zone the runtime knows, labelled, in the order a person looks for one: by
/// country or region, then city.
export function timeZoneOptions(at: Date = new Date()): { value: string; label: string }[] {
  const names = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  const all = names.includes("UTC") ? names : [...names, "UTC"];
  return all
    .map((value) => ({ value, label: timeZoneLabel(value, at) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
