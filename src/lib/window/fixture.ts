/**
 * Test fixtures for the window's rules: the spec's worked examples (SK002 7.4.2: two weeks
 * minimum, three weeks target, two days' purchase cut-off, 14:30, RM250 / RM50 floors) as a
 * customer would configure them. Test-only: never seeded, never in the demo (X-10 d), and never a
 * default — the product ships every one of these empty.
 */

import type { CalendarFacts, ChannelFacts, EventFacts, FeeFloorFacts, WindowPolicyFacts } from "./types";

export const SPEC_POLICY: WindowPolicyFacts = {
  minAdvertisementDays: 14,
  targetAdvertisementDays: 21,
  newspaperWarnDays: 3,
  purchaseCutoffDays: 2,
  dateRulesProvenance: "STATED",
  defaultClosingTime: "14:30",
  closingTimeProvenance: "STATED",
  advertisementDayRule: "LATEST_REQUIRED_CHANNEL",
  advertisementChannelId: null,
  dayRuleProvenance: "ASSUMED",
  calendarId: "cal",
  mandatoryAttendancePermitted: true,
  attendanceProvenance: "ASSUMED",
  noticeTemplateId: "tpl-notice",
  invitationTemplateId: "tpl-letter",
  addendumTemplateId: "tpl-addendum",
  dateRuleSource: "SK002 7.4.2(g)",
};

export const SPEC_CALENDAR: CalendarFacts = {
  id: "cal",
  name: "State calendar",
  weekendDays: [6, 7],
  years: [
    { year: 2026, complete: true },
    { year: 2027, complete: false },
  ],
  holidays: [{ day: "2026-12-25", nameEn: "Christmas Day" }],
};

export const NEWSPAPER: ChannelFacts = { id: "ch-news", nameEn: "Newspaper", requiredWhenAdvertised: true, retiredOn: null };
export const NOTICE_BOARD: ChannelFacts = { id: "ch-board", nameEn: "Notice board", requiredWhenAdvertised: true, retiredOn: null };
export const WEBSITE: ChannelFacts = { id: "ch-web", nameEn: "Website", requiredWhenAdvertised: true, retiredOn: null };
export const SPEC_CHANNELS: readonly ChannelFacts[] = [NEWSPAPER, NOTICE_BOARD, WEBSITE];

export const SPEC_FLOORS: readonly FeeFloorFacts[] = [
  { regime: "tender", minimum: 25_000n },
  { regime: "quotation", minimum: 5_000n },
];

/// 14:30 on a day in Kuala Lumpur, as the instant the exercise stores.
export const klAt = (day: string, time = "14:30") => new Date(`${day}T${time}:00+08:00`);

export const event = (over: Partial<EventFacts> = {}): EventFacts => ({
  id: "ev1",
  kind: "BRIEFING",
  startsAt: klAt("2026-11-06", "10:00"),
  place: "Meeting room 2",
  mandatory: false,
  heldOn: null,
  cancelled: false,
  attendeePartyIds: [],
  ...over,
});
