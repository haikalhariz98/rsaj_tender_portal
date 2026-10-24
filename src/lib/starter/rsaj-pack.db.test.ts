import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import GENERIC_PACK from "../../../prisma/packs/generic";
import RSAJ_PACK from "../../../prisma/rsaj/starter-pack";
import { actFieldNames } from "@/lib/auth/act-field-names";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor } from "@/lib/auth/types";
import { loadMakers } from "@/lib/authority/maker-store";
import { db } from "@/lib/db";
import { reminderDue, SUPPLIER_EXPIRY_EVENT } from "@/lib/suppliers/expiry";
import { facts, makeAccount, randomId } from "@/lib/test-db/auth-fixtures";

import { loadPacks } from "./apply";

/**
 * `rsaj,generic` into a fresh organisation (plan step 4.4): a dry run writes nothing; the load writes the DAL and the two evaluation models as
 * drafts only (no issue date, no issuer, no maker); a second load writes nothing. Then the DAL is put in force by one named person through
 * the real adopt and issue actions while approval by another admin is off, and refused to that same person while it is on: the switch and the
 * issue triggers still guard it. Only the request is stood in for (who is signed in, the cache), as in matrix-issue.db.test.ts.
 */

const who = vi.hoisted(() => ({ actor: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    staffForPermission: async (key: string) => (who.actor!.permissions.has(key as never) ? { ok: true as const, actor: who.actor! } : { ok: false as const, state: { ok: false as const, message: `Not permitted: ${key}` } }),
  };
});
vi.mock("@/app/_auth/act", async () => {
  const begin = await import("@/lib/auth/act-begin");
  const { attributeAct } = await import("@/lib/auth/attribution-store");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  const deps: import("@/lib/auth/act-begin").ActDeps = {
    now: () => new Date(),
    paperSignatureRecording: async () => null,
    stepUp: async (actor, password) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "vitest" });
      return r.ok ? r : { ok: false, message: r.kind };
    },
    attribute: attributeAct,
  };
  return {
    beginAct: (actor: StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));

import { adoptDraft, chooseRoute, issueDraft, startRevision } from "@/app/configuration/approval-matrix/actions";
import { loadMatrix } from "@/lib/authority/load";
import { resolveApproval } from "@/lib/authority/resolve";

let orgId = "";
const PACKS = [RSAJ_PACK, GENERIC_PACK];
const audits = () => db.auditEntry.count({ where: { organisationId: orgId } });
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeAll(async () => {
  orgId = (await db.organisation.create({ data: { code: `RSAJ_${randomId()}`, name: "RSAJ pack test" }, select: { id: true } })).id;
});

