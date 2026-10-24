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

import { adoptDraft, issueDraft } from "@/app/configuration/approval-matrix/actions";

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
    // The slashed-code rules say they are a reading, and the trail says so too.
    const rule = await db.authorityRule.findFirstOrThrow({ where: { authorityMatrixId: matrices[0].id, ruleKey: "DP_ABOVE_5M" }, include: { recommenders: true } });
    expect(rule.note).toMatch(/read as a joint recommendation/);
    const trail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "AuthorityRule", entityId: rule.id } });
    expect(trail.changes).toContainEqual(expect.objectContaining({ field: "whereItComesFrom", after: "Assumed" }));
    // A row that names its own provenance keeps it, and its audit row says so (the quotation declaration, placed last).
    const declaration = await db.tenderDocumentPart.findFirstOrThrow({ where: { organisationId: orgId, code: "q_declaration" } });
    expect(declaration).toMatchObject({ provenance: "ASSUMED", printedNumber: "10", returnedByBidder: true });
    const partTrail = await db.auditEntry.findFirstOrThrow({ where: { organisationId: orgId, entity: "TenderDocumentPart", entityId: declaration.id } });
    expect(partTrail.changes).toContainEqual(expect.objectContaining({ field: "whereItComesFrom", after: "Assumed" }));
    expect((await db.committee.findMany({ where: { organisationId: orgId }, select: { aliases: true } })).flatMap((c) => c.aliases)).toEqual(["Variation Order Committee"]);
    // The window and the Tender Board read as stated.
    expect(await db.windowPolicy.findUniqueOrThrow({ where: { organisationId: orgId } })).toMatchObject({ minAdvertisementDays: 14, purchaseCutoffDays: 2, defaultClosingTime: "14:30", documentSaleMode: "ONLINE", electronicDocumentRelease: true, dateRulesProvenance: "STATED" });
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
    expect(series).toHaveLength(11);
    expect(series).toContainEqual({ key: "contract_tender", pattern: "RSAJ/KP/T/{SERIAL}/{YEAR}" });
    expect(series).toContainEqual({ key: "requisition", pattern: "REQ/{YEAR}/{SERIAL}" });
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

    await db.securityPolicy.update({ where: { organisationId: orgId }, data: { twoPersonChanges: true } });
    expect(await issue()).toMatchObject({ ok: false, message: expect.stringMatching(/second person|cannot issue/) });
    expect((await db.authorityMatrix.findUniqueOrThrow({ where: { id: draft.id } })).issuedAt).toBeNull();

    await db.securityPolicy.update({ where: { organisationId: orgId }, data: { twoPersonChanges: false } });
    expect(await issue()).toEqual({ ok: true });
    expect(await db.authorityMatrix.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ issuedAt: expect.any(Date), issuedByPersonId: person.person.id });
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
