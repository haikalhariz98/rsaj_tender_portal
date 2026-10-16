import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3b step 13 against the scratch database, through the real actions, the real keys and the real triggers (ADR 0036 D3, D10; rulings 20t, 20v, 20aa): the online opening starts only once the
 * database clock is past the closing by the skew and freezes its roll; every named officer authorises with step-up and their own passphrase; the shares are forwarded between acts; the last
 * authorisation opens only the in-time bids that stand, with their prices left unread, and seals every data key to each officer; a tampered bid blocks; a late bid waits for a supplementary
 * opening. Only the request is stood in for: who is signed in, the cookies and the cache. The closing is moved with a plain UPDATE, as the other sealed tests do, instead of waiting for it.
 */

const who = vi.hoisted(() => ({ actor: null as unknown }));
const opened = vi.hoisted(() => ({ calls: [] as { fn: string; purpose: string; recordId: string }[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  const { confirmStaffPassword } = await import("@/lib/auth/identity");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor as import("@/lib/auth/types").StaffActor;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
    stepUp: async (actor: import("@/lib/auth/types").StaffActor, password: string) => {
      const r = await confirmStaffPassword(actor, password, { sourceAddress: null, userAgent: "vitest" });
      return r.ok ? r : { ok: false as const, message: "That password is not right." };
    },
  };
});
vi.mock("@/app/_auth/cookies", () => ({ refuseForeignPost: async () => null, currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "vitest" }) }));
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
    beginAct: (actor: import("@/lib/auth/types").StaffActor, data: FormData, key: string, o: Parameters<typeof begin.beginActWith>[4]) => begin.beginActWith(deps, actor, data, key, o),
    attributionRefusalState: begin.attributionRefusalState,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
// The one way out of a seal, recorded: which records were ever decrypted, and for what.
vi.mock("@/lib/sealing/open", async (orig) => {
  const real = await orig<typeof import("@/lib/sealing/open")>();
  return {
    hpkeOpen: (k: Uint8Array, s: Parameters<typeof real.hpkeOpen>[1], aad: Parameters<typeof real.hpkeOpen>[2]) => (opened.calls.push({ fn: "hpkeOpen", purpose: aad.purpose, recordId: aad.recordId }), real.hpkeOpen(k, s, aad)),
    gcmOpen: (k: Uint8Array, s: Parameters<typeof real.gcmOpen>[1], aad: Parameters<typeof real.gcmOpen>[2]) => (opened.calls.push({ fn: "gcmOpen", purpose: aad.purpose, recordId: aad.recordId }), real.gcmOpen(k, s, aad)),
  };
});

