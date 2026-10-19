import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3b step 17 against the scratch database, through the real actions, the real keys and the real triggers (ADR 0036 D11, rulings 11, 20bc, 20bk, 20t): after publication an authority names the incoming
 * officer in the departing officer's place, the incoming officer sets their own share, and the departing officer releases theirs, with the sign-in password asked again and their own passphrase. The key
 * and every bid sealed to it stay as they are, and the opening then unseals. After the closing there is no substitution, and the words say re-tender. Marking a share-holder as left between the unseal and
 * finalising needs a second approver, and the exercises it leaves unfinalisable are listed. Only the request is stood in for: who is signed in, the cookies and the cache.
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
import { submitBid, takeStamp } from "@/lib/bids/online/submit-store";
import { loadUploadFacts, storePart } from "@/lib/bids/online/upload-store";
import { SEALED_BIDS_DEMONSTRATION_ENV } from "@/lib/integration/sealing-deployment";
import type { BidPartRule } from "@/lib/bids/online/types";
import { ensureAdministrator, facts, makeAccount, makeSupplierAccount, randomId, setPolicy, SUPPLIER_SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { setOfficerShare } from "./key-actions";
import { removeOpeningOfficer, substituteOpeningOfficer } from "./prep-actions";
import { releaseShareForSubstitution } from "./substitution-actions";
import { authoriseOnlineUnseal } from "../opening/unseal-actions";
import { startOpening } from "../opening/actions";
import { beginActWith, type ActDeps } from "@/lib/auth/act-begin";
import { attributeAct } from "@/lib/auth/attribution-store";
import type { ChangeAct } from "@/lib/auth/change-store";
import { decideEdit, proposeEdit, type EditOperation, type EditRegistry } from "@/lib/auth/edit-store";
import { confirmStaffPassword } from "@/lib/auth/identity";
import { exposureLines, SECOND_APPROVER_WORDS } from "@/lib/sealing/deactivation";
import { SUBSTITUTION_WORDS } from "@/lib/sealing/substitution";
import { loadHolderExposures } from "@/lib/sealing/substitution-store";

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

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);
const setClosing = (exerciseId: string, closing: Date) => db.$executeRawUnsafe(`UPDATE "SourcingExercise" SET "closingAt" = $2 WHERE "id" = $1`, exerciseId, closing);

type Officer = { person: { id: string }; account: { id: string }; password: string; actor: StaffActor; rosterId: string; passphrase: string };
interface Ex { id: string; reference: string; windowId: string; partA: string; partB: string; officers: Officer[]; keyId: string; fingerprint: string; committeeId: string }
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
  return { id: ex.id, reference, windowId: window.id, partA, partB, officers, keyId: key.id, fingerprint: key.fingerprint, committeeId: committee.id };
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

// ------------------------------------------------------------------ the substitution's helpers

/// A person named in the leaver's place: signed in, holding a seat on the exercise's committee, with a passphrase of their own. Not yet on the roster.
async function newcomer(ex: Ex): Promise<Omit<Officer, "rosterId">> {
  const o = await signedIn();
  await db.committeeMember.create({ data: { committeeId: ex.committeeId, personId: o.person.id, seatLabel: "Member 3", position: "MEMBER", effectiveFrom: new Date("2026-01-01") } });
  return { ...o, passphrase: `newcomer passphrase ${randomId()} ok` };
}

/// The person in charge of the exercise, named on it as a participant: the one who may name officers on it.
async function lead(ex: Ex) {
  const o = await signedIn();
  await db.exerciseParticipant.create({ data: { exerciseId: ex.id, personId: o.person.id, capacity: "Procurement lead" } });
  return o;
}

const substitute = async (ex: Ex, leaving: Officer, by: { actor: StaffActor }, incoming: { person: { id: string } }, over: Record<string, string> = {}) => {
  who.actor = by.actor;
  return substituteOpeningOfficer({ ok: false }, form({ exerciseId: ex.id, officerId: leaving.rosterId, personId: incoming.person.id, authority: "Head of Procurement", reason: "The officer is on leave", ...over }));
};

