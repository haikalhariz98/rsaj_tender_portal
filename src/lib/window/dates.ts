/**
 * The window's date rules (FR-ADV-004–007), judged against the customer's configured policy and
 * holiday calendar — never a figure in code. Pure.
 *
 * - The advertisement day (OD-3): with channels publishing on different days, the policy says
 *   which day counts — the latest required channel's, or one named channel's. Unset blocks.
 * - The closing day (FR-ADV-004, 005): at least `minAdvertisementDays` after the advertisement
 *   day (exactly that many passes), a warning below the target and within the newspaper margin,
 *   and never a weekend day or a public holiday of the configured calendar. A calendar not set,
 *   weekend days not set, or a closing year not maintained in full blocks (OD-7): a silent pass
 *   would let a holiday closing through.
 * - The closing time (FR-ADV-006): the policy's default, or another with a reason, recorded.
 * - The last purchase day (FR-ADV-007): at least `purchaseCutoffDays` before the closing day
 *   (exactly that many passes).
 *
 * Each rule unset blocks with its own RULE_NOT_SET, naming the setting; the messages cite the
 * policy's `dateRuleSource` where one is recorded (NFR-USE-002), and nothing where it is not.
 */

import { clockTimeIn, dayIn, daysFrom, isoWeekday } from "@/lib/dates";

import type { CalendarFacts, ChannelFacts, Finding, PublicationFacts, WindowPolicyFacts } from "./types";

/// The policy settings a rule can be unset on, by name (the words are in labels.ts).
export type PolicySetting =
  | "minAdvertisementDays"
  | "targetAdvertisementDays"
  | "newspaperWarnDays"
  | "purchaseCutoffDays"
  | "defaultClosingTime"
  | "advertisementDayRule"
  | "calendar"
  | "mandatoryAttendancePermitted";

export type DayRuleFault = "RULE_NOT_SET" | "CHANNELS_NOT_SET" | "CHANNEL_REQUIREMENT_NOT_SET" | "CHANNEL_MISSING" | "NAMED_CHANNEL_NOT_REQUIRED";

/// A channel is in use on a day unless it was retired by then.
const liveOn = (c: ChannelFacts, today: string) => c.retiredOn == null || c.retiredOn > today;

/// The channels every advertised exercise must be published through, as configured today.
export const requiredChannels = (channels: readonly ChannelFacts[], today: string) => channels.filter((c) => liveOn(c, today) && c.requiredWhenAdvertised === true);

/**
 * The advertisement day, from the publication records (OD-3). Null while a required channel has
 * no record, while no channel is required, or while the rule is not set — each said in `faults`.
 * The records of a channel that is not required count only where the rule names that channel.
 */
export function advertisementDay(
  records: readonly PublicationFacts[],
  channels: readonly ChannelFacts[],
  policy: Pick<WindowPolicyFacts, "advertisementDayRule" | "advertisementChannelId">,
  today: string,
): { day: string | null; missing: ChannelFacts[]; faults: Finding<DayRuleFault>[] } {
  const faults: Finding<DayRuleFault>[] = [];
  const live = channels.filter((c) => liveOn(c, today));
  for (const c of live.filter((x) => x.requiredWhenAdvertised == null)) faults.push({ code: "CHANNEL_REQUIREMENT_NOT_SET", level: "block", data: { channel: c.nameEn } });
  const required = requiredChannels(channels, today);
  if (required.length === 0) faults.push({ code: "CHANNELS_NOT_SET", level: "block" });
  const dayOf = (id: string) => records.find((r) => r.channelId === id)?.publishedOn ?? null;
  const missing = required.filter((c) => dayOf(c.id) == null);
  for (const c of missing) faults.push({ code: "CHANNEL_MISSING", level: "block", data: { channel: c.nameEn } });
  if (!policy.advertisementDayRule) faults.push({ code: "RULE_NOT_SET", level: "block", data: { setting: "advertisementDayRule" } });
  if (policy.advertisementDayRule === "NAMED_CHANNEL") {
    const named = channels.find((c) => c.id === policy.advertisementChannelId) ?? null;
    if (!named || !required.includes(named)) faults.push({ code: "NAMED_CHANNEL_NOT_REQUIRED", level: "block", data: { channel: named?.nameEn ?? null } });
  }
  if (faults.some((f) => f.level === "block")) return { day: null, missing, faults };
  const day =
    policy.advertisementDayRule === "NAMED_CHANNEL"
      ? dayOf(policy.advertisementChannelId!)
      : required.map((c) => dayOf(c.id)!).reduce((a, b) => (b > a ? b : a));
  return { day, missing, faults };
}

