/**
 * The invitation controls' configuration rules (Configuration › Invitation controls): the window
 * policy, publication channels, fee floors and holiday calendars, each the customer's, shipped
 * empty. A save is refused with its reason; nothing here supplies a value. Pure.
 */

import { SIMULATOR_NOT_ALLOWED_WORDS } from "@/lib/integration/payment-deployment";
import { isClockTime, isDay } from "@/lib/dates";
import { REGIMES } from "@/lib/method/types";

import type { Finding } from "./types";

export type PolicyFault = "DAYS_NOT_VALID" | "TARGET_BELOW_MINIMUM" | "TIME_NOT_VALID" | "NAMED_CHANNEL_REQUIRED" | "CHANNEL_NOT_FOR_RULE" | "CHANNEL_RETIRED" | "CALENDAR_RETIRED" | "CALENDAR_UNKNOWN" | "CHANNEL_UNKNOWN" | "TEMPLATE_UNKNOWN" | "TIME_ZONE_NOT_SET" | "PAYMENT_METHOD_TOO_LONG" | "PAYMENT_METHODS_TOO_MANY" | "PAYMENT_METHOD_REPEATED" | "ONLINE_NEEDS_RELEASE" | "SIMULATOR_NOT_ALLOWED";

export interface PolicyInput {
  minAdvertisementDays: number | null;
  targetAdvertisementDays: number | null;
  newspaperWarnDays: number | null;
  purchaseCutoffDays: number | null;
  defaultClosingTime: string | null;
  advertisementDayRule: "LATEST_REQUIRED_CHANNEL" | "NAMED_CHANNEL" | null;
  advertisementChannelId: string | null;
  calendarId: string | null;
  templateIds: readonly (string | null)[];
  /// SR-10 (ruling 17): the payment methods the simulator offers, one label each.
  paymentMethods?: readonly string[];
  /// S3: an organisation that sells online releases documents online, so selling online with the release not set to Yes is refused. Absent: not judged (a caller that does not save these).
  documentSaleMode?: "COUNTER" | "ONLINE" | null;
  electronicDocumentRelease?: boolean | null;
  /// SEC-1: the save would switch the payment simulator on, and the deployment has not allowed the simulator. Worked out by the action (it reads the deployment and the setting as it stands), refused here in words.
  simulatorSwitchNotAllowed?: boolean;
}

export const PAYMENT_METHOD_MAX_LENGTH = 80;
export const PAYMENT_METHODS_MAX = 12;