const rosterRowOf = async (ex: Ex, personId: string) => (await db.exerciseOpeningOfficer.findFirstOrThrow({ where: { exerciseId: ex.id, personId, endedAt: null } })).id;

const setShare = async (ex: Ex, o: { actor: StaffActor; password: string; passphrase: string }) => {
  who.actor = o.actor;
  return setOfficerShare({ ok: false }, form({ exerciseId: ex.id, passphrase: o.passphrase, repeat: o.passphrase, [PASSWORD_FIELD]: o.password }));
};

const release = async (ex: Ex, o: { actor: StaffActor; password: string; passphrase: string }, over: Record<string, string> = {}) => {
  who.actor = o.actor;
  return releaseShareForSubstitution({ ok: false }, form({ exerciseId: ex.id, passphrase: o.passphrase, [PASSWORD_FIELD]: o.password, ...over }));
};

const liveKey = (ex: Ex) => db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
const liveShares = (ex: Ex) => db.exerciseKeyShare.findMany({ where: { keyId: ex.keyId, sealedShare: { not: null } }, select: { openingOfficerId: true } });

describe("a substitution after publication (D11, ruling 11)", () => {
  it("moves the departing officer's share to the incoming officer without changing the key, and the opening then unseals", async () => {
    const ex = await exercise(2);
    const s = await bidder(ex);
    await submit(s, ex);
    const [o1, o2] = ex.officers;
    const ctl = await lead(ex);
    const c = await newcomer(ex);

    // An authority names the incoming officer in o2's place. The key, and every bid sealed to it, stay.
    const named = await substitute(ex, o2, ctl, c);
    expect(named.ok, message(named)).toBe(true);
    expect(named.message).toMatch(/releases theirs to them/);
    expect((await liveKey(ex)).id).toBe(ex.keyId);
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect(await db.shareRelease.count({ where: { keyId: ex.keyId } })).toBe(0);
    expect((await liveShares(ex)).map((x) => x.openingOfficerId).sort()).toEqual([o1.rosterId, o2.rosterId].sort());
    const incomingRow = await rosterRowOf(ex, c.person.id);
    expect((await db.exerciseOpeningOfficer.findUniqueOrThrow({ where: { id: o2.rosterId } })).endedAt).not.toBeNull();

    // The share cannot be released before the incoming officer has set their own.
    const tooEarly = await release(ex, o2);
    expect(tooEarly.ok).toBe(false);
    expect(message(tooEarly)).toMatch(/incoming officer must set their own share first/);

    // The incoming officer sets their share: a key of their own, and no re-key. Anyone else named late is refused.
    const set = await setShare(ex, c);
    expect(set.ok, message(set)).toBe(true);
    expect(set.message).toMatch(/has now to release their share to you/);
    expect((await liveKey(ex)).id).toBe(ex.keyId);
    expect(await db.publishedKeyChange.count({ where: { exerciseId: ex.id } })).toBe(0);
    expect(await db.officerExerciseKey.count({ where: { exerciseId: ex.id, openingOfficerId: incomingRow, retiredAt: null } })).toBe(1);

    // Only the departing officer can release: another named officer, and an administrator, are refused and the refusal is logged.
    const other = await release(ex, o1);
    expect(other.ok).toBe(false);
    expect(message(other)).toMatch(/Only the departing officer can release their share/);
    const admin = await signedIn(true);
    const refusedAdmin = await release(ex, { ...admin, passphrase: "irrelevant passphrase here" });
    expect(refusedAdmin.ok).toBe(false);
    expect((await events(ex.id)).some((e) => e.kind === "SUBSTITUTION_RELEASE" && e.outcome === "REFUSED" && e.reasonCode === "ADMINISTRATOR")).toBe(true);
    expect(await db.shareRelease.count({ where: { keyId: ex.keyId } })).toBe(0);

    // The sign-in password is asked again, and a wrong passphrase is counted on the key's own lockout. Neither moves the share.
    const wrongPassword = await release(ex, o2, { [PASSWORD_FIELD]: "not my sign-in password" });
    expect(wrongPassword.ok).toBe(false);
    const wrongPassphrase = await release(ex, o2, { passphrase: "not the passphrase at all" });
    expect(wrongPassphrase.ok).toBe(false);
    expect(message(wrongPassphrase)).toMatch(/did not unlock your key/);
    expect(await db.shareRelease.count({ where: { keyId: ex.keyId } })).toBe(0);
    expect(await db.exerciseKeyShare.count({ where: { openingOfficerId: o2.rosterId, sealedShare: { not: null } } })).toBe(1);

    // The release: one transaction.
    const done = await release(ex, o2);
    expect(done.ok, message(done)).toBe(true);
    const releases = await db.shareRelease.findMany({ where: { keyId: ex.keyId } });
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ purpose: "SUBSTITUTION", sealedShares: null, releasedByPersonId: o2.person.id, substitutionOfficerId: incomingRow });
    expect(releases[0].usedAt).not.toBeNull();
    expect((await liveShares(ex)).map((x) => x.openingOfficerId).sort()).toEqual([o1.rosterId, incomingRow].sort());
    const old = await db.exerciseKeyShare.findFirstOrThrow({ where: { openingOfficerId: o2.rosterId } });
    expect(old.sealedShare).toBeNull();
    expect(old.endedReason).toMatch(/substitution/);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o2.person.id } })).retiredAt).not.toBeNull();
    expect((await liveKey(ex)).id).toBe(ex.keyId);
    // Signed (the password asked again, attributed to the departing officer in their capacity) and audited, and the access log holds a granted row.
    const attribution = await db.actAttribution.findFirstOrThrow({ where: { entity: "ShareRelease", entityId: releases[0].id } });
    expect(attribution.subjectPersonId).toBe(o2.person.id);
    expect(attribution.stepUpAt).not.toBeNull();
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: { in: [releases[0].id, old.id] } } });
    expect(trail.map((t) => t.entity).sort()).toEqual(["ExerciseKeyShare", "ShareRelease"]);
    expect(JSON.stringify(trail)).not.toMatch(/passphrase/i);
    expect((await events(ex.id)).some((e) => e.kind === "SUBSTITUTION_RELEASE" && e.outcome === "GRANTED" && e.staffPersonId === o2.person.id && e.recordId === releases[0].id)).toBe(true);
    // A second release finds nothing waiting.
    const again = await release(ex, o2);
    expect(again.ok).toBe(false);
    expect(message(again)).toMatch(/No substitution is waiting/);

    // The closing passes. The officers now are o1 and the incoming officer: the opening starts and unseals with both of them, and the departing officer is not one of them.
    await setClosing(ex.id, ago(40));
    const started = await start(ex, o1);
    expect(started.ok, message(started)).toBe(true);
    const opening = await openingOf(ex);
    const asOfficer = { ...c, rosterId: incomingRow };
    const stale = await authorise(ex, opening.id, o2);
    expect(stale.ok).toBe(false);
    expect((await authorise(ex, opening.id, o1)).ok).toBe(true);
    const last = await authorise(ex, opening.id, asOfficer);
    expect(last.ok, message(last)).toBe(true);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).not.toBeNull();
    expect(await db.openedBid.count({ where: { openingId: opening.id } })).toBe(1);
  }, 180_000);

  it("is refused after the closing, in words that say re-tender, and a release left until then is refused with the departing share untouched", async () => {
    const ex = await exercise(2);
    const [o1, o2] = ex.officers;
    const ctl = await lead(ex);
    const c = await newcomer(ex);
    const c2 = await newcomer(ex);
    expect((await substitute(ex, o2, ctl, c)).ok).toBe(true);
    expect((await setShare(ex, c)).ok).toBe(true);
    // Another substitution while one waits is refused, in words.
    const second = await substitute(ex, o1, ctl, c2);
    expect(second.ok).toBe(false);
    expect(message(second)).toMatch(/Another substitution is still waiting/);

    await setClosing(ex.id, ago(40));
    // The opening cannot start with the share still with the officer who was replaced, and says what has happened.
    const refusedStart = await start(ex, o1);
    expect(refusedStart.ok).toBe(false);
    expect(message(refusedStart)).toMatch(/officer substitution is unfinished/ /* 0005, founder 2026-10-19 */);
    expect(message(refusedStart)).toMatch(/re-tendered/);
    // The release is refused past the closing, and the share stays where it was.
    const late = await release(ex, o2);
    expect(late.ok).toBe(false);
    expect(message(late)).toMatch(/re-tendered/);
    expect(await db.shareRelease.count({ where: { keyId: ex.keyId } })).toBe(0);
    expect(await db.exerciseKeyShare.count({ where: { openingOfficerId: o2.rosterId, sealedShare: { not: null } } })).toBe(1);
    // And no substitution can be started past the closing.
    const lateStart = await substitute(ex, o1, ctl, c2);
    expect(lateStart.ok).toBe(false);
    expect(message(lateStart)).toMatch(/re-tendered/);
    // The database refuses it too: a release written at or after the closing is PA026, whatever the application says.
    expect(SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER).toMatch(/re-tendered/);
  }, 180_000);

  it("refuses to add or take off an officer of a published online exercise, and says a substitution is the way", async () => {
    const ex = await exercise(2);
    const ctl = await lead(ex);
    who.actor = ctl.actor;
    const removed = await removeOpeningOfficer({ ok: false }, form({ exerciseId: ex.id, officerId: ex.officers[0].rosterId, reason: "Gone" }));
    expect(removed.ok).toBe(false);
    expect(message(removed)).toMatch(/replaced by a substitution/);
    expect(message(removed)).not.toMatch(/not built/);
  }, 120_000);
});