export type ClosingFault =
  | "TIME_ZONE_UNSET"
  | "RULE_NOT_SET"
  | "CALENDAR_NOT_SET"
  | "WEEKEND_NOT_SET"
  | "CALENDAR_NOT_MAINTAINED"
  | "CLOSING_ON_WEEKEND"
  | "PUBLIC_HOLIDAY"
  | "CLOSING_TOO_SOON"
  | "BELOW_TARGET"
  | "NEAR_NEWSPAPER_DAY"
  | "ADVERTISEMENT_DAY_NOT_KNOWN"
  | "TIME_NOT_DEFAULT"
  | "TIME_DIFFERS"
  | "PURCHASE_CLOSE_NOT_SET"
  | "PURCHASE_CUTOFF_TOO_LATE"
  | "PURCHASE_CLOSE_IN_PAST";

/// What the date rules read besides the closing and the last day of sale.
export interface ClosingRules {
  /// YYYY-MM-DD; null while the advertisement day is not known (a correction before publication).
  advertisementDay: string | null;
  /// Why the closing time differs from the default. Empty: no reason given.
  closingTimeReason: string;
  timeZone: string | null;
  policy: WindowPolicyFacts;
  /// The policy's calendar, read; null: the policy names none.
  calendar: CalendarFacts | null;
  /// The organisation's today, to refuse a last purchase day already past. Null: not judged.
  today?: string | null;
}

export interface ClosingInput extends ClosingRules {
  closingAt: Date;
  /// The last day the documents are sold, YYYY-MM-DD; null: not set.
  purchaseCloseDay: string | null;
}

/**
 * Every date rule on a closing. Pure; judged at publication (when the advertisement day is known)
 * and again on every closing change, from the original advertisement day (FR-ADV-015).
 */
