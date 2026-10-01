"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { ORGANISATION_CODE } from "@/lib/org";
import { REGIME_LABEL } from "@/lib/method/labels";
import type { Regime } from "@/lib/method/types";
import { configFaultText, floorFaults, parseHolidayCsv, policyFaults, weekendFaults, yearFault } from "@/lib/window/config";
import { DAY_RULE_LABEL } from "@/lib/window/labels";
import { ADVERTISEMENT_DAY_RULES, type AdvertisementDayRule } from "@/lib/window/types";
import { FormReader } from "@/lib/validate";

/**
 * Configuration › Invitation controls (6.5): the window policy, publication channels, document fee
 * floors and holiday calendars. Nothing ships (AGENTS.md rule 1): every value here is the
 * customer's, with where it comes from. Each write locks the organisation (or the row), re-reads it,
 * runs the lib's check (`src/lib/window/config.ts`) and writes with its before/after audit row in
 * words, in one transaction. A retired channel or calendar stays on the records that used it.
 */

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
type Prov = (typeof PROVENANCE)[number];
const PROVENANCE_WORDS: Record<Prov, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
const prov = (p: string | null | undefined) => (p ? (PROVENANCE_WORDS[p as Prov] ?? "Not set") : "Not set");
const PATH = "/configuration/invitation";
const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup before adding records." };
const GONE: FormState = { ok: false, message: "That record no longer exists. Reload the page." };
const TRI = ["yes", "no", "unset"] as const;
const tri = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);
const NOT_SET = "Not set";
const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function organisation() {
  return db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, timeZone: true } });
}
const lockOrganisation = (tx: Tx, id: string) => tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR UPDATE`;
function done(): FormState {
  revalidatePath(PATH);
  revalidatePath("/sourcing");
  return { ok: true };
}
const audit = (tx: Tx, organisationId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(tx, { organisationId, entity, entityId, entityLabel, reason }, action, changes);
const refusal = (fs: readonly { code: string; level: "block" | "warn" | "info"; data?: Record<string, string | number | null> }[]): FormState => ({ ok: false, message: `Nothing was saved: ${fs.map(configFaultText).join(" ")}` });

// ------------------------------------------------------------------ the window policy

/**
 * Save the window policy (FR-ADV-004–007, 013; OD-3, OD-7, OD-8). Any field may be left not set:
 * it then blocks the act it governs, naming itself; nothing is defaulted.
 */
export async function saveWindowPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const v = {
    minAdvertisementDays: r.int("minAdvertisementDays", "Minimum days from advertisement to closing", { min: 0 }),
    targetAdvertisementDays: r.int("targetAdvertisementDays", "Target days from advertisement to closing", { min: 0 }),
    newspaperWarnDays: r.int("newspaperWarnDays", "Margin for a late newspaper", { min: 0 }),
    purchaseCutoffDays: r.int("purchaseCutoffDays", "Days between the last day of sale and the closing", { min: 0 }),
    dateRulesProvenance: r.choice("dateRulesProvenance", "Where the date rules come from", PROVENANCE),
    defaultClosingTime: r.optionalText("defaultClosingTime"),
    closingTimeProvenance: r.choice("closingTimeProvenance", "Where the closing time comes from", PROVENANCE),
    advertisementDayRule: r.choice("advertisementDayRule", "Which day is the advertisement day", ADVERTISEMENT_DAY_RULES) as AdvertisementDayRule | null,
    advertisementChannelId: r.optionalText("advertisementChannelId"),
    dayRuleProvenance: r.choice("dayRuleProvenance", "Where the advertisement-day rule comes from", PROVENANCE),
    calendarId: r.optionalText("calendarId"),
    mandatoryAttendancePermitted: tri(r.choice("mandatoryAttendancePermitted", "Mandatory attendance permitted", TRI)),
    attendanceProvenance: r.choice("attendanceProvenance", "Where the attendance rule comes from", PROVENANCE),
    noticeTemplateId: r.optionalText("noticeTemplateId"),
    invitationTemplateId: r.optionalText("invitationTemplateId"),
    addendumTemplateId: r.optionalText("addendumTemplateId"),
    dateRuleSource: r.text("dateRuleSource", "The source the date rules cite", { max: 240 }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const today = todayIn(new Date(), org.timeZone) ?? storedDay(new Date());
    const channels = await tx.publicationChannel.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true, retiredOn: true } });
    const calendars = await tx.holidayCalendar.findMany({ where: { organisationId: org.id }, select: { id: true, name: true, retiredOn: true } });
    const templates = await tx.documentTemplate.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true } });
    const before = await tx.windowPolicy.findUnique({ where: { organisationId: org.id } });
    const fs = policyFaults(
      { ...v, templateIds: [v.noticeTemplateId, v.invitationTemplateId, v.addendumTemplateId] },
      { channels: channels.map((c) => ({ id: c.id, retiredOn: c.retiredOn ? storedDay(c.retiredOn) : null })), calendars: calendars.map((c) => ({ id: c.id, retiredOn: c.retiredOn ? storedDay(c.retiredOn) : null })), templateIds: templates.map((t) => t.id), today },
    );
    if (fs.length) return refusal(fs);
    const words = (p: typeof v | NonNullable<typeof before> | null) =>
      p
        ? {
            minimumDays: p.minAdvertisementDays ?? NOT_SET,
            targetDays: p.targetAdvertisementDays ?? NOT_SET,
            newspaperMargin: p.newspaperWarnDays ?? NOT_SET,
            purchaseCutoffDays: p.purchaseCutoffDays ?? NOT_SET,
            dateRulesFrom: prov(p.dateRulesProvenance),
            defaultClosingTime: p.defaultClosingTime ?? NOT_SET,
            closingTimeFrom: prov(p.closingTimeProvenance),
            advertisementDay: p.advertisementDayRule ? DAY_RULE_LABEL[p.advertisementDayRule] : NOT_SET,
            namedChannel: channels.find((c) => c.id === p.advertisementChannelId)?.nameEn ?? null,
            dayRuleFrom: prov(p.dayRuleProvenance),
            holidayCalendar: calendars.find((c) => c.id === p.calendarId)?.name ?? NOT_SET,
            mandatoryAttendance: p.mandatoryAttendancePermitted == null ? NOT_SET : p.mandatoryAttendancePermitted ? "Permitted" : "Not permitted",
            attendanceFrom: prov(p.attendanceProvenance),
            noticeTemplate: templates.find((t) => t.id === p.noticeTemplateId)?.nameEn ?? NOT_SET,
            invitationTemplate: templates.find((t) => t.id === p.invitationTemplateId)?.nameEn ?? NOT_SET,
            addendumTemplate: templates.find((t) => t.id === p.addendumTemplateId)?.nameEn ?? NOT_SET,
            sourceCited: p.dateRuleSource || null,
          }
        : null;
    const row = { ...v };
    if (!before) {
      const created = await tx.windowPolicy.create({ data: { organisationId: org.id, ...row } });
      await audit(tx, org.id, "WindowPolicy", created.id, "Invitation controls · policy", "CREATE", diffFields(null, words(v)!), reason);
    } else {
      await tx.windowPolicy.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "WindowPolicy", before.id, "Invitation controls · policy", "UPDATE", diffFields(words(before), words(v)!), reason);
    }
    return done();
  });
}

// ------------------------------------------------------------------ channels

const channelWords = (c: { code: string; nameEn: string; nameMs: string | null; requiredWhenAdvertised: boolean | null; governingSource: string; provenance: string; retiredOn?: Date | null }) => ({
  code: c.code,
  name: c.nameEn,
  nameInMalay: c.nameMs,
  required: c.requiredWhenAdvertised == null ? NOT_SET : c.requiredWhenAdvertised ? "Required for every advertised exercise" : "Not required",
  governingSource: c.governingSource || null,
  whereItComesFrom: prov(c.provenance),
  retiredOn: c.retiredOn ? formatDate(storedDay(c.retiredOn)) : null,
});

/// Add or change a publication channel (FR-ADV-001). Whether it is required may be left not set: it then blocks publication, naming it.
export async function saveChannel(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    code: r.code("code", "Code"),
    nameEn: r.text("nameEn", "Name", { required: true, max: 240 }),
    nameMs: r.optionalText("nameMs"),
    requiredWhenAdvertised: tri(r.choice("requiredWhenAdvertised", "Required for an advertised exercise", TRI)),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = id ? await tx.publicationChannel.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const code = before?.code ?? v.code;
    if (!before && (await tx.publicationChannel.findFirst({ where: { organisationId: org.id, code }, select: { id: true } }))) return { ok: false, errors: { code: "Code is already in use." } };
    const row = { ...v, code, provenance: v.provenance! };
    if (!before) {
      const created = await tx.publicationChannel.create({ data: { organisationId: org.id, ...row } });
      await audit(tx, org.id, "PublicationChannel", created.id, `Publication channel · ${row.nameEn}`, "CREATE", diffFields(null, channelWords(created)), reason);
    } else {
      const after = await tx.publicationChannel.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "PublicationChannel", before.id, `Publication channel · ${row.nameEn}`, "UPDATE", diffFields(channelWords(before), channelWords(after)), reason);
    }
    return done();
  });
}

/// Retire a channel (it stays on the publications recorded through it), or bring it back.
export async function setChannelRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const retire = String(data.get("retire") ?? "") === "yes";
  const reason = String(data.get("reason") ?? "").trim();
  if (retire && !reason) return { ok: false, errors: { reason: "Give the reason." } };
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "PublicationChannel" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.publicationChannel.findFirst({ where: { id, organisationId: org.id } });
    if (!before) return GONE;
    const today = todayIn(new Date(), org.timeZone);
    if (!today) return { ok: false, message: "The organisation's time zone is not set, so no day can be recorded. Set it under Configuration, Organisation." };
    const after = await tx.publicationChannel.update({ where: { id }, data: { retiredOn: retire ? dayToDate(today) : null } });
    await audit(tx, org.id, "PublicationChannel", id, `Publication channel · ${before.nameEn}`, "UPDATE", diffFields(channelWords(before), channelWords(after)), reason);
    return done();
  });
}

// ------------------------------------------------------------------ fee floors (FR-ADV-008, OD-6)

const floorWords = (f: { regime: string; minimum: { toString(): string }; governingSource: string; provenance: string }) => ({
  band: REGIME_LABEL[f.regime as Regime] ?? f.regime,
  minimumFee: formatMoney(parseSen(f.minimum.toString())),
  governingSource: f.governingSource || null,
  whereItComesFrom: prov(f.provenance),
});

export async function saveFeeFloor(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  const v = {
    regime: r.text("regime", "Band", { required: true, max: 20 }),
    minimum: r.money("minimum", "Minimum fee", { required: true }),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
  };
  if (r.failed || !v.minimum || !v.provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const existing = await tx.documentFeeFloor.findMany({ where: { organisationId: org.id }, select: { id: true, regime: true } });
    const before = id ? await tx.documentFeeFloor.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const fs = floorFaults(v.regime, existing, id);
    if (fs.length) return { ok: false, errors: { regime: fs.map(configFaultText).join(" ") } };
    const row = { regime: v.regime, minimum: v.minimum!, governingSource: v.governingSource, provenance: v.provenance!, notes: v.notes };
    if (!before) {
      const created = await tx.documentFeeFloor.create({ data: { organisationId: org.id, ...row } });
      await audit(tx, org.id, "DocumentFeeFloor", created.id, `Fee floor · ${REGIME_LABEL[row.regime as Regime] ?? row.regime}`, "CREATE", diffFields(null, floorWords(created)), reason);
    } else {
      const after = await tx.documentFeeFloor.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "DocumentFeeFloor", before.id, `Fee floor · ${REGIME_LABEL[row.regime as Regime] ?? row.regime}`, "UPDATE", diffFields(floorWords(before), floorWords(after)), reason);
    }
    return done();
  });
}

/// Remove a floor, with a reason: the band then has none, and its exercises' publication blocks naming it.
export async function removeFeeFloor(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Give the reason." } };
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = await tx.documentFeeFloor.findFirst({ where: { id, organisationId: org.id } });
    if (!before) return GONE;
    await tx.documentFeeFloor.delete({ where: { id } });
    await audit(tx, org.id, "DocumentFeeFloor", id, `Fee floor · ${REGIME_LABEL[before.regime as Regime] ?? before.regime}`, "DELETE", diffFields(floorWords(before), { band: null, minimumFee: null, governingSource: null, whereItComesFrom: null }), reason);
    return done();
  });
}

// ------------------------------------------------------------------ holiday calendars (FR-ADV-005, OD-7)

const calendarWords = (c: { code: string; name: string; weekendDays: number[]; weekendProvenance: string | null; governingSource: string; provenance: string; retiredOn?: Date | null }) => ({
  code: c.code,
  name: c.name,
  weekend: c.weekendDays.length ? c.weekendDays.map((d) => WEEKDAY[d]).join(", ") : NOT_SET,
  weekendFrom: prov(c.weekendProvenance),
  governingSource: c.governingSource || null,
  whereItComesFrom: prov(c.provenance),
  retiredOn: c.retiredOn ? formatDate(storedDay(c.retiredOn)) : null,
});

export async function saveCalendar(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "").trim() || null;
  const r = new FormReader(data);
  // The shared multi-select posts its choices as one newline-joined value.
  const weekendDays = data.getAll("weekendDays").flatMap((x) => String(x).split("\n")).filter((x) => x.trim() !== "").map((x) => Number(x)).filter((x) => !Number.isNaN(x));
  const v = {
    code: r.code("code", "Code"),
    name: r.text("name", "Name", { required: true, max: 240 }),
    weekendProvenance: r.choice("weekendProvenance", "Where the weekend comes from", PROVENANCE),
    governingSource: r.text("governingSource", "Source", { max: 240 }),
    provenance: r.choice("provenance", "Where it comes from", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
  };
  const wf = weekendFaults(weekendDays);
  if (wf.length) r.reject("weekendDays", configFaultText(wf[0]));
  if (r.failed || !v.provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await lockOrganisation(tx, org.id);
    const before = id ? await tx.holidayCalendar.findFirst({ where: { id, organisationId: org.id } }) : null;
    if (id && !before) return GONE;
    const code = before?.code ?? v.code;
    if (!before && (await tx.holidayCalendar.findFirst({ where: { organisationId: org.id, code }, select: { id: true } }))) return { ok: false, errors: { code: "Code is already in use." } };
    const row = { ...v, code, weekendDays: [...new Set(weekendDays)].sort(), provenance: v.provenance! };
    if (!before) {
      const created = await tx.holidayCalendar.create({ data: { organisationId: org.id, ...row } });
      await audit(tx, org.id, "HolidayCalendar", created.id, `Holiday calendar · ${row.name}`, "CREATE", diffFields(null, calendarWords(created)), reason);
    } else {
      const after = await tx.holidayCalendar.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "HolidayCalendar", before.id, `Holiday calendar · ${row.name}`, "UPDATE", diffFields(calendarWords(before), calendarWords(after)), reason);
    }
    return done();
  });
}

/// Retire a calendar (a policy naming it then refuses to save until it names another), or bring it back.
export async function setCalendarRetired(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const retire = String(data.get("retire") ?? "") === "yes";
  const reason = String(data.get("reason") ?? "").trim();
  if (retire && !reason) return { ok: false, errors: { reason: "Give the reason." } };
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "HolidayCalendar" WHERE id = ${id} FOR UPDATE`;
    const before = await tx.holidayCalendar.findFirst({ where: { id, organisationId: org.id } });
    if (!before) return GONE;
    const today = todayIn(new Date(), org.timeZone);
    if (!today) return { ok: false, message: "The organisation's time zone is not set, so no day can be recorded. Set it under Configuration, Organisation." };
    const after = await tx.holidayCalendar.update({ where: { id }, data: { retiredOn: retire ? dayToDate(today) : null } });
    await audit(tx, org.id, "HolidayCalendar", id, `Holiday calendar · ${before.name}`, "UPDATE", diffFields(calendarWords(before), calendarWords(after)), reason);
    return done();
  });
}