// ------------------------------------------------------------------ marking a share-holder as left

const deps: ActDeps = {
  now: () => new Date(),
  paperSignatureRecording: async () => null,
  stepUp: async (actor, password) => {
    const r = await confirmStaffPassword(actor, password, facts());
    return r.ok ? r : { ok: false, message: r.kind };
  },
  attribute: attributeAct,
};
const leaverOperation: EditOperation = { key: "users.setPersonActive", kind: "CONFIGURATION_EDIT", label: "Mark a person as having left", administratorMay: true, proposePermission: "configuration.draft", decidePermission: "configuration.issue" };
const registry: EditRegistry = {
  find: (key) => (key === leaverOperation.key ? leaverOperation : null),
  run: async (key, data) => {
    if (key !== leaverOperation.key) return { ok: false, message: "unknown" };
    const core = await import("@/app/configuration/users/core");
    return core.setPersonActive({ ok: false }, data);
  },
};
async function actFor(a: { actor: StaffActor; password: string }, key: "ConfigurationChange.proposedBy" | "ConfigurationChange.decidedBy", changeId?: string): Promise<ChangeAct> {
  const f = new FormData();
  f.set(PASSWORD_FIELD, a.password);
  const begun = await beginActWith(deps, a.actor, f, key, { personField: "personId", ...(changeId ? { document: { entity: "ConfigurationChange", id: changeId } } : {}) });
  if (!begun.ok) throw new Error(`the act was refused: ${JSON.stringify(begun.state)}`);
  return begun.act;
}
const leaverForm = (personId: string): FormData => form({ id: personId, isActive: "", reason: "The officer has left the organisation" });