describe("loading rsaj,generic", () => {
  it("writes nothing on a dry run", async () => {
    const r = await loadPacks(db, orgId, PACKS, { apply: false });
    expect(r.faults).toEqual([]);
    expect(r.skips).toEqual([]);
    expect(r.applied).toBe(false);
    expect(await audits()).toBe(0);
  });

  it("loads the DAL and the evaluation models as drafts only, with no maker", async () => {
    const r = await loadPacks(db, orgId, PACKS, { apply: true });
    expect(r.faults).toEqual([]);
    expect(r.applied).toBe(true);
    const matrices = await db.authorityMatrix.findMany({ where: { organisationId: orgId }, include: { _count: { select: { rules: true, coreRouting: true, termsBands: true } } } });
    expect(matrices).toHaveLength(1);
    expect(matrices[0]).toMatchObject({ issuedAt: null, issuedByPersonId: null, makersUnknownAtLanding: false, _count: { rules: RSAJ_PACK.drafts!.matrices![0].rules.length, coreRouting: 4, termsBands: 2 } });
    expect((await loadMakers(db, matrices[0].id)).personIds).toEqual([]);
    const models = await db.evaluationModel.findMany({ where: { organisationId: orgId }, select: { status: true, issuedAt: true, provenance: true, _count: { select: { stages: true } } } });
    expect(models).toEqual([
      { status: "DRAFT", issuedAt: null, provenance: "OBSERVED", _count: { stages: 6 } },
      { status: "DRAFT", issuedAt: null, provenance: "OBSERVED", _count: { stages: 6 } },
    ]);
    expect(await db.configurationDraftMaker.count({ where: { organisationId: orgId } })).toBe(0);
    // B3: the boundary ruling is written STATED with its source (RSAJ answer 3), and the trail says so.
    expect(matrices[0]).toMatchObject({ boundaryInclusive: true, boundaryProvenance: "STATED", boundarySource: RSAJ_PACK.drafts!.matrices![0].boundarySource });
    expect(matrices[0].boundarySource).toMatch(/RSAJ answer 3$/);
    const matrixTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "AuthorityMatrix", entityId: matrices[0].id } });
    expect(matrixTrail.changes).toContainEqual(expect.objectContaining({ field: "boundaryRuling", after: expect.stringMatching(/^Stated: DAL /) }));
    // A stacked-code rule (RSAJ answer 1) is STATED, its chain in the order printed, and the trail cites the reading.
    const rule = await db.authorityRule.findFirstOrThrow({ where: { authorityMatrixId: matrices[0].id, ruleKey: "DP_ABOVE_5M" }, include: { recommenders: { orderBy: { sequence: "asc" } } } });
    expect([rule.proposerCode, ...rule.recommenders.map((x) => `${x.roleCode} ${x.act}`), rule.approverCode]).toEqual(["HOD", "AD JR", "HODIV R", "TBC MR", "BOD"]);
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "AuthorityRule", entityId: rule.id } });
    expect(trail.changes).toContainEqual(expect.objectContaining({ field: "whereItComesFrom", after: "Stated" }));
    expect(trail.changes).toContainEqual(expect.objectContaining({ field: "governingSource", after: expect.stringMatching(/stacked code read per RSAJ answer 1/) }));
    // A10: the quotation document fee floor, STATED, its audit row naming the regime in words.
    const floor = await db.documentFeeFloor.findUniqueOrThrow({ where: { organisationId_regime: { organisationId: orgId, regime: "quotation" } } });
    expect([floor.minimum.toString(), floor.provenance, floor.governingSource]).toEqual(["50", "STATED", "SK002 (minimum RM50); answers 7–9"]);
    const floorTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "DocumentFeeFloor", entityId: floor.id } });
    expect(floorTrail.entityLabel).toBe("Document fee floor · Quotation");
    expect(floorTrail.changes).not.toContainEqual(expect.objectContaining({ field: "regime" }));
    const tenderFloor = await db.documentFeeFloor.findUniqueOrThrow({ where: { organisationId_regime: { organisationId: orgId, regime: "tender" } } });
    expect([tenderFloor.minimum.toString(), tenderFloor.provenance, tenderFloor.governingSource]).toEqual(["250", "STATED", "FR-ADV-008; SK002 7.4.2(d)"]);
    // A row that names its own provenance keeps it, and its audit row says so (the quotation declaration, placed last).
    const declaration = await db.tenderDocumentPart.findFirstOrThrow({ where: { organisationId: orgId, code: "q_declaration" } });
    expect(declaration).toMatchObject({ provenance: "ASSUMED", printedNumber: "10", returnedByBidder: true });
    const partTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "TenderDocumentPart", entityId: declaration.id } });
    expect(partTrail.changes).toContainEqual(expect.objectContaining({ field: "whereItComesFrom", after: "Assumed" }));
    expect((await db.committee.findMany({ where: { organisationId: orgId }, select: { aliases: true } })).flatMap((c) => c.aliases)).toEqual(["Variation Order Committee"]);
    // The window and the Tender Board read as stated.
    const window = await db.windowPolicy.findUniqueOrThrow({ where: { organisationId: orgId }, include: { advertisementChannel: { select: { code: true } } } });
    expect(window).toMatchObject({ minAdvertisementDays: 14, newspaperWarnDays: 0, purchaseCutoffDays: 2, defaultClosingTime: "14:30", documentSaleMode: "ONLINE", electronicDocumentRelease: true, dateRulesProvenance: "STATED", advertisementDayRule: "NAMED_CHANNEL", dayRuleProvenance: "STATED", advertisementChannel: { code: "newspaper" } });
    expect(await db.committee.findFirstOrThrow({ where: { organisationId: orgId, code: "TBC" } })).toMatchObject({ quorum: 3, quorumProvenance: "STATED" });
    expect(await db.methodChecklistItem.count({ where: { sourcingMethod: { organisationId: orgId, code: "selected_tender" } } })).toBe(10);

    // Part 2 (step 4.6): the award clocks, the post-award figures, the register's bands, its bodies and types, and both packs' series side by side.
    const where = { where: { organisationId: orgId } };
    expect(await db.awardPolicy.findUniqueOrThrow(where)).toMatchObject({ indentValidityDays: 14, commencementGraceDays: 7, regulatedActivityLabel: "Water Services works", provenance: "STATED" });
    const post = await db.postAwardPolicy.findUniqueOrThrow(where);
    expect([post.inDelayProgressPct?.toString(), post.firstReleasePct?.toString(), post.designBondPct?.toString(), post.designBondYears, post.inDelayProvenance, post.designBondYearsProvenance]).toEqual(["70", "50", "5", 5, "STATED", "STATED"]);
    expect(await db.contractPolicy.findUniqueOrThrow(where)).toMatchObject({ controlledCopyStampEn: "Controlled Copy", legalOfficeCode: null });
    expect(await db.supplierPolicy.findUniqueOrThrow(where)).toMatchObject({ criticalDays: 30, warningDays: 60, upcomingDays: 90, bandsProvenance: "STATED", verificationNoticeEn: expect.any(String) });
    const cidb = await db.supplierDocumentType.findFirstOrThrow({ where: { organisationId: orgId, code: "cidb_certificate" }, include: { body: true } });
    expect(cidb).toMatchObject({ valueKinds: ["GRADE", "CATEGORY", "SPECIALISATION"], expires: true, mandatoryAtRegistration: null, provenance: "STATED", body: { code: "cidb" } });
    expect(await db.supplierDocumentType.count(where)).toBe(13);
    expect(await db.distributionRecipient.count({ where: { organisationId: orgId, onlyWhenRegulated: true } })).toBe(1);
    expect((await db.codeFormat.findMany({ ...where, orderBy: { key: "asc" } })).map((f) => f.key)).toEqual(["erp_indent_no", "erp_note_no", "erp_requisition_no"]);
    const series = await db.numberingSeries.findMany({ ...where, select: { key: true, pattern: true } });
    expect(series).toHaveLength(13);
    expect(series).toContainEqual({ key: "contract_tender", pattern: "RSAJ/KP/T/{SERIAL}/{YEAR}" });
    expect(series).toContainEqual({ key: "exercise_tender", pattern: "RSAJ/TA/{SERIAL}/{YEAR}" });
    expect(series).toContainEqual({ key: "direct_appointment", pattern: "RSAJ/KP/ST/{SERIAL}/{SHORTYEAR}" });
    expect((await db.contractType.findFirstOrThrow({ where: { organisationId: orgId, code: "consultancy" } })).contractSeriesKey).toBe("contract_consultancy");
    expect((await db.supplierDocumentType.findFirstOrThrow({ where: { organisationId: orgId, code: "suruhanjaya_tenaga" }, include: { body: true } })).body).toMatchObject({ code: "st", labelEn: "Suruhanjaya Tenaga" });
    expect(series).toContainEqual({ key: "requisition", pattern: "REQ/{YEAR}/{SERIAL}" });
    // ST-13: the expiry reminders, STATED, naming no office; a document 30 days from expiry is reminded at 30.
    const reminders = await db.notificationRule.findUniqueOrThrow({ where: { organisationId_eventKey: { organisationId: orgId, eventKey: SUPPLIER_EXPIRY_EVENT } } });
    expect(reminders).toMatchObject({ nameEn: "Supplier document expiring", recipientRoleCodes: [], reminderOffsetDays: [90, 60, 30, 7], isActive: true, provenance: "STATED" });
    expect(reminderDue({ startsOn: "2025-01-01", expiresOn: "2026-12-01" }, reminders.reminderOffsetDays, "2026-11-01")).toEqual({ offset: 30, dueOn: "2026-11-01" });
    const ruleTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "NotificationRule", entityId: reminders.id } });
    expect(ruleTrail.changes).toContainEqual(expect.objectContaining({ field: "governingSource", after: "Specification FR-VND-008" }));
  });

  it("writes nothing the second time, and says the drafts already exist", async () => {
    const before = await audits();
    const r = await loadPacks(db, orgId, PACKS, { apply: true });
    expect(r.faults).toEqual([]);
    expect(r.writes).toEqual([]);
    expect(r.skips.filter((s) => s.reason === "DRAFT_EXISTS").map((s) => s.target)).toHaveLength(3);
    expect(await audits()).toBe(before);
  });
});

