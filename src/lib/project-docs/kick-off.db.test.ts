import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { PermissionKey, StaffActor, SupplierActor } from "@/lib/auth/types";
import { loadContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayPlus } from "@/lib/dates";
import { db } from "@/lib/db";
import { readKickOffMeetings } from "@/lib/portal/data-export-store";
import { loadProjectContext } from "@/lib/portal/projects/context-store";
import { makePerson, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS } from "@/lib/test-db/auth-fixtures";
import type { WrittenAttribution } from "@/lib/test-support/staff";

/**
 * Plan step 7 against a real database: the read-only team lists (§8.1) and the kick-off meeting's acts (§8.2; ADR 0042 D10, PW-5, PW-16, PW-18, PW-19, PW-29).
 *
 * The staff acts run through their server actions (`kick-off-actions.ts`: the form read once, the attribution begun, the contract's lock, PROJECT_WORKSPACE's row, the core),
 * never by inserting rows: recording the meeting held is run end to end, minutes, held columns and attendance in one act, and read back by both cards and the contractor's
 * document page. The SULIT read of a contact's name is the real gate (`sulitGate`), logged.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule();
  h.written = act.written;
  return act.module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { changeKickOff, recordKickOffHeld, scheduleKickOff } from "@/app/projects/[id]/kick-off-actions";
import { sulitGate } from "@/app/_auth/sulit";
import { changeFaults } from "./kick-off";
import { CONTACT_NAME_FIELDS, loadKickOffCard, loadPortalKickOff } from "./kick-off-read";
import { loadPortalDocumentPage } from "./portal-read";
import { loadContractorAccounts, loadPortalTeam, UNNAMED_ACCOUNT } from "./team-read";

const run = randomId();
const TZ = "Asia/Kuala_Lumpur";
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const D = (d: Date | string) => new Date(`${typeof d === "string" ? d : d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const TODAY = dayOf(new Date(), TZ)!;
const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

let organisationId = "";
const ORG_NAME = `Jabatan Mesyuarat ${run}`;
let soRole = "";
let projectClassId = "";
/// `so` holds the S.O. office; `rep` is a representative whose letter lists contractor communication; `diaryRep` one whose letter lists only the diary;
/// `gone` one whose letter was revoked yesterday; `stranger` holds nothing.
const p = { so: "", rep: "", diaryRep: "", gone: "", stranger: "" };
const names: Record<string, string> = {};
let counter = 0;

const staff = (personId: string, permissions: PermissionKey[] = []): StaffActor =>
  ({
    kind: "STAFF",
    accountId: `acc_${personId}`,
    sessionId: `ses_${personId}`,
    personId,
    personName: "Officer",
    jobTitle: null,
    isAdministrator: false,
    organisationId,
    organisationCode: `KOA_${run}`,
    organisationTimeZone: TZ,
    offices: [],
    permissions: new Set<PermissionKey>(permissions),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

async function as<T>(personId: string, fn: () => Promise<T>): Promise<T> {
  h.who = staff(personId);
  return fn();
}

interface Contractor {
  actor: SupplierActor;
  supplierId: string;
  accountId: string;
  contactName: string;
}
async function contractor(): Promise<Contractor> {
  const s = await makeSupplierAccount(organisationId);
  await db.supplier.update({ where: { id: s.supplier.id }, data: { status: "REGISTERED", registeredOn: D(at(-100)) } });
  const actor: SupplierActor = {
    kind: "SUPPLIER",
    accountId: s.account!.id,
    sessionId: `ses_${s.account!.id}`,
    contactId: s.contact.id,
    displayName: s.contact.name,
    supplierId: s.supplier.id,
    supplierName: s.supplier.registeredName,
    loginName: s.loginName,
    organisationId,
    organisationTimeZone: TZ,
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.9",
    mustChangePassword: false,
    resetNoticePending: false,
  };
  return { actor, supplierId: s.supplier.id, accountId: s.account!.id, contactName: s.contact.name };
}

/// A contract awarded to the supplier, with its S.O. office, its representatives (`rep`, `diaryRep`, and `gone`, revoked yesterday).
async function contract(vendorId: string | null, status: ContractStatus = "EXECUTED") {
  const r = randomId();
  const requisition = await db.requisition.create({
    data: { organisationId, reference: `KOA/RQ/${r}`, requestingUnitCode: "KOA_DEPT", requestingPersonId: p.so, title: "Kick-off requisition", justification: "Tests.", needStatement: "None.", costCentreCode: "KOA_CC", accountCode: "KOA_AC", placeOfDelivery: "Nowhere", dateRequired: D(at(100)), estimatedValue: "100000.00", raisedOn: D(at(-30)) },
  });
  const exercise = await db.sourcingExercise.create({ data: { organisationId, reference: `KOA/EX/${r}`, requisitionId: requisition.id, title: `Road ${r}`, estimatedValue: "100000.00", sourcingMethodCode: "KOA_METHOD", status: "EVALUATED" } });
  const award = await db.award.create({ data: { organisationId, reference: `KOA/AW/${r}`, exerciseId: exercise.id, instrumentKind: "WORK_INDENT", awardeeName: "A Contractor", awardedValue: "100000.00", completionPeriod: 90, completionUnit: "DAYS", status: "ISSUED", vendorId } });
  const c = await db.contract.create({ data: { organisationId, number: `KOA/CON/${r}`, numberSource: "SERIES", numberedOn: D(at(-20)), awardId: award.id, contractSum: "100000.00", status } });
  const assignment = await db.contractSoAssignment.create({ data: { organisationId, contractId: c.id, roleCode: soRole, roleLabel: "Superintending Officer (test)", reason: "EXECUTION", matrixLabel: "Test matrix", ruleKey: "so_test", ruleLabel: "S.O. test rule", clause: "7.1", contractValue: "100000.00", warnings: [], effectiveOn: D(at(-20)), recordedAt: at(-20) } });
  const baseline = await db.contractBaseline.create({ data: { organisationId, contractId: c.id, version: 1, reason: "EXECUTED", contractSum: "100000.00", completionPeriod: 90, completionUnit: "DAYS", entered: {}, snapshot: {}, recordedAt: at(-10), recordedOn: D(at(-10)) } });
  let sequence = 0;
  const letter = (kind: "DELEGATION_LETTER" | "DELEGATION_NOTICE") =>
    db.certificate.create({ data: { organisationId, contractId: c.id, kind, status: "ISSUED", baselineId: baseline.id, number: `KOA/CERT/${randomId()}`, sequence: ++sequence, issuedAt: at(-5), issueSnapshot: {}, certificateDate: D(at(-5)), openedAt: at(-6), openedOn: D(at(-6)) } });
  const represent = async (personId: string, scope: ("DIARY" | "CONTRACTOR_COMMUNICATION")[], revokedOn: string | null = null) => {
    const [l, n] = [await letter("DELEGATION_LETTER"), await letter("DELEGATION_NOTICE")];
    await db.soDelegation.create({
      data: {
        organisationId, contractId: c.id, assignmentId: assignment.id, kind: "PRINCIPAL", delegatePersonId: personId, delegateName: names[personId]!, grantorPersonId: p.so, grantorName: "The S.O.", competencyConfirmed: true, competencyNote: "Tests.", variant: "CONVENTIONAL",
        letterCertificateId: l.id, noticeCertificateId: n.id, recordedAt: at(-5), recordedOn: D(at(-5)), scope: { create: scope.map((act) => ({ organisationId, act })) },
        ...(revokedOn ? { revokedOn: D(revokedOn), revokedAt: at(-1), revokeReason: "Moved to another site." } : {}),
      },
    });
  };
  await represent(p.rep, ["CONTRACTOR_COMMUNICATION"]);
  await represent(p.diaryRep, ["DIARY"]);
  await represent(p.gone, ["CONTRACTOR_COMMUNICATION"], dayPlus(TODAY, -1));
  return c.id;
}

/// A file staged for a project document by a person.
async function stage(person: string) {
  const bytes = new TextEncoder().encode(`%PDF-1.4 minutes ${run} ${++counter}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
  const name = `minutes-${counter}.pdf`;
  const doc = await db.document.create({ data: { organisationId, title: name, documentClassId: projectClassId, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, stagedFor: "project-document" } });
  const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: name, recordedByPersonId: person, storedAt: new Date() } });
  return v.id;
}

const scheduleForm = (contractId: string, o: Partial<Record<"meetsOn" | "meetsTime" | "place" | "onlineLink" | "agenda", string>> = {}) =>
  form({ contractId, meetsOn: o.meetsOn ?? dayPlus(TODAY, 7), meetsTime: o.meetsTime ?? "09:30", place: o.place ?? "Site office", onlineLink: o.onlineLink ?? "", agenda: o.agenda ?? "Introductions. Programme. Safety." });
const schedule = (by: string, contractId: string, o: Parameters<typeof scheduleForm>[1] = {}) => as(by, () => scheduleKickOff({ ok: false }, scheduleForm(contractId, o)));
const change = (by: string, contractId: string, o: Parameters<typeof scheduleForm>[1] = {}) => as(by, () => changeKickOff({ ok: false }, scheduleForm(contractId, o)));
const hold = (by: string, contractId: string, o: { heldOn?: string; people?: string[]; accounts?: string[]; others?: string[]; files?: string[] }) =>
  as(by, () => recordKickOffHeld({ ok: false }, form({ contractId, heldOn: o.heldOn ?? TODAY, attendeePersonId: o.people ?? [], attendeeAccountId: o.accounts ?? [], otherName: o.others ?? [], stagedVersionId: o.files ?? [] })));

const meetingOf = (contractId: string) => db.kickOffMeeting.findUnique({ where: { contractId }, include: { attendance: true } });
const loaded = async (contractId: string) => (await loadContract(organisationId, contractId))!;

/// The SULIT read of a contact's name, as the page asks it: the real gate, logged.
const namesFor = (actor: StaffActor) => (s: Parameters<typeof sulitGate>[1]) => sulitGate(actor, s, CONTACT_NAME_FIELDS);
const ENTITLED: PermissionKey[] = ["sulit.read.organisation"];

function sqlState(error: unknown): string {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } };
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return cause.originalCode;
  const direct = (error as { name?: string; cause?: { originalCode?: string } }).cause;
  if ((error as { name?: string }).name === "DriverAdapterError" && direct?.originalCode) return direct.originalCode;
  return cause?.code ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `KOA_${run}`, name: ORG_NAME, timeZone: TZ } });
  organisationId = org.id;
  await setPolicy(organisationId, SUPPLIER_SETTINGS);
  for (const k of Object.keys(p) as (keyof typeof p)[]) {
    const person = await makePerson(organisationId, `Kick-off ${k} ${run}`);
    p[k] = person.id;
    names[person.id] = person.name;
  }
  soRole = `KOA_SO_${run}`;
  await db.roleAssignment.create({ data: { personId: p.so, roleCode: soRole, effectiveFrom: D("2020-01-01") } });
  const cls = await db.documentClass.create({ data: { organisationId, code: "koa_project", nameEn: "Project files", classification: "INTERNAL" } });
  projectClassId = cls.id;
  await db.documentStorePolicy.upsert({ where: { organisationId }, update: { projectDocumentClassId: projectClassId }, create: { organisationId, allowedMediaTypes: ["application/pdf"], maxBytes: BigInt(10_000_000), projectDocumentClassId: projectClassId } });
});

// ------------------------------------------------------------------ §8.1 the team, read-only

describe("§8.1 the team, read-only (PW-16, PW-17)", () => {
  it("lists the contractor's ACTIVE portal accounts only: a disabled account, one waiting for activation and one whose contact is retired are not listed", async () => {
    const c = await contractor();
    const disabled = await makeSupplierAccount(organisationId, { supplierId: c.supplierId, status: "DISABLED" });
    const pending = await makeSupplierAccount(organisationId, { supplierId: c.supplierId, status: "PENDING_ACTIVATION" });
    const retired = await makeSupplierAccount(organisationId, { supplierId: c.supplierId, retired: true });
    const second = await makeSupplierAccount(organisationId, { supplierId: c.supplierId });
    const l = await loaded(await contract(c.supplierId));
    const reader = staff(p.so, ENTITLED);
    const list = await loadContractorAccounts(db, l, reader, namesFor(reader));
    expect(list.rows.map((r) => r.accountId)).toEqual([c.accountId, second.account!.id]);
    expect(list.rows.map((r) => [r.label, r.statusLabel])).toEqual([
      [c.contactName, "Active"],
      [second.contact.name, "Active"],
    ]);
    for (const gone of [disabled, pending, retired]) expect(JSON.stringify(list)).not.toContain(gone.account!.id);
    // The link to manage accounts only for a reader who holds supplierAccounts.manage.
    expect(list.manageHref).toBeNull();
    const manager = staff(p.so, [...ENTITLED, "supplierAccounts.manage"]);
    expect((await loadContractorAccounts(db, l, manager, namesFor(manager))).manageHref).toBe(`/suppliers/${c.supplierId}`);
    // An award with no supplier on the register has no accounts.
    const none = await loadContractorAccounts(db, await loaded(await contract(null)), reader, namesFor(reader));
    expect(none).toMatchObject({ rows: [], noContractor: true });
  });

  it("a reader without the contact SULIT right sees no name: each row reads 'Portal account' with its status, the reason in words, and the refusal is logged", async () => {
    const c = await contractor();
    const l = await loaded(await contract(c.supplierId));
    const reader = staff(p.stranger);
    const list = await loadContractorAccounts(db, l, reader, namesFor(reader));
    expect(list.rows).toEqual([{ accountId: c.accountId, label: UNNAMED_ACCOUNT, named: false, statusLabel: "Active" }]);
    expect(list.namesWithheld).toBeTruthy();
    expect(list.namesWithheld).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    expect(JSON.stringify(list)).not.toContain(c.contactName);
    const logged = await db.sulitAccessEvent.findFirstOrThrow({ where: { organisationId, entity: "Supplier", entityId: c.supplierId, actorPersonId: p.stranger }, orderBy: { at: "desc" } });
    expect(logged).toMatchObject({ outcome: "WITHHELD", scope: "supplier" });
    expect(logged.fields).toEqual(["contactName"]);
  });

  it("the portal lists the S.O. and the representatives in force today, by name and office only: one whose letter was revoked yesterday is gone today", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const ctx = (await loadProjectContext(db, c.actor, contractId))!;
    const team = await loadPortalTeam(db, c.actor, ctx);
    expect(team.dayUnknown).toBe(false);
    const listed = team.members.map((m) => m.name);
    expect(listed).toContain(names[p.so]);
    expect(listed).toContain(names[p.rep]);
    expect(listed).toContain(names[p.diaryRep]);
    expect(listed).not.toContain(names[p.gone]);
    expect(team.members.find((m) => m.name === names[p.so])!.office).toBe("Superintending Officer (test)");
    expect(team.members.find((m) => m.name === names[p.rep])!.office).toBe("Principal Representative");
    // Names and offices only: no id, no contact detail, nothing of who may act.
    for (const m of team.members) expect(Object.keys(m).sort()).toEqual(["name", "office"]);
    expect(JSON.stringify(team)).not.toMatch(new RegExp(`${p.so}|${p.rep}|mayAct|@`));
  });
});

// ------------------------------------------------------------------ §8.2 the kick-off meeting

describe("§8.2 scheduling: one meeting per contract, from EXECUTED, by PW-5 authority", () => {
  it("schedules the one meeting, with its attribution and audit row, and refuses a second", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    h.written.length = 0;
    const first = await schedule(p.so, contractId);
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true });
    const m = (await meetingOf(contractId))!;
    expect(m).toMatchObject({ place: "Site office", onlineLink: "", agenda: "Introductions. Programme. Safety.", scheduledByPersonId: p.so, heldOn: null });
    expect(dayOf(m.meetsAt, TZ)).toBe(dayPlus(TODAY, 7));
    expect(h.written.map((w) => [w.entity, w.entityId, w.slot, w.subjectPersonId])).toEqual([["KickOffMeeting", m.id, "scheduledBy", p.so]]);
    expect((await db.auditEntry.findMany({ where: { organisationId, entity: "KickOffMeeting", entityId: m.id } })).map((a) => a.action)).toEqual(["CREATE"]);
    const second = await schedule(p.so, contractId, { place: "Head office" });
    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already scheduled/);
    expect(await db.kickOffMeeting.count({ where: { contractId } })).toBe(1);
  });

  it("refuses scheduling before the contract is executed (PROJECT_WORKSPACE's row), writing nothing", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId, "LEGALLY_ENDORSED");
    const r = await schedule(p.so, contractId);
    expect(r.ok).toBe(false);
    expect(r.message).toBeTruthy();
    expect(r.message).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    expect(await meetingOf(contractId)).toBeNull();
  });

  it("two concurrent schedulings give one meeting and one refusal, never an error", async () => {
    const contractId = await contract((await contractor()).supplierId);
    h.who = staff(p.so);
    const results = await Promise.all([scheduleKickOff({ ok: false }, scheduleForm(contractId)), scheduleKickOff({ ok: false }, scheduleForm(contractId, { place: "Hall" }))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)!.message).toMatch(/already scheduled/);
    expect(await db.kickOffMeeting.count({ where: { contractId } })).toBe(1);
  });

  it("names what is missing, every fault at once, and writes nothing", async () => {
    const contractId = await contract((await contractor()).supplierId);
    const r = await schedule(p.so, contractId, { meetsOn: "2026-02-30", place: "", onlineLink: "", agenda: "" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Give the day and the time\..*Give the place, or an online link\..*Give the agenda\./);
    expect(await meetingOf(contractId)).toBeNull();
  });
});

describe("§8.2 PW-5: a person without authority is refused every kick-off act", () => {
  it("refuses the stranger and the representative whose letter lists only the diary, at schedule, change and record held; the S.O. and a representative for contractor communication may", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    for (const who of [p.stranger, p.diaryRep, p.gone]) {
      const r = await schedule(who, contractId);
      expect(r.ok, who).toBe(false);
      expect(r.message, who).toMatch(/Only the S\.O\./);
    }
    expect(await meetingOf(contractId)).toBeNull();
    expect((await schedule(p.rep, contractId)).ok).toBe(true);
    for (const who of [p.stranger, p.diaryRep, p.gone]) {
      const changed = await change(who, contractId, { place: "Elsewhere" });
      expect(changed.ok, who).toBe(false);
      expect(changed.message, who).toMatch(/Only the S\.O\./);
      const held = await hold(who, contractId, { people: [p.so], files: [await stage(who)] });
      expect(held.ok, who).toBe(false);
      expect(held.message, who).toMatch(/Only the S\.O\./);
    }
    const m = (await meetingOf(contractId))!;
    expect(m).toMatchObject({ place: "Site office", heldOn: null });
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(0);
    expect((await change(p.so, contractId, { place: "Head office" })).ok).toBe(true);
  });
});

describe("§8.2 changing it before it is held", () => {
  it("changes when, where and the agenda, audited before and after; nothing changed writes nothing; it begins no act slot", async () => {
    const contractId = await contract((await contractor()).supplierId);
    await schedule(p.so, contractId);
    const m = (await meetingOf(contractId))!;
    h.written.length = 0;
    const r = await change(p.rep, contractId, { meetsTime: "14:00", place: "", onlineLink: "meet.example.test/kick-off", agenda: "Introductions. Programme." });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true, message: "Kick-off meeting changed." });
    const after = (await meetingOf(contractId))!;
    expect(after).toMatchObject({ place: "", onlineLink: "meet.example.test/kick-off", agenda: "Introductions. Programme.", scheduledByPersonId: p.so });
    expect(after.meetsAt.getTime() - m.meetsAt.getTime()).toBe(4.5 * 60 * 60 * 1000);
    expect(h.written).toEqual([]);
    const audits = await db.auditEntry.findMany({ where: { organisationId, entity: "KickOffMeeting", entityId: m.id }, orderBy: { at: "asc" } });
    expect(audits.map((a) => a.action)).toEqual(["CREATE", "UPDATE"]);
    const again = await change(p.so, contractId, { meetsTime: "14:00", place: "", onlineLink: "meet.example.test/kick-off", agenda: "Introductions. Programme." });
    expect(again).toMatchObject({ ok: true, message: "Nothing changed." });
    expect(await db.auditEntry.count({ where: { organisationId, entity: "KickOffMeeting", entityId: m.id } })).toBe(2);
  });

  it("a change with no meeting is refused", async () => {
    const contractId = await contract((await contractor()).supplierId);
    const r = await change(p.so, contractId);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Schedule the kick-off meeting first/);
  });
});

describe("§8.2 recording it held: one act, through the real action path (PW-29)", () => {
  it("needs attendance and minutes: each refused alone and together, writing nothing (no minutes document, the meeting not held)", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await schedule(p.so, contractId);
    const noOne = await hold(p.so, contractId, { files: [await stage(p.so)] });
    expect(noOne.ok).toBe(false);
    expect(noOne.message).toMatch(/Tick who attended/);
    const noMinutes = await hold(p.so, contractId, { people: [p.so] });
    expect(noMinutes.ok).toBe(false);
    expect(noMinutes.message).toMatch(/Add the minutes/);
    const neither = await hold(p.so, contractId, { others: ["  "] });
    expect(neither.message).toMatch(/Tick who attended.*Add the minutes|Add the minutes.*Tick who attended/);
    const future = await hold(p.so, contractId, { heldOn: dayPlus(TODAY, 1), people: [p.so], files: [await stage(p.so)] });
    expect(future.message).toMatch(/cannot be after today/);
    expect((await meetingOf(contractId))!.heldOn).toBeNull();
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(0);
    expect(await db.kickOffAttendance.count({ where: { meeting: { contractId } } })).toBe(0);
  });

  it("refuses an attendee who is on neither side: a person of another organisation, another supplier's account", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await schedule(p.so, contractId);
    const other = await contractor();
    const r = await hold(p.so, contractId, { people: [p.so], accounts: [other.accountId], files: [await stage(p.so)] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not on either side/);
    expect((await meetingOf(contractId))!.heldOn).toBeNull();
  });

  it("refuses a meeting not scheduled", async () => {
    const contractId = await contract((await contractor()).supplierId);
    const r = await hold(p.so, contractId, { people: [p.so], files: [await stage(p.so)] });
    expect(r.message).toMatch(/Schedule the kick-off meeting first/);
  });

  it("records it held end to end: the minutes shared with the contractor at once, the four held columns, the attendance once each, the three attributions, and both cards read it", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await schedule(p.so, contractId, { meetsOn: dayPlus(TODAY, -1) });
    const meeting = (await meetingOf(contractId))!;
    const file = await stage(p.rep);
    h.written.length = 0;
    const r = await hold(p.rep, contractId, { heldOn: dayPlus(TODAY, -1), people: [p.so, p.so, p.rep], accounts: [c.accountId, c.accountId], others: ["Consultant's engineer", " consultant's  engineer "], files: [file] });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });

    // The meeting: the four held columns together.
    const held = (await meetingOf(contractId))!;
    expect(held.heldOn).toEqual(D(dayPlus(TODAY, -1)));
    expect(held.heldRecordedByPersonId).toBe(p.rep);
    expect(held.heldRecordedAt).not.toBeNull();
    expect(held.minutesDocumentId).not.toBeNull();
    // Each attendee once.
    expect(held.attendance.map((a) => [a.side, a.personId, a.supplierAccountId, a.name]).sort()).toEqual(
      [
        ["CONTRACTOR", null, c.accountId, ""],
        ["ORGANISATION", p.rep, null, ""],
        ["ORGANISATION", p.so, null, ""],
        [null, null, null, "Consultant's engineer"],
      ].sort(),
    );

    // The minutes: the organisation's document, no approver, Version 1 shared at once, with the one file pinned.
    const doc = await db.projectDocument.findUniqueOrThrow({ where: { id: held.minutesDocumentId! }, include: { approvers: true, versions: { include: { files: true } } } });
    expect(doc).toMatchObject({ contractId, side: "ORGANISATION", title: "Kick-off meeting minutes", kind: null, createdByPersonId: p.rep });
    expect(doc.approvers).toEqual([]);
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0]).toMatchObject({ number: 1, noApproversAtUpload: true, uploadedByPersonId: p.rep });
    expect(doc.versions[0]!.files.map((f) => f.versionId)).toEqual([file]);

    // Three attributions, each on its own record: the meeting's "Recorded by", the minutes' "Raised by" and "Sent by". Never the meeting's slot on the document.
    expect(h.written.map((w) => [w.entity, w.entityId, w.slot, w.subjectPersonId]).sort()).toEqual(
      [
        ["KickOffMeeting", meeting.id, "heldRecordedBy", p.rep],
        ["ProjectDocument", doc.id, "createdByPerson", p.rep],
        ["ProjectDocumentVersion", doc.versions[0]!.id, "uploadedByPerson", p.rep],
      ].sort(),
    );
    // Audited: the meeting's held record, with before and after, and the minutes' rows.
    const audits = await db.auditEntry.findMany({ where: { organisationId, entity: "KickOffMeeting", entityId: meeting.id }, orderBy: { at: "asc" } });
    expect(audits.map((a) => a.action)).toEqual(["CREATE", "UPDATE"]);
    expect(JSON.stringify(audits[1]!.changes)).toContain("Kick-off meeting minutes");
    expect(JSON.stringify(audits[1]!.changes)).not.toContain(c.contactName);
    expect(await db.auditEntry.count({ where: { organisationId, entity: "ProjectDocument", entityId: doc.id } })).toBe(1);

    // The contractor sees the minutes at once: its document page, and its read-only card with the step 5 download.
    const page = await loadPortalDocumentPage(db, c.actor, contractId, doc.id);
    expect(page, "the minutes are visible to the contractor").not.toBeNull();
    expect(page!.versions.map((v) => v.files.length)).toEqual([1]);
    const ctx = (await loadProjectContext(db, c.actor, contractId))!;
    const portal = await loadPortalKickOff(db, c.actor, ctx);
    expect(portal).toMatchObject({ state: "HELD", stateLabel: "Held" });
    expect(portal.held!.minutes!.href).toBe(`/supplier/projects/${contractId}/documents/${doc.id}`);
    expect(portal.held!.minutes!.files.map((f) => f.href)).toEqual([`/supplier/projects/documents/file/${doc.versions[0]!.files[0]!.id}`]);
    expect(portal.held!.attendance).toEqual({ organisation: expect.arrayContaining([names[p.so], names[p.rep]]), contractor: [c.contactName], others: ["Consultant's engineer"] });
    // Who scheduled or recorded it is not the contractor's to read.
    expect(JSON.stringify(portal)).not.toMatch(/recordedBy|scheduledBy/);

    // The staff card: held, its minutes linked, the change and the held record shut, and the contractor's attendee named only with the SULIT right.
    const l = await loaded(contractId);
    const card = await loadKickOffCard(db, l, staff(p.so), new Date(), namesFor(staff(p.so)));
    expect(card).toMatchObject({ state: "HELD", stateLabel: "Held", tone: "ok" });
    expect(card.held!.minutes!.href).toBe(`/projects/${contractId}/documents/${doc.id}`);
    expect(card.held!.recordedBy).toBe(names[p.rep]);
    expect(card.held!.attendance.contractor).toEqual([UNNAMED_ACCOUNT]);
    expect(card.actions.change.allowed).toBe(false);
    expect(card.actions.change.reasons.join(" ")).toMatch(/recorded as held/);
    expect(card.actions.recordHeld.allowed).toBe(false);
    const entitled = staff(p.so, ENTITLED);
    expect((await loadKickOffCard(db, l, entitled, new Date(), namesFor(entitled))).held!.attendance.contractor).toEqual([c.contactName]);

    // The supplier's own export carries the meeting and its own attendee, never the officers or the other name.
    const exported = await readKickOffMeetings(db, c.actor);
    const mine = exported.find((x) => x.contractLabel.startsWith("KOA/CON/") && x.attendance.length === 4)!;
    expect(mine.attendance.filter((a) => a.ownAccountName).map((a) => a.ownAccountName)).toEqual([c.contactName]);
  });

  it("a change after it is held is refused by the rule and by the trigger, and so is a second held record", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    await schedule(p.so, contractId);
    expect((await hold(p.so, contractId, { people: [p.so], files: [await stage(p.so)] })).ok).toBe(true);
    const m = (await meetingOf(contractId))!;
    // The rule.
    expect(changeFaults({ authorityToday: true, held: true, meetsAt: m.meetsAt, place: "Hall", onlineLink: "", agenda: "A" }).map((f) => f.code)).toEqual(["HELD"]);
    const r = await change(p.so, contractId, { place: "Hall" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/recorded as held/);
    // The trigger, for any login, a no-op included.
    expect(await db.kickOffMeeting.update({ where: { id: m.id }, data: { place: "Hall" } }).then(() => null, sqlState)).toBe("PA045");
    expect(await db.$executeRawUnsafe(`UPDATE "KickOffMeeting" SET "agenda" = "agenda" WHERE "id" = $1`, m.id).then(() => null, sqlState)).toBe("PA045");
    const again = await hold(p.so, contractId, { people: [p.so], files: [await stage(p.so)] });
    expect(again.ok).toBe(false);
    expect(again.message).toMatch(/recorded as held/);
    expect(await db.projectDocument.count({ where: { contractId } })).toBe(1);
  });
});

describe("§8.2 the cards: 'Not recorded as held', and the briefing is never the meeting's", () => {
  it("a scheduled meeting whose day has passed reads 'Not recorded as held' on both cards, never upcoming; its own day reads scheduled", async () => {
    const c = await contractor();
    const passed = await contract(c.supplierId);
    await schedule(p.so, passed, { meetsOn: dayPlus(TODAY, -1), meetsTime: "23:30" });
    const l = await loaded(passed);
    const card = await loadKickOffCard(db, l, staff(p.so), new Date(), namesFor(staff(p.so)));
    expect(card).toMatchObject({ state: "NOT_RECORDED_AS_HELD", stateLabel: "Not recorded as held", tone: "warn" });
    expect(card.actions.recordHeld.allowed).toBe(true);
    expect(card.actions.change.allowed).toBe(true);
    expect(card.actions.schedule.allowed).toBe(false);
    expect(card.meeting).toMatchObject({ meetsOn: dayPlus(TODAY, -1), meetsTime: "23:30", place: "Site office", scheduledBy: names[p.so] });
    const ctx = (await loadProjectContext(db, c.actor, passed))!;
    expect((await loadPortalKickOff(db, c.actor, ctx)).stateLabel).toBe("Not recorded as held");

    const today = await contract(c.supplierId);
    await schedule(p.so, today, { meetsOn: TODAY, meetsTime: "00:00" });
    expect((await loadKickOffCard(db, await loaded(today), staff(p.so), new Date(), namesFor(staff(p.so)))).state).toBe("UPCOMING");
  });

  it("the gates say why for a reader without authority, and the meeting never writes the Integrity Pact briefing: briefingMissing is asked unchanged", async () => {
    const c = await contractor();
    const contractId = await contract(c.supplierId);
    const l = await loaded(contractId);
    const stranger = await loadKickOffCard(db, l, staff(p.stranger), new Date(), namesFor(staff(p.stranger)));
    expect(stranger).toMatchObject({ state: "NOT_SCHEDULED", stateLabel: "Not scheduled", meeting: null, held: null, briefingMissing: true });
    expect(stranger.actions.schedule.allowed).toBe(false);
    expect(stranger.actions.schedule.reasons.join(" ")).toMatch(/Only the S\.O\./);
    const so = await loadKickOffCard(db, l, staff(p.so), new Date(), namesFor(staff(p.so)));
    expect(so.actions.schedule).toEqual({ allowed: true, reasons: [] });
    // The held form's choices are read only once there is a meeting to record: no contact's name is read (or logged) for an unscheduled one.
    expect(so.choices).toEqual({ organisation: [], contractor: [], contractorNamesWithheld: null });
    expect(await db.sulitAccessEvent.count({ where: { organisationId, entity: "Supplier", entityId: c.supplierId } })).toBe(0);
    await schedule(p.so, contractId);
    const scheduled = await loadKickOffCard(db, await loaded(contractId), staff(p.so), new Date(), namesFor(staff(p.so)));
    expect(scheduled.choices.organisation.map((x) => x.personId)).toEqual(expect.arrayContaining([p.so, p.rep]));
    expect(scheduled.choices.organisation.map((x) => x.personId)).not.toContain(p.gone);
    expect(scheduled.choices.contractor.map((x) => [x.accountId, x.label])).toEqual([[c.accountId, UNNAMED_ACCOUNT]]);
    expect(scheduled.choices.contractorNamesWithheld).toBeTruthy();
    expect((await hold(p.so, contractId, { people: [p.so], files: [await stage(p.so)] })).ok).toBe(true);
    expect(await db.integrityBriefing.count({ where: { contractId } })).toBe(0);
    expect((await loadKickOffCard(db, await loaded(contractId), staff(p.so), new Date(), namesFor(staff(p.so)))).briefingMissing).toBe(true);
    // A contract not yet executed: the gate says so, in words.
    const early = await loadKickOffCard(db, await loaded(await contract(c.supplierId, "LEGALLY_ENDORSED")), staff(p.so), new Date(), namesFor(staff(p.so)));
    expect(early.actions.schedule.allowed).toBe(false);
    expect(early.briefingMissing).toBe(false);
  });
});