/// An opening officer of an online exercise whose bids are opened and not yet finalised: the window of ruling 20t.
async function unsealedExercise() {
  const ex = await exercise(2);
  const s = await bidder(ex);
  await submit(s, ex);
  await setClosing(ex.id, ago(40));
  expect((await start(ex)).ok).toBe(true);
  const opening = await openingOf(ex);
  for (const o of ex.officers) expect((await authorise(ex, opening.id, o)).ok).toBe(true);
  expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).unsealedAt).not.toBeNull();
  return ex;
}

describe("marking a share-holder as left (D11, 20t)", () => {
  it("between the unseal and finalising one person alone is refused, a proposal changes nothing, and a second approver's decision succeeds, listing the exercise it leaves unfinalisable", async () => {
    const ex = await unsealedExercise();
    const leaver = ex.officers[0];
    const a = await signedIn(true);
    const b = await signedIn(true);

    // The screen lists it before anyone acts.
    const exposure = (await loadHolderExposures(db, org, new Date(), [leaver.person.id])).get(leaver.person.id) ?? [];
    expect(exposure.map((x) => [x.exerciseId, x.kind])).toEqual([[ex.id, "UNFINALISABLE"]]);
    const lines = exposureLines(exposure);
    expect(lines[0]).toContain(ex.reference);
    expect(lines[0]).toMatch(/can never be finalised/);
    expect(lines[0]).toMatch(/must be re-tendered/);

    // One person, acting alone: refused, in words, and nothing changes.
    who.actor = a.actor;
    const core = await import("@/app/configuration/users/core");
    const alone = await core.setPersonActive({ ok: false }, leaverForm(leaver.person.id));
    expect(alone.ok).toBe(false);
    expect(message(alone)).toBe(SECOND_APPROVER_WORDS);
    expect((await db.person.findUniqueOrThrow({ where: { id: leaver.person.id } })).isActive).toBe(true);

    // A proposal is allowed and changes nothing; its author cannot decide it.
    const proposed = await proposeEdit(a.actor, await actFor(a, "ConfigurationChange.proposedBy"), registry, { operation: leaverOperation.key, fields: [["id", leaver.person.id], ["isActive", ""], ["reason", "The officer has left the organisation"]], reason: "The officer has left the organisation" });
    expect(proposed.ok, JSON.stringify(proposed)).toBe(true);
    if (!proposed.ok) return;
    expect((await db.person.findUniqueOrThrow({ where: { id: leaver.person.id } })).isActive).toBe(true);
    who.actor = a.actor;
    const own = await decideEdit(a.actor, await actFor(a, "ConfigurationChange.decidedBy", proposed.changeId), registry, { changeId: proposed.changeId, decision: "APPLY", reason: "" });
    expect(own.ok).toBe(false);
    expect((await db.person.findUniqueOrThrow({ where: { id: leaver.person.id } })).isActive).toBe(true);

    // A second person decides it: the person is marked as left, and the exercise's trail says what that left.
    who.actor = b.actor;
    const decided = await decideEdit(b.actor, await actFor(b, "ConfigurationChange.decidedBy", proposed.changeId), registry, { changeId: proposed.changeId, decision: "APPLY", reason: "" });
    expect(decided.ok, JSON.stringify(decided)).toBe(true);
    expect((await db.person.findUniqueOrThrow({ where: { id: leaver.person.id } })).isActive).toBe(false);
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entity: "SourcingExercise", entityId: ex.id, entityLabel: { contains: "Opening officer" } } });
    expect(trail).toHaveLength(1);
    expect(JSON.stringify(trail[0].changes)).toMatch(/must be re-tendered/);
    // The way out is the existing cancellation, which is not this act's to do: the opening stays unfinalised.
    expect((await db.opening.findFirstOrThrow({ where: { exerciseId: ex.id } })).finalisedAt).toBeNull();
  }, 240_000);

  it("before the unseal it is not refused, lists the exercise and its reason, and records what was left", async () => {
    const ex = await exercise(2);
    const leaver = ex.officers[0];
    const a = await signedIn(true);
    const exposure = (await loadHolderExposures(db, org, new Date(), [leaver.person.id])).get(leaver.person.id) ?? [];
    expect(exposure.map((x) => x.kind)).toEqual(["SUBSTITUTE_BEFORE_CLOSING"]);
    who.actor = a.actor;
    const core = await import("@/app/configuration/users/core");
    const done = await core.setPersonActive({ ok: false }, leaverForm(leaver.person.id));
    expect(done.ok, message(done)).toBe(true);
    expect((await db.person.findUniqueOrThrow({ where: { id: leaver.person.id } })).isActive).toBe(false);
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entity: "SourcingExercise", entityId: ex.id, entityLabel: { contains: "Opening officer" } } });
    expect(JSON.stringify(trail.map((t) => t.changes))).toMatch(/can still be replaced/);
  }, 180_000);
});