export function closingFaults(i: ClosingInput): Finding<ClosingFault>[] {
  const out: Finding<ClosingFault>[] = [];
  const p = i.policy;
  const source = p.dateRuleSource.trim() || null;
  const unset = (setting: PolicySetting) => out.push({ code: "RULE_NOT_SET", level: "block", data: { setting } });
  if (!i.timeZone) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const closingDay = dayIn(i.closingAt, i.timeZone);

  // FR-ADV-005: the calendar, maintained for the closing's year, and the day not a weekend or holiday.
  if (!i.calendar) out.push({ code: "CALENDAR_NOT_SET", level: "block" });
  else {
    const year = Number(closingDay.slice(0, 4));
    if (i.calendar.weekendDays.length === 0) out.push({ code: "WEEKEND_NOT_SET", level: "block", data: { calendar: i.calendar.name } });
    else if (i.calendar.weekendDays.includes(isoWeekday(closingDay))) out.push({ code: "CLOSING_ON_WEEKEND", level: "block", data: { day: closingDay, weekday: isoWeekday(closingDay), source } });
    if (!i.calendar.years.some((y) => y.year === year && y.complete)) out.push({ code: "CALENDAR_NOT_MAINTAINED", level: "block", data: { year, calendar: i.calendar.name } });
    const holiday = i.calendar.holidays.find((h) => h.day === closingDay);
    if (holiday) out.push({ code: "PUBLIC_HOLIDAY", level: "block", data: { day: closingDay, holiday: holiday.nameEn, calendar: i.calendar.name, source } });
  }

  // FR-ADV-004: from the advertisement day to the closing day.
  if (p.minAdvertisementDays == null) unset("minAdvertisementDays");
  if (p.targetAdvertisementDays == null) unset("targetAdvertisementDays");
  if (p.newspaperWarnDays == null) unset("newspaperWarnDays");
  if (i.advertisementDay == null) out.push({ code: "ADVERTISEMENT_DAY_NOT_KNOWN", level: "info" });
  else {
    const days = daysFrom(i.advertisementDay, closingDay);
    const min = p.minAdvertisementDays;
    if (min != null && days < min) out.push({ code: "CLOSING_TOO_SOON", level: "block", data: { days, min, advertisedOn: i.advertisementDay, source } });
    else {
      if (p.targetAdvertisementDays != null && days < p.targetAdvertisementDays) out.push({ code: "BELOW_TARGET", level: "warn", data: { days, target: p.targetAdvertisementDays } });
      // A newspaper later than its day by up to the margin would breach the minimum.
      if (min != null && p.newspaperWarnDays != null && p.newspaperWarnDays > 0 && days < min + p.newspaperWarnDays) out.push({ code: "NEAR_NEWSPAPER_DAY", level: "warn", data: { days, margin: days - min, warn: p.newspaperWarnDays } });
    }
  }

  // FR-ADV-006: the default time, or another with its reason.
  if (p.defaultClosingTime == null) unset("defaultClosingTime");
  else {
    const time = clockTimeIn(i.closingAt, i.timeZone)!;
    if (time !== p.defaultClosingTime) {
      if (!i.closingTimeReason.trim()) out.push({ code: "TIME_NOT_DEFAULT", level: "block", data: { time, default: p.defaultClosingTime } });
      else out.push({ code: "TIME_DIFFERS", level: "info", data: { time, default: p.defaultClosingTime, reason: i.closingTimeReason.trim() } });
    }
  }

  // FR-ADV-007: the last purchase day, at least the cut-off before the closing day.
  if (p.purchaseCutoffDays == null) unset("purchaseCutoffDays");
  if (i.purchaseCloseDay == null) out.push({ code: "PURCHASE_CLOSE_NOT_SET", level: "block" });
  else {
    if (p.purchaseCutoffDays != null && daysFrom(i.purchaseCloseDay, closingDay) < p.purchaseCutoffDays) out.push({ code: "PURCHASE_CUTOFF_TOO_LATE", level: "block", data: { day: i.purchaseCloseDay, cutoff: p.purchaseCutoffDays, closingDay, source } });
    if (i.today && i.purchaseCloseDay < i.today) out.push({ code: "PURCHASE_CLOSE_IN_PAST", level: "block", data: { day: i.purchaseCloseDay } });
  }
  return out;
}

/// What a publication's judgement is frozen with: every rule value, with its provenance.
export function policySnapshot(p: WindowPolicyFacts, calendar: CalendarFacts | null, channels: readonly ChannelFacts[], floor: { regime: string; minimum: string; provenance: string } | null, extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    dateRules: {
      minAdvertisementDays: p.minAdvertisementDays,
      targetAdvertisementDays: p.targetAdvertisementDays,
      newspaperWarnDays: p.newspaperWarnDays,
      purchaseCutoffDays: p.purchaseCutoffDays,
      provenance: p.dateRulesProvenance,
      source: p.dateRuleSource,
    },
    closingTime: { default: p.defaultClosingTime, provenance: p.closingTimeProvenance },
    dayRule: { rule: p.advertisementDayRule, channel: channels.find((c) => c.id === p.advertisementChannelId)?.nameEn ?? null, provenance: p.dayRuleProvenance },
    calendar: calendar ? { name: calendar.name, weekendDays: [...calendar.weekendDays], years: calendar.years.map((y) => ({ ...y })) } : null,
    attendance: { mandatoryPermitted: p.mandatoryAttendancePermitted, provenance: p.attendanceProvenance },
    channels: channels.map((c) => ({ name: c.nameEn, required: c.requiredWhenAdvertised })),
    feeFloor: floor,
    ...extra,
  };
}