/**
 * Say whether a year of a calendar is maintained in full, and where its list comes from (OD-7: a
 * closing in a year not complete blocks). Marking it complete is the customer's statement.
 */
export async function saveCalendarYear(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const calendarId = String(data.get("calendarId") ?? "");
  const r = new FormReader(data);
  const year = r.int("year", "Year", { required: true });
  const complete = r.bool("complete");
  const source = r.text("source", "Where the year's list comes from", { max: 240 });
  const provenance = r.choice("provenance", "Where it comes from", PROVENANCE, { required: true });
  const yf = year == null ? null : yearFault(year);
  if (yf) r.reject("year", configFaultText(yf));
  if (r.failed || year == null || !provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "HolidayCalendar" WHERE id = ${calendarId} FOR UPDATE`;
    const cal = await tx.holidayCalendar.findFirst({ where: { id: calendarId, organisationId: org.id }, select: { id: true, name: true } });
    if (!cal) return GONE;
    const before = await tx.holidayCalendarYear.findUnique({ where: { calendarId_year: { calendarId, year } } });
    const words = (y: { complete: boolean; source: string; provenance: string } | null) => (y ? { year, maintainedInFull: y.complete ? "Yes" : "No", listFrom: y.source || null, whereItComesFrom: prov(y.provenance) } : null);
    const row = { complete, source, provenance };
    if (!before) {
      const created = await tx.holidayCalendarYear.create({ data: { organisationId: org.id, calendarId, year, ...row } });
      await audit(tx, org.id, "HolidayCalendarYear", created.id, `Holiday calendar · ${cal.name} · ${year}`, "CREATE", diffFields(null, words(created)!), reason);
    } else {
      await tx.holidayCalendarYear.update({ where: { id: before.id }, data: row });
      await audit(tx, org.id, "HolidayCalendarYear", before.id, `Holiday calendar · ${cal.name} · ${year}`, "UPDATE", diffFields(words(before), words(row)!), reason);
    }
    return done();
  });
}

const holidayWords = (h: { day: Date; nameEn: string; nameMs: string | null; gazetteRef: string; provenance: string }) => ({ day: formatDate(storedDay(h.day)), name: h.nameEn, nameInMalay: h.nameMs, gazette: h.gazetteRef || null, whereItComesFrom: prov(h.provenance) });

/// Add a public holiday to a calendar.
export async function saveHoliday(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const calendarId = String(data.get("calendarId") ?? "");
  const r = new FormReader(data);
  const day = r.date("day", "Day", { required: true });
  const nameEn = r.text("nameEn", "Name", { required: true, max: 240 });
  const nameMs = r.optionalText("nameMs");
  const gazetteRef = r.text("gazetteRef", "Gazette reference", { max: 240 });
  const provenance = r.choice("provenance", "Where it comes from", PROVENANCE, { required: true });
  if (r.failed || !day || !provenance) return { ok: false, errors: r.errors };
  const reason = String(data.get("reason") ?? "");
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "HolidayCalendar" WHERE id = ${calendarId} FOR UPDATE`;
    const cal = await tx.holidayCalendar.findFirst({ where: { id: calendarId, organisationId: org.id }, select: { id: true, name: true } });
    if (!cal) return GONE;
    if (await tx.publicHoliday.findUnique({ where: { calendarId_day: { calendarId, day } } })) return { ok: false, errors: { day: configFaultText({ code: "HOLIDAY_EXISTS", level: "block", data: { day: formatDate(storedDay(day)) } }) } };
    const row = { day, nameEn, nameMs, gazetteRef, provenance };
    const created = await tx.publicHoliday.create({ data: { organisationId: org.id, calendarId, ...row } });
    await audit(tx, org.id, "PublicHoliday", created.id, `Holiday calendar · ${cal.name} · ${nameEn}`, "CREATE", diffFields(null, holidayWords(created)), reason);
    return done();
  });
}