/// The methods as typed, one per line: trimmed, blank lines dropped. The order typed is the order offered.
export const paymentMethodsFromText = (text: string | null | undefined): string[] => (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function policyFaults(p: PolicyInput, known: { channels: readonly { id: string; retiredOn: string | null }[]; calendars: readonly { id: string; retiredOn: string | null }[]; templateIds: readonly string[]; today: string | null }): Finding<PolicyFault>[] {
  const out: Finding<PolicyFault>[] = [];
  const f = (code: PolicyFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  /// Whether a record with a retirement day is retired today. With no time zone there is no "today": the
  /// answer is not guessed from the server's clock (a UTC fallback), the save is refused naming the setting.
  let zoneNeeded = false;
  const retired = (retiredOn: string | null) => {
    if (retiredOn == null) return false;
    if (known.today == null) {
      zoneNeeded = true;
      return false;
    }
    return retiredOn <= known.today;
  };
  for (const [field, v] of Object.entries({ minAdvertisementDays: p.minAdvertisementDays, targetAdvertisementDays: p.targetAdvertisementDays, newspaperWarnDays: p.newspaperWarnDays, purchaseCutoffDays: p.purchaseCutoffDays })) {
    if (v != null && (!Number.isInteger(v) || v < 0 || v > 365)) f("DAYS_NOT_VALID", { field });
  }
  if (p.minAdvertisementDays != null && p.targetAdvertisementDays != null && p.targetAdvertisementDays < p.minAdvertisementDays) f("TARGET_BELOW_MINIMUM");
  if (p.defaultClosingTime != null && !isClockTime(p.defaultClosingTime)) f("TIME_NOT_VALID");
  if (p.advertisementDayRule === "NAMED_CHANNEL" && !p.advertisementChannelId) f("NAMED_CHANNEL_REQUIRED");
  if (p.advertisementDayRule !== "NAMED_CHANNEL" && p.advertisementChannelId) f("CHANNEL_NOT_FOR_RULE");
  if (p.advertisementChannelId) {
    const c = known.channels.find((x) => x.id === p.advertisementChannelId);
    if (!c) f("CHANNEL_UNKNOWN");
    else if (retired(c.retiredOn)) f("CHANNEL_RETIRED");
  }
  if (p.calendarId) {
    const c = known.calendars.find((x) => x.id === p.calendarId);
    if (!c) f("CALENDAR_UNKNOWN");
    else if (retired(c.retiredOn)) f("CALENDAR_RETIRED");
  }
  for (const t of p.templateIds) if (t && !known.templateIds.includes(t)) f("TEMPLATE_UNKNOWN");
  const methods = p.paymentMethods ?? [];
  if (methods.some((m) => m.length > PAYMENT_METHOD_MAX_LENGTH)) f("PAYMENT_METHOD_TOO_LONG", { max: PAYMENT_METHOD_MAX_LENGTH });
  if (methods.length > PAYMENT_METHODS_MAX) f("PAYMENT_METHODS_TOO_MANY", { max: PAYMENT_METHODS_MAX });
  if (new Set(methods.map((m) => m.toLowerCase())).size !== methods.length) f("PAYMENT_METHOD_REPEATED");
  if (p.documentSaleMode === "ONLINE" && p.electronicDocumentRelease !== true) f("ONLINE_NEEDS_RELEASE");
  if (p.simulatorSwitchNotAllowed) f("SIMULATOR_NOT_ALLOWED");
  if (zoneNeeded) f("TIME_ZONE_NOT_SET");
  return out;
}

export type FloorFault = "REGIME_UNKNOWN" | "FLOOR_EXISTS";

/// A floor per regime the bands know (below, quotation, tender), one each.
export function floorFaults(regime: string, existing: readonly { id: string; regime: string }[], id: string | null): Finding<FloorFault>[] {
  if (!(REGIMES as readonly string[]).includes(regime)) return [{ code: "REGIME_UNKNOWN", level: "block" }];
  if (existing.some((f) => f.regime === regime && f.id !== id)) return [{ code: "FLOOR_EXISTS", level: "block" }];
  return [];
}

export type CalendarFault = "WEEKDAY_NOT_VALID" | "YEAR_NOT_VALID" | "HOLIDAY_DAY_NOT_VALID" | "HOLIDAY_OTHER_YEAR" | "HOLIDAY_EXISTS" | "HOLIDAY_NAME_REQUIRED";

export function weekendFaults(days: readonly number[]): Finding<CalendarFault>[] {
  return days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ? [] : [{ code: "WEEKDAY_NOT_VALID", level: "block" }];
}

export const yearFault = (year: number): Finding<CalendarFault> | null => (Number.isInteger(year) && year >= 2000 && year <= 2100 ? null : { code: "YEAR_NOT_VALID", level: "block" });

export interface HolidayLine {
  day: string;
  nameEn: string;
  nameMs: string | null;
  gazetteRef: string;
}

/**
 * A year's holidays imported from CSV: `day,name` with optional Malay name and gazette reference
 * columns (`day,nameEn,nameMs,gazetteRef`), a header line allowed. Every line is judged and every
 * fault reported with its line number; nothing is taken from a file with a fault.
 */
export function parseHolidayCsv(text: string, year: number, existing: readonly string[] = []): { rows: HolidayLine[]; faults: (Finding<CalendarFault> & { line: number })[] } {
  const rows: HolidayLine[] = [];
  const faults: (Finding<CalendarFault> & { line: number })[] = [];
  const seen = new Set(existing);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = splitCsv(raw);
    if (i === 0 && !/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? "")) return; // a header
    const [day = "", nameEn = "", nameMs = "", gazetteRef = ""] = cells;
    if (!isDay(day)) return void faults.push({ code: "HOLIDAY_DAY_NOT_VALID", level: "block", line });
    if (Number(day.slice(0, 4)) !== year) return void faults.push({ code: "HOLIDAY_OTHER_YEAR", level: "block", line, data: { year } });
    if (!nameEn.trim()) return void faults.push({ code: "HOLIDAY_NAME_REQUIRED", level: "block", line });
    if (seen.has(day)) return void faults.push({ code: "HOLIDAY_EXISTS", level: "block", line, data: { day } });
    seen.add(day);
    rows.push({ day, nameEn: nameEn.trim(), nameMs: nameMs.trim() || null, gazetteRef: gazetteRef.trim() });
  });
  return { rows, faults };
}