import { actFieldNames } from "@/lib/auth/act-field-names";
import { authenticateSupplier, confirmSupplierPassword } from "@/lib/auth/supplier-identity";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import type { StaffActor, SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { LATE_DOMAIN } from "@/lib/bids/late";
import { receiptDigest } from "@/lib/bids/online/receipt";
import { submitBid, takeStamp, withdrawBid } from "@/lib/bids/online/submit-store";
import { loadUploadFacts, storePart } from "@/lib/bids/online/upload-store";
import { sealSubmission } from "@/lib/sealing/bid-seal";
import { SEALED_BIDS_DEMONSTRATION_ENV } from "@/lib/integration/sealing-deployment";
import type { BidPartRule } from "@/lib/bids/online/types";
import { ensureAdministrator, facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { checkUnlock, setOfficerShare } from "../scope/key-actions";
import { sulitGranted } from "@/lib/auth/sulit-access";
import { PRICE_NOT_READ_WORDS } from "@/lib/opening/price";
import { openingSection, scheduleSection } from "@/lib/opening/read";
import { maskSealedAuditRows, SEALED_AUDIT_ENTITIES } from "@/lib/bids/online/audit-mask";
import { sealedAuditFactsFor } from "@/lib/bids/online/audit-scope-store";
import { exerciseHistory, loadExercise } from "@/lib/method/repo";
import { shredExerciseReleases } from "@/lib/opening/unseal-store";
import { openingGateFaults } from "@/lib/opening/award-gate";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { authoriseOnlineUnseal } from "./unseal-actions";
import { adjournOpening, correctAsRead, finaliseOpening, resumeOpening, startOpening, startSupplementaryOpening } from "./actions";

const DAY = 24 * 60 * 60 * 1000;
const D = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
const PLAIN = Buffer.from("%PDF-1.7\nTHE-PLAIN-MARKER-FOR-THE-UNSEAL-TEST\n");
const DECLARATION = { price: "123456.78", completionPeriod: 9, completionUnit: "MONTHS" as const };
const ENV_BEFORE = process.env[SEALED_BIDS_DEMONSTRATION_ENV];
const PEPPER_ENV = ["SEALING_PEPPER", "SEALING_PEPPER_ID"] as const;
const SAVED = Object.fromEntries(PEPPER_ENV.map((k) => [k, process.env[k]]));
const PASSWORD_FIELD = actFieldNames("personId").password;

let org = "";
let namer = "";
let sealingPolicyOk = false;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
const setClosing = (exerciseId: string, closing: Date) => db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = $2 WHERE "id" = $1`, exerciseId, closing);

type Officer = { person: { id: string }; account: { id: string }; password: string; actor: StaffActor; rosterId: string; passphrase: string };
interface Ex { id: string; reference: string; windowId: string; partA: string; partB: string; officers: Officer[]; keyId: string; fingerprint: string }
interface Session { actor: SupplierActor; supplierId: string; password: string }

async function signedIn(admin = false): Promise<Omit<Officer, "rosterId" | "passphrase">> {
  const made = await makeAccount(org, { admin });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId: org, accountId: made.account.id, tokenHash: hashToken(token), absoluteMinutes: 480, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  return { person: made.person, account: made.account, password: made.password, actor: read.actor as StaffActor };
}

const rulesOf = (a: string, b: string): { v: 1; frozenAt: string; parts: BidPartRule[] } => ({
  v: 1,
  frozenAt: new Date().toISOString(),
  parts: [
    { packPartId: a, label: "Form of Tender", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: true },
    { packPartId: b, label: "Priced Bill", mandatory: true, returnedByBidder: true, acceptedMediaTypes: ["application/pdf"], maxBytes: "1000000", openingCheck: false },
  ],
});

/// A published ONLINE exercise in DEMONSTRATION mode with `n` named officers who have each set a real share (so the exercise key is real and split n-of-n), a committee of n whose
/// seats they hold, two returned parts, and a closing a day away.
async function exercise(n: number): Promise<Ex> {
  const reference = `UNS/EX/${randomId()}`;
  const requisitionId = (
    await db.requisition.create({
      data: { organisationId: org, reference: `UNS/REQ/${randomId()}`, requestingUnitCode: "D", requestingPersonId: namer, title: "R", justification: "t", needStatement: "t", costCentreCode: "C", accountCode: "A", placeOfDelivery: "x", dateRequired: new Date("2027-01-01"), estimatedValue: "1000.00", raisedOn: new Date("2026-10-01") },
    })
  ).id;
  const committee = await db.committee.create({ data: { organisationId: org, code: `UNS_C_${randomId()}`, nameEn: "Opening committee", mandate: "Opens bids", governingSource: "Test", panelSize: n, panelSizeProvenance: "ASSUMED", panelExclusionRule: false, panelExclusionProvenance: "ASSUMED" } });
  const methodCode = `UNS_M_${randomId()}`;
  await db.sourcingMethod.create({ data: { organisationId: org, code: methodCode, nameEn: "Online tender", openingCommitteeCode: committee.code, openingCommitteeProvenance: "ASSUMED", requiresCompanyEstimate: false, requiresCompanyEstimateProvenance: "ASSUMED" } });
  const ex = await db.sourcingExercise.create({
    data: { organisationId: org, reference, requisitionId, title: "Unseal test", estimatedValue: "1000.00", sourcingMethodCode: methodCode, status: "DOCUMENTS_IN_PREPARATION", closingAt: new Date(Date.now() + DAY), submissionChannel: "ONLINE", onlineSubmissionMode: "DEMONSTRATION", openingRosterRequired: true, packKindSnapshot: "TENDER", restrictedTender: false },
  });
  const window = await db.exerciseWindow.create({
    data: {
      organisationId: org, exerciseId: ex.id, path: "ADVERTISED", publishedAt: new Date(Date.now() - 2 * DAY), advertisementDay: D(new Date(Date.now() - 2 * DAY)),
      policySnapshot: { attendance: { mandatoryPermitted: true }, bidRules: { lateAdmissionCommitteeCode: committee.code, lateAdmissionProvenance: "ASSUMED", minimumBids: null, completenessEliminates: true, completenessProvenance: "ASSUMED" } },
      purchaseFromDay: D(new Date(Date.now() - DAY)), purchaseCloseDay: D(new Date(Date.now() + 10 * DAY)), feeAmount: "50.00", alternativesPermitted: true,
    },
  });
  const pack = await db.tenderPack.create({ data: { organisationId: org, exerciseId: ex.id, versionNo: 1, packKind: "TENDER", status: "APPROVED", approvedStartOn: D(new Date(Date.now() - DAY)), approvedClosingAt: new Date(Date.now() + DAY), approvedAt: new Date(Date.now() - DAY), frozenAt: new Date(), submittedAt: new Date(), contractBasisCode: "X", compositionSnapshot: {} } });
  const partA = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "FORM", printedNumber: "1", sortOrder: 1, labelSnapshot: "Form of Tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", returnedByBidder: true, mandatory: true } })).id;
  const partB = (await db.tenderPackPart.create({ data: { organisationId: org, packId: pack.id, partCode: "BQ", printedNumber: "2", sortOrder: 2, labelSnapshot: "Priced Bill", role: "BILL_OF_QUANTITIES", content: "STANDARD", source: "TEMPLATE", returnedByBidder: true, mandatory: true } })).id;

  const officers: Officer[] = [];
  for (let i = 0; i < n; i++) {
    const o = await signedIn();
    const row = await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId: o.person.id, seatLabelSnapshot: `Member ${i + 1}`, namedAt: new Date(), namedByPersonId: namer } });
    await db.committeeMember.create({ data: { committeeId: committee.id, personId: o.person.id, seatLabel: `Member ${i + 1}`, position: "MEMBER", effectiveFrom: new Date("2026-01-01") } });
    officers.push({ ...o, rosterId: row.id, passphrase: `unseal passphrase number ${i + 1} ${randomId()}` });
  }
  for (const o of officers) {
    who.actor = o.actor;
    const r = await setOfficerShare({ ok: false }, form({ exerciseId: ex.id, passphrase: o.passphrase, repeat: o.passphrase, [PASSWORD_FIELD]: o.password }));
    if (!r.ok) throw new Error(`share not set: ${JSON.stringify(r)}`);
  }
  const key = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { onlineBidRules: rulesOf(partA, partB) as never, publishedKeyFingerprint: key.fingerprint } });
  await db.sourcingExercise.update({ where: { id: ex.id }, data: { status: "ADVERTISED" } });
  return { id: ex.id, reference, windowId: window.id, partA, partB, officers, keyId: key.id, fingerprint: key.fingerprint };
}

async function bidder(ex: Ex): Promise<Session> {
  const made = await makeSupplierAccount(org);
  await db.supplier.update({ where: { id: made.supplier.id }, data: { status: "REGISTERED", registeredOn: D(new Date(Date.now() - 100 * DAY)) } });
  const party = await db.exerciseParty.create({ data: { organisationId: org, exerciseId: ex.id, source: "PURCHASER", name: `Bidder ${randomId()}`, registrationNo: `RN-${randomId()}`, vendorId: made.supplier.id } });
  await db.documentSale.create({ data: { organisationId: org, windowId: ex.windowId, partyId: party.id, soldOn: D(new Date()), collectedBy: "A collector", authoritySighted: true, amount: "50.00", paymentMethod: "Cash", issuedByPersonId: namer, annotation: { v: 1, purchaser: party.name } } });
  const out = await authenticateSupplier({ loginName: made.loginName, password: made.password }, facts(), null);
  if (!out.ok) throw new Error(`sign-in failed: ${JSON.stringify(out)}`);
  const real = await vi.importActual<typeof import("@/lib/auth/supplier-session-store")>("@/lib/auth/supplier-session-store");
  const read = await real.readSupplierSession(out.token, { sourceAddress: "203.0.113.9" });
  if (!read.ok) throw new Error("session read failed");
  return { actor: read.actor, supplierId: made.supplier.id, password: made.password };
}

async function upload(s: Session, ex: Ex, packPartId: string): Promise<string> {
  const f = await loadUploadFacts(db, s.actor, { exerciseId: ex.id, packPartId });
  if (!f) throw new Error("the supplier cannot see the exercise");
  return (await storePart(s.actor, { facts: f, packPartId, plain: new Uint8Array(PLAIN), filename: "tender.pdf", mediaType: "application/pdf", scan: "NOT_SCANNED", scannerConfigured: false })).fileId;
}

async function submit(s: Session, ex: Ex, o: { kind?: "BID" | "ALTERNATIVE"; parent?: string | null; replaces?: string | null } = {}) {
  const fileIds = [await upload(s, ex, ex.partA), await upload(s, ex, ex.partB)];
  const stamp = await takeStamp();
  const asked = await confirmSupplierPassword(s.actor, s.password, facts());
  if (!asked.ok) throw new Error("password refused");
  const r = await submitBid(s.actor, { exerciseId: ex.id, kind: o.kind ?? "BID", parentOnlineBidId: o.parent ?? null, replacesOnlineBidId: o.replaces ?? null, fileIds, declaration: DECLARATION, stamp, stepUpAt: asked.at });
  if (!r.ok) throw new Error(`submit refused: ${JSON.stringify(r)}`);
  return r.onlineBidId;
}

async function withdraw(s: Session, onlineBidId: string) {
  const stamp = await takeStamp();
  const asked = await confirmSupplierPassword(s.actor, s.password, facts());
  if (!asked.ok) throw new Error("password refused");
  const r = await withdrawBid(s.actor, { onlineBidId, alsoWithdraw: [], stamp, stepUpAt: asked.at });
  if (!r.ok) throw new Error(`withdraw refused: ${JSON.stringify(r)}`);
}

const start = async (ex: Ex, by: Officer = ex.officers[0]) => {
  who.actor = by.actor;
  return startOpening({ ok: false }, form({ exerciseId: ex.id }));
};
const authorise = async (ex: Ex, openingId: string, o: Officer, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
};
const openingOf = (ex: Ex) => db.opening.findFirstOrThrow({ where: { exerciseId: ex.id, kind: "MAIN" } });
const events = (exerciseId: string) => db.sealedAccessEvent.findMany({ where: { exerciseId }, orderBy: { at: "asc" } });
const message = (r: { message?: string; errors?: Record<string, string> }) => r.message ?? JSON.stringify(r.errors);

beforeAll(async () => {
  process.env[SEALED_BIDS_DEMONSTRATION_ENV] = "true";
  for (const k of PEPPER_ENV) delete process.env[k];
  // The suppliers' sign-in finds its organisation by ORGANISATION_CODE, read once when the module loads: the shared test organisation, as the other sealed tests use. Its policy is set here.
  org = (await testOrganisation()).id;
  await setPolicy(org, { ...SUPPLIER_SETTINGS, sealingPassphraseMinLength: 12 });
  await ensureAdministrator(org);
  await db.bidSealingPolicy.upsert({ where: { organisationId: org }, create: { organisationId: org, onlineSubmission: "DEMONSTRATION" }, update: { onlineSubmission: "DEMONSTRATION" } });
  await db.openingPolicy.upsert({ where: { organisationId: org }, create: { organisationId: org, invitedCountReading: "PURCHASERS", invitedCountProvenance: "ASSUMED" }, update: { invitedCountReading: "PURCHASERS", invitedCountProvenance: "ASSUMED" } });
  namer = (await db.person.create({ data: { organisationId: org, name: `Namer ${randomId()}` } })).id;
  sealingPolicyOk = true;
});

afterAll(async () => {
  for (const k of PEPPER_ENV) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  if (ENV_BEFORE === undefined) delete process.env[SEALED_BIDS_DEMONSTRATION_ENV];
  else process.env[SEALED_BIDS_DEMONSTRATION_ENV] = ENV_BEFORE;
  await db.$disconnect();
});

describe("starting an online opening", () => {
  it("is refused while the database clock is within the skew of the closing, in words, and starts once it is past it, freezing the roll", async () => {
    expect(sealingPolicyOk).toBe(true);
    const ex = await exercise(2);
    const a = await bidder(ex);
    const b = await bidder(ex);
    const stands = await submit(a, ex);
    const replaced = await submit(b, ex);
    const replacement = await submit(b, ex, { replaces: replaced });
    await setClosing(ex.id, ago(10));
    const lateOne = await bidder(ex);
    const late = await submit(lateOne, ex);
    expect((await db.bidEnvelope.findFirstOrThrow({ where: { onlineBid: { id: late } } })).late).toBe(true);

    const within = await start(ex);
    expect(within.ok).toBe(false);
    expect(message(within)).toMatch(/closing has only just passed/);
    expect(message(within)).toMatch(/Try again in \d+ seconds?/);
    expect(message(within)).not.toMatch(/SKEW_NOT_ELAPSED/);
    expect(await db.opening.count({ where: { exerciseId: ex.id } })).toBe(0);

    await setClosing(ex.id, ago(40));
    const ok = await start(ex);
    expect(ok.ok, message(ok)).toBe(true);
    expect(message(ok)).toMatch(/Each of the 2 named opening officers now authorises/);
    const opening = await openingOf(ex);
    expect(opening.unsealedAt).toBeNull();
    const roll = opening.receiptRoll as { v: number; entries: { sequence: number; receiptDigest: string; late: boolean }[]; rollDigest: string };
    expect(roll.v).toBe(1);
    // The standing submissions at the start: the bid that stands, the replacement and the late one. Not the one that was replaced.
    const standing = await db.onlineBid.findMany({ where: { id: { in: [stands, replacement, late] } }, include: { envelope: true } });
    expect(roll.entries.map((e) => e.sequence).sort((x, y) => x - y)).toEqual(standing.map((s) => s.envelope.sequence).sort((x, y) => x - y));
    expect(roll.entries.filter((e) => e.late)).toHaveLength(1);
    expect(roll.rollDigest).toMatch(/^[0-9a-f]{64}$/);
    // No box step: no box event is written, and the panel is the roster, all present.
    expect(await db.boxEvent.count({ where: { exerciseId: ex.id } })).toBe(0);
    const panel = await db.openingPanelMember.findMany({ where: { openingId: opening.id } });
    expect(panel).toHaveLength(2);
    expect(panel.every((p) => p.present)).toBe(true);

    // After the start trigger 1 refuses any late insert, and the bidder is told in words by the door.
    const another = await bidder(ex);
    await expect(submit(another, ex)).rejects.toThrow(/LATE_CLOSED/);
  }, 120_000);

  it("is refused where the key is split across other officers than the ones named now", async () => {
    const ex = await exercise(2);
    await setClosing(ex.id, ago(40));
    const extra = await signedIn();
    await db.exerciseOpeningOfficer.create({ data: { organisationId: org, exerciseId: ex.id, personId: extra.person.id, seatLabelSnapshot: "Member 3", namedAt: new Date(), namedByPersonId: namer } });
    const r = await start(ex);
    expect(r.ok).toBe(false);
    expect(message(r)).toMatch(/split across 2 officers, and 3 are named now/);
  }, 120_000);
});

describe("the unseal, n = 2 (D10)", () => {
  it("forwards the first officer's share, opens only the in-time standing bids at the second, with their prices unread, and seals every key to each officer", async () => {
    const ex = await exercise(2);
    const s1 = await bidder(ex);
    const s2 = await bidder(ex);
    const s3 = await bidder(ex);
    const s4 = await bidder(ex);
    const bid1 = await submit(s1, ex);
    const alt1 = await submit(s1, ex, { kind: "ALTERNATIVE", parent: bid1 });
    const first2 = await submit(s2, ex);
    const bid2 = await submit(s2, ex, { replaces: first2 });
    const bid3 = await submit(s3, ex);
    await withdraw(s3, bid3);
    await setClosing(ex.id, ago(5));
    const late = await submit(s4, ex);
    await setClosing(ex.id, ago(40));
    // Before the opening starts the History holds no row of any online bid, whoever reads it: not the submissions, replacements, withdrawals or uploads, nor their count (security audit 2, 20u).
    const historyBefore = await exerciseHistory((await loadExercise(org, ex.id))!);
    expect(historyBefore.entries.filter((e) => SEALED_AUDIT_ENTITIES.includes(e.entity))).toEqual([]);
    expect(historyBefore.total).toBe(historyBefore.entries.length);
    const started = await start(ex);
    expect(started.ok, message(started)).toBe(true);
    const opening = await openingOf(ex);
    const [o1, o2] = ex.officers;
    opened.calls.length = 0;

    // The first officer: a wrong passphrase is counted and nothing is recorded; the right one forwards.
    const wrong = await authorise(ex, opening.id, o1, { passphrase: "not the passphrase at all" });
    expect(wrong.ok).toBe(false);
    expect(message(wrong)).toMatch(/did not unlock your key/);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o1.person.id, retiredAt: null } })).failedAttempts).toBe(1);
    expect(await db.openingAuthorisation.count({ where: { openingId: opening.id } })).toBe(0);
    const wrongPassword = await authorise(ex, opening.id, o1, { [PASSWORD_FIELD]: "not my sign-in password" });
    expect(wrongPassword.ok).toBe(false);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o1.person.id, retiredAt: null } })).failedAttempts).toBe(1);

    const firstDone = await authorise(ex, opening.id, o1);
    expect(firstDone.ok, message(firstDone)).toBe(true);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o1.person.id, retiredAt: null } })).failedAttempts).toBe(0);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).toBeNull();
    const releases = await db.shareRelease.findMany({ where: { openingId: opening.id } });
    expect(releases).toHaveLength(1);
    expect(releases[0].sealedShares).not.toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(0);
    // Nothing was decrypted before the last authorisation but the officer's own share and key.
    expect(opened.calls.filter((c) => c.purpose !== "SHARE")).toEqual([]);
    // The same officer twice is refused.
    expect((await authorise(ex, opening.id, o1)).ok).toBe(false);

    const lastDone = await authorise(ex, opening.id, o2);
    expect(lastDone.ok, message(lastDone)).toBe(true);
    expect(message(lastDone)).toMatch(/3 were opened/);
    expect(message(lastDone)).toMatch(/1 received after the closing waits/);

    const after = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(after.unsealedAt).not.toBeNull();
    const offers = await db.openedBid.findMany({ where: { openingId: opening.id }, orderBy: { listingNo: "asc" }, include: { envelope: true } });
    expect(offers).toHaveLength(3);
    expect(offers.every((o) => o.priceAsRead === null && o.completionPeriod === null && o.envelope.status === "OPENED" && o.envelope.channel === "ONLINE")).toBe(true);
    // A main bid before its alternative; the alternative names its parent's offer; it is considered (alternatives are permitted).
    expect(offers.map((o) => o.isAlternative)).toEqual([false, false, true]);
    const alt = offers[2];
    expect(alt.parentOpenedBidId).toBe(offers[0].id);
    expect(alt.alternativeStatus).toBe("CONSIDERED");
    expect(offers.map((o) => o.listingNo)).toEqual([1, 2, 3]);

    const rows = await db.onlineBid.findMany({ where: { exerciseId: ex.id }, include: { envelope: true } });
    const status = (id: string) => rows.find((r) => r.id === id)!;
    expect([bid1, alt1, bid2].map((id) => status(id).status)).toEqual(["OPENED", "OPENED", "OPENED"]);
    expect(status(first2).status).toBe("REPLACED");
    expect(status(bid3).status).toBe("WITHDRAWN");
    expect(status(late)).toMatchObject({ status: "SUBMITTED" });
    expect(status(late).envelope.status).toBe("RECEIVED");

    // What was decrypted: manifests of the three opened bids only, never a declaration, never a late, replaced or withdrawn bid.
    const manifests = opened.calls.filter((c) => c.purpose === "MANIFEST").map((c) => c.recordId).sort();
    expect(manifests).toEqual([bid1, alt1, bid2].sort());
    expect(opened.calls.some((c) => c.purpose === "DECLARATION")).toBe(false);
    for (const out of [late, first2, bid3]) expect(opened.calls.some((c) => c.recordId === out)).toBe(false);

    // Grants: for each officer, each opened bid's two files (the form is OPENING_CHECK, the bill FINALISE) and its declaration (FINALISE).
    const grants = await db.officerDekGrant.findMany({ where: { openingId: opening.id } });
    expect(grants).toHaveLength(2 * 3 * 3);
    for (const g of grants.filter((x) => x.subject === "FILE")) {
      const file = await db.onlineBidFile.findUniqueOrThrow({ where: { id: g.recordId } });
      expect(g.use).toBe(file.packPartId === ex.partA ? "OPENING_CHECK" : "FINALISE");
    }
    expect(grants.filter((x) => x.subject === "DECLARATION").every((g) => g.use === "FINALISE")).toBe(true);
    expect(grants.some((g) => g.recordId === late)).toBe(false);

    // Between the unseal and the finalise the page draws, every online price reads as not read, in words, and a correction is refused in words (review S6).
    const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
    const section = await openingSection(org, ex.id, granted, null, false);
    expect(section).not.toBeNull();
    const schedule = await scheduleSection(who.actor as StaffActor & { organisationTimeZone: string | null }, ex.id, granted);
    const priced = schedule!.openings.flatMap((x) => x.rows.map((r) => r.openingPrice));
    expect(priced).toHaveLength(3);
    for (const p of priced) expect(p).toMatchObject({ state: "GRANTED", value: PRICE_NOT_READ_WORDS });
    const corrected = await correctAsRead({ ok: false }, form({ exerciseId: ex.id, openedBidId: offers[0].id, bidderName: "X", price: "10.00", reason: "Check", [PASSWORD_FIELD]: ex.officers[0].password }));
    expect(corrected.ok).toBe(false);
    expect(message(corrected)).toMatch(/price is not read yet/);
    // The paper finalise on an unsealed online opening refuses in words (it used to throw on a price not read).
    who.actor = ex.officers[0].actor;
    const paperFinalise = await finaliseOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, [PASSWORD_FIELD]: ex.officers[0].password }));
    expect(paperFinalise.ok).toBe(false);
    expect(message(paperFinalise)).toMatch(/takes bids online/);

    // The releases are shredded, the shares kept for a supplementary opening, the exercise is in progress.
    expect((await db.shareRelease.findMany({ where: { openingId: opening.id } })).every((r) => r.sealedShares === null && r.usedAt !== null)).toBe(true);
    expect(await db.exerciseKeyShare.count({ where: { keyId: ex.keyId, sealedShare: { not: null } } })).toBe(2);
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).status).toBe("OPENING_IN_PROGRESS");

    // The opened offers are named by receipt number and bidder, never a price; the audit of the opening holds no figure.
    const audits = await db.auditEntry.findMany({ where: { organisationId: org, entityId: { in: offers.map((o) => o.id) } } });
    expect(audits).toHaveLength(3);
    expect(JSON.stringify(audits)).not.toMatch(/123456|123,456/);

    // The trail of the unseal (review): each envelope moves RECEIVED to OPENED with its bidder, each submission to Opened, and the opening's row counts the grants made.
    const envelopeIds = offers.map((o) => o.envelopeId);
    const envelopeRows = await db.auditEntry.findMany({ where: { organisationId: org, entity: "BidEnvelope", action: "UPDATE", entityId: { in: envelopeIds } } });
    expect(envelopeRows).toHaveLength(3);
    const openedSubmissions = await db.onlineBid.findMany({ where: { exerciseId: ex.id, status: "OPENED" }, select: { id: true } });
    const bidRows = await db.auditEntry.findMany({ where: { organisationId: org, entity: "OnlineBid", action: "UPDATE", entityLabel: { endsWith: "online submission opened" }, entityId: { in: openedSubmissions.map((b) => b.id) } } });
    expect(bidRows).toHaveLength(3);
    const openingRow = await db.auditEntry.findFirstOrThrow({ where: { organisationId: org, entity: "Opening", entityId: opening.id, action: "UPDATE" }, orderBy: { at: "desc" } });
    expect(JSON.stringify(openingRow.changes)).toMatch(/for each of 2 officers/);

    // Ruling 20c: between the unseal and finalising only the named officers see who bid. A staff reader who is not a named officer, and an administrator, read the trail, the Opening tab and the
    // draft schedule, and none shows a bidder's name; a named officer sees it.
    // Every string that would name a bidder: its name, registration number, and the supplier register's reference for the linked supplier (so the eligibility finding is not null).
    const parties = await db.exerciseParty.findMany({ where: { exerciseId: ex.id, id: { in: offers.map((o) => o.partyId) } } });
    const suppliers = await db.supplier.findMany({ where: { id: { in: parties.map((p) => p.vendorId).filter((v): v is string => !!v) } } });
    expect(offers.every((o) => o.eligibilityFinding !== null)).toBe(true);
    const names = [...offers.map((o) => o.bidderNameAsRead), ...parties.map((p) => p.registrationNo), ...suppliers.map((x) => x.reference)];
    expect(parties.length).toBeGreaterThan(0);
    expect(suppliers).toHaveLength(parties.length);
    const offerRows = await db.auditEntry.findMany({ where: { organisationId: org, entity: "OpenedBid", entityId: { in: offers.map((o) => o.id) } } });
    const trail = [...offerRows, ...envelopeRows, ...bidRows].map((r) => ({ entity: r.entity, entityId: r.entityId, actorName: "An officer", changes: r.changes }));
    const trailFacts = await sealedAuditFactsFor(org, trail);
    const stranger = await signedIn(false);
    const admin = await signedIn(true);
    for (const viewer of [stranger.person.id, admin.person.id, null]) {
      const seen = JSON.stringify(maskSealedAuditRows(trail, trailFacts, viewer));
      for (const name of names) expect(seen).not.toContain(name);
    }
    expect(JSON.stringify(maskSealedAuditRows(trail, trailFacts, o1.person.id))).toContain(names[0]);
    for (const viewer of [stranger.person.id, admin.person.id]) {
      const tab = JSON.stringify(await openingSection(org, ex.id, sulitGranted(true as const, "ORGANISATION_PERMISSION"), viewer, false));
      for (const name of names) expect(tab).not.toContain(name);
      const draft = JSON.stringify(await scheduleSection({ ...(stranger.actor as StaffActor), personId: viewer } as StaffActor & { organisationTimeZone: string | null }, ex.id, sulitGranted(true as const, "ORGANISATION_PERMISSION")));
      for (const name of names) expect(draft).not.toContain(name);
    }
    expect(JSON.stringify(await openingSection(org, ex.id, sulitGranted(true as const, "ORGANISATION_PERMISSION"), o1.person.id, false))).toContain(names[0]);

    // The access events: the attempts, refused and granted, with no secret.
    const log = await events(ex.id);
    expect(log.filter((e) => e.kind === "AUTHORISE" && e.outcome === "GRANTED")).toHaveLength(2);
    expect(log.filter((e) => e.kind === "AUTHORISE" && e.outcome === "REFUSED").map((e) => e.reasonCode)).toEqual(expect.arrayContaining(["WRONG_PASSPHRASE", "STEP_UP_REFUSED"]));
    expect(JSON.stringify(log)).not.toContain(o1.passphrase);
  }, 180_000);

  it("refuses an administrator, and logs the refusal", async () => {
    const ex = await exercise(2);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    const admin = await signedIn(true);
    who.actor = admin.actor;
    const r = await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, passphrase: "whatever passphrase here", [PASSWORD_FIELD]: admin.password }));
    expect(r.ok).toBe(false);
    expect((await events(ex.id)).filter((e) => e.kind === "AUTHORISE" && e.reasonCode === "ADMINISTRATOR")).toHaveLength(1);
    expect(await db.openingAuthorisation.count({ where: { openingId: opening.id } })).toBe(0);
    // S19: only the first refusal for the account in the hour is written, and a record id that is not one of ours is logged as none.
    await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId: "x".repeat(5000), passphrase: "whatever passphrase here", [PASSWORD_FIELD]: admin.password }));
    await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, passphrase: "whatever passphrase here", [PASSWORD_FIELD]: admin.password }));
    const refusals = (await events(ex.id)).filter((e) => e.kind === "AUTHORISE" && e.reasonCode === "ADMINISTRATOR");
    expect(refusals).toHaveLength(1);
    expect(refusals.every((e) => e.recordId === null || e.recordId.length <= 64)).toBe(true);
  }, 120_000);

  it("refuses the closing second itself: the opening does not authorise while the closing is not past", async () => {
    const ex = await exercise(2);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    await setClosing(ex.id, new Date(Date.now() + 3600_000));
    const r = await authorise(ex, opening.id, ex.officers[0]);
    expect(r.ok).toBe(false);
    expect(message(r)).toMatch(/opened only after the closing/);
    expect(await db.openingAuthorisation.count({ where: { openingId: opening.id } })).toBe(0);
  }, 120_000);

  it("two officers authorising at the same moment are both taken, one after the other, and the second opens", async () => {
    const ex = await exercise(2);
    const s = await bidder(ex);
    await submit(s, ex);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    const [a, b] = await Promise.all(ex.officers.map((o) => authorise(ex, opening.id, o)));
    expect([a.ok, b.ok], `${message(a)} / ${message(b)}`).toEqual([true, true]);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).not.toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(1);
  }, 180_000);
});

describe("the unseal, n = 3 (D10, 20k)", () => {
  it("does not open at the second authorisation, forwards between acts, and opens at the third in any order, the third not refused", async () => {
    const ex = await exercise(3);
    const s = await bidder(ex);
    await submit(s, ex);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    const [o1, o2, o3] = ex.officers;
    // The officers act in the order 3, 1, 2.
    const r3 = await authorise(ex, opening.id, o3);
    expect(r3.ok, message(r3)).toBe(true);
    expect(await db.shareRelease.count({ where: { openingId: opening.id, sealedShares: { not: null } } })).toBe(2);
    const r1 = await authorise(ex, opening.id, o1);
    expect(r1.ok, message(r1)).toBe(true);
    expect(message(r1)).toMatch(/1 of the 3 named officers have still to authorise/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(0);
    const r2 = await authorise(ex, opening.id, o2);
    expect(r2.ok, message(r2)).toBe(true);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).not.toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(1);
    expect(await db.officerDekGrant.count({ where: { openingId: opening.id } })).toBe(3 * 3);
    // A fourth authorisation of the sitting is refused: every officer has.
    expect((await authorise(ex, opening.id, o1)).ok).toBe(false);
  }, 240_000);

  it("adjourning lapses the unpaired authorisations and shreds what they forwarded; resuming needs all three again", async () => {
    const ex = await exercise(3);
    const s = await bidder(ex);
    await submit(s, ex);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    const [o1, o2, o3] = ex.officers;
    expect((await authorise(ex, opening.id, o1)).ok).toBe(true);
    expect((await authorise(ex, opening.id, o2)).ok).toBe(true);
    who.actor = o1.actor;
    const adjourned = await adjournOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, reason: "The third officer is delayed" }));
    expect(adjourned.ok, message(adjourned)).toBe(true);
    expect(message(adjourned)).toMatch(/resuming needs 3 fresh authorisations/);
    expect((await db.openingAuthorisation.findMany({ where: { openingId: opening.id } })).every((a) => a.lapsedAt !== null)).toBe(true);
    expect((await db.shareRelease.findMany({ where: { openingId: opening.id } })).every((r) => r.sealedShares === null)).toBe(true);
    expect((await db.shareRelease.findMany({ where: { openingId: opening.id } })).some((r) => r.lapsedAt !== null || r.usedAt !== null)).toBe(true);
    who.actor = o1.actor;
    const resumed = await resumeOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, reason: "The third officer is here" }));
    expect(resumed.ok, message(resumed)).toBe(true);
    for (const o of [o3, o1, o2]) {
      const r = await authorise(ex, opening.id, o);
      expect(r.ok, message(r)).toBe(true);
    }
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).not.toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(1);
  }, 300_000);

  it("shreds every forwarded share of the exercise, marked lapsed, when the exercise ends mid-sitting (security audit: cancellation)", async () => {
    const ex = await exercise(3);
    const s = await bidder(ex);
    await submit(s, ex);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    expect((await authorise(ex, opening.id, ex.officers[0])).ok).toBe(true);
    const held = await db.shareRelease.count({ where: { openingId: opening.id, sealedShares: { not: null } } });
    expect(held).toBeGreaterThan(0);
    const shredded = await db.$transaction((tx) => shredExerciseReleases(tx, { organisationId: org, exerciseId: ex.id, now: new Date() }));
    expect(shredded).toBe(held);
    const after = await db.shareRelease.findMany({ where: { openingId: opening.id } });
    expect(after.every((r) => r.sealedShares === null)).toBe(true);
    expect(after.some((r) => r.lapsedAt !== null)).toBe(true);
  }, 240_000);
});

describe("a tampered bid blocks the unseal", () => {
  /// A bid whose sealed manifest names another supplier, built as the submit does but sealed with a forged manifest, and inserted through the same triggers.
  async function forged(ex: Ex, s: Session) {
    const fileIds = [await upload(s, ex, ex.partA), await upload(s, ex, ex.partB)];
    const files = await db.onlineBidFile.findMany({ where: { id: { in: fileIds } } });
    const key = await db.exerciseSealingKey.findUniqueOrThrow({ where: { id: ex.keyId } });
    const stamp = await takeStamp();
    const onlineBidId = `forged_${randomId()}${randomId()}`;
    const envelopeId = `forgedenv_${randomId()}${randomId()}`;
    const sealed = sealSubmission({
      context: { organisationId: org, exerciseId: ex.id, keyId: ex.keyId, onlineBidId },
      exercisePublicKey: new Uint8Array(key.publicKey),
      declaration: DECLARATION,
      manifest: { v: 1, exerciseId: ex.id, onlineBidId, supplierId: "some_other_supplier", supplierAccountId: s.actor.accountId, kind: "BID", parentOnlineBidId: null, replacesOnlineBidId: null, files: files.map((f) => ({ fileId: f.id, packPartId: f.packPartId, cipherSha256: f.cipherSha256 })) },
    });
    const seq = ((await db.bidEnvelope.aggregate({ where: { exerciseId: ex.id }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
    const digest = receiptDigest({ exerciseId: ex.id, submissionNumber: 1, receivedAt: stamp, keyFingerprint: key.fingerprint, manifestCipherSha256: sealed.manifestCipherSha256, declarationCipherSha256: sealed.declarationCipherSha256, fileCipherSha256s: files.map((f) => f.cipherSha256) });
    await db.$transaction(async (tx) => {
      await tx.bidEnvelope.create({ data: { id: envelopeId, organisationId: org, exerciseId: ex.id, sequence: seq, kind: "BID", channel: "ONLINE", receivedAt: stamp, receivedSource: "PORTAL", markings: "", late: false, recordedAfterClosing: false, closingAtJudged: (await tx.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).closingAt } });
      await tx.onlineBid.create({
        data: {
          id: onlineBidId, organisationId: org, exerciseId: ex.id, keyId: ex.keyId, envelopeId, supplierId: s.supplierId, submittedBySupplierAccountId: s.actor.accountId, kind: "BID",
          sealedManifest: sealed.sealedManifest as Uint8Array<ArrayBuffer>, manifestDek: sealed.manifestDek as Uint8Array<ArrayBuffer>, manifestCipherSha256: sealed.manifestCipherSha256,
          sealedDeclaration: sealed.sealedDeclaration as Uint8Array<ArrayBuffer>, declarationDek: sealed.declarationDek as Uint8Array<ArrayBuffer>, declarationCipherSha256: sealed.declarationCipherSha256, receiptDigest: digest,
        },
      });
      await tx.onlineBidPart.createMany({ data: files.map((f) => ({ organisationId: org, onlineBidId, fileId: f.id })) });
      await tx.onlineBidFile.updateMany({ where: { id: { in: fileIds } }, data: { state: "SUBMITTED" } });
    });
    return { onlineBidId, sequence: seq };
  }

  it("blocks in words that name the receipt's number, records nothing of the last authorisation, and logs the refusal", async () => {
    const ex = await exercise(2);
    const good = await bidder(ex);
    const bad = await bidder(ex);
    await submit(good, ex);
    const f = await forged(ex, bad);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const opening = await openingOf(ex);
    const [o1, o2] = ex.officers;
    expect((await authorise(ex, opening.id, o1)).ok).toBe(true);
    const last = await authorise(ex, opening.id, o2);
    expect(last.ok).toBe(false);
    expect(message(last)).toContain(`number ${f.sequence}`);
    expect(message(last)).toMatch(/does not agree with its row/);
    expect(message(last)).not.toMatch(/some_other_supplier|BID_MANIFEST_BINDING/);
    const after = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(after.unsealedAt).toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(0);
    expect(await db.openingAuthorisation.count({ where: { openingId: opening.id } })).toBe(1);
    expect((await db.onlineBid.findMany({ where: { exerciseId: ex.id } })).every((b) => b.status === "SUBMITTED")).toBe(true);
    expect(await db.officerDekGrant.count({ where: { openingId: opening.id } })).toBe(0);
    expect((await events(ex.id)).filter((e) => e.kind === "AUTHORISE" && e.reasonCode === "BID_MANIFEST_BINDING")).toHaveLength(1);
  }, 180_000);
});

describe("a late bid admitted by the committee opens at a supplementary opening (FR-CTE-008)", () => {
  it("is not opened at the main unseal, and is opened n-of-n again once the main opening is finalised and the committee has carried its admission", async () => {
    const ex = await exercise(2);
    const s1 = await bidder(ex);
    const s2 = await bidder(ex);
    const standing = await submit(s1, ex);
    await setClosing(ex.id, ago(5));
    const late = await submit(s2, ex);
    await setClosing(ex.id, ago(40));
    expect((await start(ex)).ok).toBe(true);
    const main = await openingOf(ex);
    for (const o of ex.officers) expect((await authorise(ex, main.id, o)).ok).toBe(true);
    expect(await db.openedBid.count({ where: { openingId: main.id } })).toBe(1);
    opened.calls.length = 0;

    // The main opening is finalised by direct writes (the online finalise is step 15): the price first, then the finalising, as the trigger requires.
    await db.openedBid.updateMany({ where: { openingId: main.id }, data: { priceAsRead: "100.00", completionPeriod: 9, completionUnit: "MONTHS" } });
    await db.opening.update({ where: { id: main.id }, data: { finalisedAt: new Date() } });

    const envelopeId = (await db.onlineBid.findUniqueOrThrow({ where: { id: late } })).envelopeId;
    const committee = await db.committee.findFirstOrThrow({ where: { organisationId: org, members: { some: { personId: ex.officers[0].person.id } } } });
    const meeting = await db.meeting.create({ data: { committeeId: committee.id, reference: `UNS/LATE/${randomId()}`, meetingDate: D(new Date()) } });
    const decision = await db.committeeDecision.create({ data: { meetingId: meeting.id, subject: "Admission of a late envelope", domain: LATE_DOMAIN, matterKind: "LATE_TENDER", bidEnvelopeId: envelopeId, act: "A", tabledAt: D(new Date()), outcome: "CARRIED", decisionDate: D(new Date()) } });

    // The 20y dependency: the award gate refuses ADMITTED_UNOPENED from the moment the committee carries the admission until the supplementary opening is finalised.
    const gateCodes = async () => openingGateFaults(await loadOpeningGate(ex.id)).map((f) => f.code);
    expect(await gateCodes()).toContain("ADMITTED_UNOPENED");

    who.actor = ex.officers[0].actor;
    const started = await startSupplementaryOpening({ ok: false }, form({ exerciseId: ex.id, decisionId: decision.id }));
    expect(started.ok, message(started)).toBe(true);
    const supp = await db.opening.findFirstOrThrow({ where: { exerciseId: ex.id, kind: "SUPPLEMENTARY" } });
    expect(supp.receiptRoll).toBeNull();
    for (const o of ex.officers) {
      const r = await authorise(ex, supp.id, o);
      expect(r.ok, message(r)).toBe(true);
    }
    const offers = await db.openedBid.findMany({ where: { openingId: supp.id }, include: { envelope: true } });
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ priceAsRead: null, envelopeId });
    expect((await db.onlineBid.findUniqueOrThrow({ where: { id: late } })).status).toBe("OPENED");
    expect((await db.onlineBid.findUniqueOrThrow({ where: { id: standing } })).status).toBe("OPENED");
    // Only the late bid's manifest was opened at the supplementary opening, and its grants were sealed to each officer.
    expect(opened.calls.filter((c) => c.purpose === "MANIFEST").map((c) => c.recordId)).toEqual([late]);
    expect(await db.officerDekGrant.count({ where: { openingId: supp.id } })).toBe(2 * 3);
    expect(await db.exerciseKeyShare.count({ where: { keyId: ex.keyId, sealedShare: { not: null } } })).toBe(2);
    // Unsealed is not finalised: the gate still refuses. Finalised (by direct write, price first), it no longer lists the admitted envelope as unopened.
    expect(await gateCodes()).toContain("ADMITTED_UNOPENED");
    await db.openedBid.updateMany({ where: { openingId: supp.id }, data: { priceAsRead: "90.00", completionPeriod: 9, completionUnit: "MONTHS" } });
    await db.opening.update({ where: { id: supp.id }, data: { finalisedAt: new Date() } });
    expect(await gateCodes()).not.toContain("ADMITTED_UNOPENED");
  }, 240_000);
});

describe("checking that a passphrase still unlocks (D4, 20v)", () => {
  const check = async (ex: Ex, o: Officer, over: Record<string, string> = {}) => {
    who.actor = o.actor;
    return checkUnlock({ ok: false }, form({ exerciseId: ex.id, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
  };
  const key = (ex: Ex, o: Officer) => db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o.person.id, retiredAt: null } });

  it("accepts the right passphrase, counts a wrong one on the key's own counter and never on the sign-in's, and locks at the limit", async () => {
    const ex = await exercise(2);
    const o = ex.officers[0];
    const good = await check(ex, o);
    expect(good.ok, message(good)).toBe(true);
    for (let i = 1; i <= 4; i++) {
      const bad = await check(ex, o, { passphrase: `a wrong passphrase number ${i}` });
      expect(bad.ok).toBe(false);
      expect(message(bad)).toMatch(/did not unlock your key/);
      expect((await key(ex, o)).failedAttempts).toBe(i);
    }
    const account = await db.staffAccount.findUniqueOrThrow({ where: { id: o.account.id } });
    expect(account.failedAttempts).toBe(0);
    const fifth = await check(ex, o, { passphrase: "a wrong passphrase number 5" });
    expect(message(fifth)).toMatch(/now locked/);
    expect((await key(ex, o)).lockedUntil).not.toBeNull();
    // Locked: even the right passphrase is not tried.
    const locked = await check(ex, o);
    expect(locked.ok).toBe(false);
    expect(message(locked)).toMatch(/locked for a while/);
    expect((await key(ex, o)).failedAttempts).toBe(5);
    // The other officer's key is unaffected.
    expect((await check(ex, ex.officers[1])).ok).toBe(true);
    const log = await events(ex.id);
    expect(log.filter((e) => e.kind === "UNLOCK_CHECK" && e.outcome === "GRANTED")).toHaveLength(2);
    expect(log.filter((e) => e.kind === "UNLOCK_CHECK" && e.reasonCode === "WRONG_PASSPHRASE")).toHaveLength(5);
    expect(log.filter((e) => e.kind === "UNLOCK_CHECK" && e.reasonCode === "LOCKED")).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain(o.passphrase);
  }, 180_000);

  it("parallel wrong passphrases cannot get past the lockout: at most the limit are derived, however many arrive together (review: reserve the attempt before the unwrap)", async () => {
    const ex = await exercise(2);
    const o = ex.officers[0];
    const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => check(ex, o, { passphrase: `a parallel wrong passphrase ${i}` })));
    expect(burst.every((r) => !r.ok)).toBe(true);
    const log = await events(ex.id);
    const tried = log.filter((e) => e.kind === "UNLOCK_CHECK" && e.reasonCode === "WRONG_PASSPHRASE").length;
    expect(tried).toBe(5);
    expect(log.filter((e) => e.kind === "UNLOCK_CHECK" && e.reasonCode === "LOCKED")).toHaveLength(7);
    const k = await key(ex, o);
    expect(k.failedAttempts).toBe(5);
    expect(k.lockedUntil).not.toBeNull();
  }, 240_000);

  it("a pepper this copy does not hold is its own refusal, is checked before any unwrap, and is never counted", async () => {
    process.env.SEALING_PEPPER = randomBytes(40).toString("base64");
    process.env.SEALING_PEPPER_ID = "unseal-test";
    let ex: Ex;
    try {
      ex = await exercise(2);
      expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id } })).pepperId).toMatch(/^unseal-test#/);
      expect((await check(ex, ex.officers[0])).ok).toBe(true);
    } finally {
      delete process.env.SEALING_PEPPER;
      delete process.env.SEALING_PEPPER_ID;
    }
    for (let i = 0; i < 7; i++) {
      const r = await check(ex, ex.officers[0], { passphrase: `wrong ${i} passphrase here` });
      expect(r.ok).toBe(false);
      expect(message(r)).toMatch(/pepper this copy of the system does not hold/);
      expect(message(r)).not.toMatch(/did not unlock/);
    }
    expect((await key(ex, ex.officers[0])).failedAttempts).toBe(0);
    expect((await events(ex.id)).filter((e) => e.reasonCode === "PEPPER_NOT_HELD")).toHaveLength(7);
    // The authorisation says the same.
    const opening = { id: "none" };
    const r = await authorise(ex, opening.id, ex.officers[0]);
    expect(r.ok).toBe(false);
    expect(message(r)).toMatch(/pepper this copy of the system does not hold/);
  }, 180_000);

  it("refuses an administrator, a person not named, and a wrong password, each logged", async () => {
    const ex = await exercise(2);
    const admin = await signedIn(true);
    who.actor = admin.actor;
    expect((await checkUnlock({ ok: false }, form({ exerciseId: ex.id, passphrase: "whatever passphrase here", [PASSWORD_FIELD]: admin.password }))).ok).toBe(false);
    const stranger = await signedIn();
    who.actor = stranger.actor;
    const notNamed = await checkUnlock({ ok: false }, form({ exerciseId: ex.id, passphrase: "whatever passphrase here", [PASSWORD_FIELD]: stranger.password }));
    expect(message(notNamed)).toMatch(/Only an opening officer named on this exercise/);
    expect((await check(ex, ex.officers[0], { [PASSWORD_FIELD]: "not my password" })).ok).toBe(false);
    expect((await key(ex, ex.officers[0])).failedAttempts).toBe(0);
    const reasons = (await events(ex.id)).filter((e) => e.kind === "UNLOCK_CHECK").map((e) => e.reasonCode);
    expect(reasons).toEqual(expect.arrayContaining(["ADMINISTRATOR", "NOT_NAMED_OFFICER", "STEP_UP_REFUSED"]));
  }, 180_000);
});