describe("putting the DAL in force", () => {
  it("is done by one named person while approval by another admin is off, and refused to that person while it is on", async () => {
    const draft = await db.authorityMatrix.findFirstOrThrow({ where: { organisationId: orgId } });
    const person = await makeAccount(orgId, { admin: true });
    const token = randomBytes(32).toString("base64url");
    await createStaffSession(db, { organisationId: orgId, accountId: person.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
    const read = await readStaffSession(token, { sourceAddress: null });
    if (!read.ok) throw new Error(`read failed: ${read.reason}`);
    who.actor = read.actor as StaffActor;
    const issue = () => issueDraft({ ok: false }, form({ id: draft.id, effectiveFrom: "2030-01-01", reason: "Confirmed against the DAL", [actFieldNames("personId").password]: person.password }));

    // A pack's draft has no maker: it is adopted first.
    expect(await issue()).toMatchObject({ ok: false, message: expect.stringContaining("Nobody is recorded") });
    expect(await adoptDraft({ ok: false }, form({ id: draft.id, reason: "I reviewed the transcription" }))).toEqual({ ok: true });

    // Decision D2 (B2): the pack loads both readings, none chosen; a route is chosen on the draft, audited with its reason.
    const choose = (domain: string, option: string, reason = "RSAJ follows the DAL") => chooseRoute({ ok: false }, form({ authorityMatrixId: draft.id, domain, option, reason }));
    const optionsOf = async (authorityMatrixId: string, domain: string) =>
      new Set((await db.authorityRule.findMany({ where: { authorityMatrixId, domain, choiceOptionEn: { not: null } }, select: { choiceOptionEn: true, chosen: true } })).map((t) => `${t.choiceOptionEn}: ${t.chosen}`));
    expect(await optionsOf(draft.id, "termination")).toEqual(new Set(["DAL Appendix B: null", "SK008 §7.5.1: null"]));
    const loadedTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "AuthorityRule", entityLabel: { endsWith: "Termination, arbitration or litigation, quotation contract" } } });
    expect(loadedTrail.changes).toContainEqual(expect.objectContaining({ field: "routeOption", after: "DAL Appendix B, not chosen yet" }));
    expect(await choose("termination", "Not an option")).toMatchObject({ ok: false, errors: { option: expect.any(String) } });
    expect(await choose("termination", "DAL Appendix B", "")).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect(await choose("termination", "DAL Appendix B")).toEqual({ ok: true });
    expect(await optionsOf(draft.id, "termination")).toEqual(new Set(["DAL Appendix B: true", "SK008 §7.5.1: false"]));
    const chosenTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "AuthorityMatrix", entityId: draft.id, reason: "RSAJ follows the DAL" } });
    expect(chosenTrail.changes).toContainEqual(expect.objectContaining({ field: "routeChosen", before: "Not chosen", after: "DAL Appendix B" }));
    expect((await loadMakers(db, draft.id)).personIds).toEqual([person.person.id]);

    await db.securityPolicy.update({ where: { organisationId: orgId }, data: { twoPersonChanges: true } });
    expect(await issue()).toMatchObject({ ok: false, message: expect.stringMatching(/second person|cannot issue/) });
    expect((await db.authorityMatrix.findUniqueOrThrow({ where: { id: draft.id } })).issuedAt).toBeNull();

    await db.securityPolicy.update({ where: { organisationId: orgId }, data: { twoPersonChanges: false } });
    // An office the DAL routes to with nobody holding it (the Head of Administration Division, B.4) does not hold back putting it in force.
    const ad = await db.authorityRole.findFirstOrThrow({ where: { organisationId: orgId, code: "AD" } });
    expect(await db.roleAssignment.count({ where: { roleCode: "AD", person: { organisationId: orgId } } })).toBe(0);
    expect(ad.nameEn).toBe("Head of Administration Division");
    // Two choices are still not made (extension of time with no financial impact, extension of the contract period): that does not hold it back.
    expect(await issue()).toEqual({ ok: true });
    expect(await db.authorityMatrix.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ issuedAt: expect.any(Date), issuedByPersonId: person.person.id });

    // Loaded as stored: termination on a RM200,000 contract routes by the DAL's B.6 item 8; an unmade choice still refuses.
    const { code } = await db.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { code: true } });
    const issued = await loadMatrix(code, new Date(), draft.id);
    expect(resolveApproval(issued, { domain: "termination", contractValue: 200_000 }).rule?.ruleKey).toBe("TERMINATION_QUOTATION");
    expect(resolveApproval(issued, { domain: "eot", cond: "no_financial_impact", contractValue: 2_000_000 }).warnings.map((w) => w.code)).toContain("CHOICE_NOT_MADE");
    // Frozen once issued.
    expect(await choose("eot", "SK006 §7.6.1")).toMatchObject({ ok: false, message: expect.stringMatching(/issued/) });
    expect(await optionsOf(draft.id, "eot")).toEqual(new Set(["DAL Appendix B: null", "SK006 §7.6.1: null"]));
    // Copied on revision: the new draft carries the choice made and the ones not made.
    await expect(startRevision({ ok: false }, form({ fromId: draft.id, label: "DAL Issue A, Revision 01 (draft)", effectiveFrom: "2031-01-01" }))).rejects.toThrow(/^redirect /);
    const revision = await db.authorityMatrix.findFirstOrThrow({ where: { organisationId: orgId, issuedAt: null } });
    expect(await optionsOf(revision.id, "termination")).toEqual(new Set(["DAL Appendix B: true", "SK008 §7.5.1: false"]));
    expect(await optionsOf(revision.id, "contract_period_extension")).toEqual(new Set(["DAL Appendix B: null", "SK006 §7.6.2: null"]));
  });
});