/// Remove a public holiday added in error, with a reason.
export async function removeHoliday(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "Give the reason." } };
  return db.$transaction(async (tx): Promise<FormState> => {
    const h = await tx.publicHoliday.findFirst({ where: { id, organisationId: org.id }, include: { calendar: { select: { id: true, name: true } } } });
    if (!h) return GONE;
    await tx.$queryRaw`SELECT id FROM "HolidayCalendar" WHERE id = ${h.calendarId} FOR UPDATE`;
    await tx.publicHoliday.delete({ where: { id } });
    await audit(tx, org.id, "PublicHoliday", id, `Holiday calendar · ${h.calendar.name} · ${h.nameEn}`, "DELETE", diffFields(holidayWords(h), { day: null, name: null, nameInMalay: null, gazette: null, whereItComesFrom: null }), reason);
    return done();
  });
}

/**
 * Import a year's public holidays from CSV text (`day,name[,nameMs][,gazetteRef]`). Every line is
 * judged first and nothing is taken from a file with a fault; each holiday is audited. Whether
 * the year is then complete is said separately (`saveCalendarYear`).
 */
export async function importHolidayYear(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await organisation();
  if (!org) return NO_ORG;
  const calendarId = String(data.get("calendarId") ?? "");
  const r = new FormReader(data);
  const year = r.int("year", "Year", { required: true });
  const csv = String(data.get("csv") ?? "");
  const provenance = r.choice("provenance", "Where it comes from", PROVENANCE, { required: true });
  if (!csv.trim()) r.reject("csv", "Paste the year's holidays, one per line.");
  if (csv.length > 100_000) r.reject("csv", "The list is too long for one year.");
  if (r.failed || year == null || !provenance) return { ok: false, errors: r.errors };
  return db.$transaction(async (tx): Promise<FormState> => {
    await tx.$queryRaw`SELECT id FROM "HolidayCalendar" WHERE id = ${calendarId} FOR UPDATE`;
    const cal = await tx.holidayCalendar.findFirst({ where: { id: calendarId, organisationId: org.id }, select: { id: true, name: true } });
    if (!cal) return GONE;
    const existing = (await tx.publicHoliday.findMany({ where: { calendarId }, select: { day: true } })).map((h) => storedDay(h.day));
    const parsed = parseHolidayCsv(csv, year, existing);
    if (parsed.faults.length) return { ok: false, errors: { csv: parsed.faults.map(configFaultText).join(" ") } };
    for (const h of parsed.rows) {
      const created = await tx.publicHoliday.create({ data: { organisationId: org.id, calendarId, day: dayToDate(h.day), nameEn: h.nameEn, nameMs: h.nameMs, gazetteRef: h.gazetteRef, provenance } });
      await audit(tx, org.id, "PublicHoliday", created.id, `Holiday calendar · ${cal.name} · ${h.nameEn}`, "CREATE", diffFields(null, holidayWords(created)), `Imported for ${year}`);
    }
    revalidatePath(PATH);
    return { ok: true, message: `${parsed.rows.length} holiday${parsed.rows.length === 1 ? "" : "s"} imported for ${year}. Say whether ${year} is now maintained in full.` };
  });
}