/// One CSV line's cells: commas outside double quotes split; "" inside quotes is a quote.
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/// Configuration's words.
export function configFaultText(f: Finding & { line?: number }): string {
  const at = f.line ? `Line ${f.line}: ` : "";
  switch (f.code) {
    case "DAYS_NOT_VALID":
      return "A number of days must be a whole number from 0 to 365.";
    case "TARGET_BELOW_MINIMUM":
      return "The target days cannot be fewer than the minimum.";
    case "TIME_NOT_VALID":
      return "The default closing time must be a time on the 24-hour clock, such as 14:30.";
    case "NAMED_CHANNEL_REQUIRED":
      return "Choose the channel whose day is the advertisement day.";
    case "CHANNEL_NOT_FOR_RULE":
      return "A channel is named only where the advertisement day is one named channel's.";
    case "CHANNEL_RETIRED":
      return "That channel is retired.";
    case "CHANNEL_UNKNOWN":
      return "That channel is no longer configured.";
    case "CALENDAR_RETIRED":
      return "That holiday calendar is retired.";
    case "CALENDAR_UNKNOWN":
      return "That holiday calendar is no longer configured.";
    case "TIME_ZONE_NOT_SET":
      return "The organisation's time zone is not set, so whether that channel or calendar is retired cannot be judged today. Set the time zone under Configuration, Organisation.";
    case "TEMPLATE_UNKNOWN":
      return "That template is no longer configured.";
    case "PAYMENT_METHOD_TOO_LONG":
      return `A payment method is named in at most ${f.data?.max ?? PAYMENT_METHOD_MAX_LENGTH} characters.`;
    case "PAYMENT_METHODS_TOO_MANY":
      return `At most ${f.data?.max ?? PAYMENT_METHODS_MAX} payment methods may be offered.`;
    case "PAYMENT_METHOD_REPEATED":
      return "A payment method is listed twice. Give each once.";
    case "ONLINE_NEEDS_RELEASE":
      return "Documents cannot be sold online while the release of documents online is not set to Yes: a buyer would pay and be handed nothing. Set \"Release the documents online after payment\" to Yes first, or sell at the counter.";
    case "SIMULATOR_NOT_ALLOWED":
      return SIMULATOR_NOT_ALLOWED_WORDS;
    case "REGIME_UNKNOWN":
      return "Choose the band the floor applies to.";
    case "FLOOR_EXISTS":
      return "That band already has a floor. Change it rather than adding another.";
    case "WEEKDAY_NOT_VALID":
      return "Weekend days are days of the week.";
    case "YEAR_NOT_VALID":
      return "Give the year, such as 2027.";
    case "HOLIDAY_DAY_NOT_VALID":
      return `${at}the day is not a date (YYYY-MM-DD).`;
    case "HOLIDAY_OTHER_YEAR":
      return `${at}the day is not in ${f.data?.year ?? "the year being imported"}.`;
    case "HOLIDAY_NAME_REQUIRED":
      return `${at}give the holiday's name.`;
    case "HOLIDAY_EXISTS":
      return `${at}${f.data?.day ?? "that day"} is already a holiday in this calendar.`;
    default:
      return CONFIG_UNWORDED;
  }
}

export const CONFIG_UNWORDED = "This cannot be saved.";