describe("a pack's nested draft rows (step 4.8 L2)", () => {
  it("are keyed by the loader: an id or organisation a pack row carries is dropped", async () => {
    const other = await db.organisation.create({ data: { code: `RSAJ_${randomId()}`, name: "Another organisation" }, select: { id: true } });
    const mine = await db.organisation.create({ data: { code: `RSAJ_${randomId()}`, name: "Keyed by the loader" }, select: { id: true } });
    const tamper = <T extends object>(x: T): T => ({ ...x, id: `inj_${randomId()}`, organisationId: other.id });
    const [model] = structuredClone(RSAJ_PACK.drafts!.evaluationModels!);
    const tampered = {
      ...model,
      content: {
        ...model.content,
        bandSets: model.content.bandSets.map((b) => ({ ...b, bands: b.bands.map(tamper) })),
        stages: model.content.stages.map((s) => ({ ...tamper(s), factors: s.factors.map(tamper), criteria: s.criteria.map(tamper) })),
      },
    };
    const r = await loadPacks(db, mine.id, [{ ...RSAJ_PACK, drafts: { evaluationModels: [tampered] } }, GENERIC_PACK], { apply: true });
    expect(r.faults).toEqual([]);

    const sets = await db.evaluationBandSet.findMany({ where: { organisationId: mine.id }, include: { bands: true } });
    const stages = await db.evaluationStage.findMany({ where: { organisationId: mine.id }, include: { factorOptions: true, criteria: true } });
    const rows = [...sets.flatMap((x) => x.bands), ...stages, ...stages.flatMap((x) => [...x.factorOptions, ...x.criteria])];
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.organisationId).toBe(mine.id);
      expect(row.id.startsWith("inj_")).toBe(false);
    }
    for (const t of ["evaluationBand", "evaluationStage", "evaluationFactorOption", "evaluationCriterion"] as const) {
      expect(await (db[t] as unknown as { count(a: unknown): Promise<number> }).count({ where: { organisationId: other.id } }), t).toBe(0);
    }
  });
});
