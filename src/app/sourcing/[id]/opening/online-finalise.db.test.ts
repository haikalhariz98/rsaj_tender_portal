import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3b step 15 against the scratch database, through the real actions, keys, mover and triggers (ADR 0036 D10, rulings 20, 20t, 20y; build plan step 15): every named officer signs, any one finalises
 * with their own passphrase, the declared figures are written only then and the snapshots carry them, every file is verified before the commit, the data keys are released and the mover files the files
 * in the document store without duplicates. Only the request is stood in for: who is signed in, the cookies and the cache.
 */

const opened = vi.hoisted(() => ({ calls: [] as { fn: string; purpose: string; recordId: string }[] }));
const mover = vi.hoisted(() => ({ skip: false }));

vi.mock("@/app/_auth/actor", async () => {
  const { who } = await import("@/lib/test-support/acting");
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
// The finalise's own call of the mover is skipped where a test drives the mover by hand.
vi.mock("@/lib/sealing/online-file-mover", async (orig) => {
  const real = await orig<typeof import("@/lib/sealing/online-file-mover")>();
  return { ...real, moveReleasedFiles: (...a: Parameters<typeof real.moveReleasedFiles>) => (mover.skip ? Promise.resolve({ moved: 0, failed: [], remaining: -1 }) : real.moveReleasedFiles(...a)) };
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

import { ctx, ago, bidder, exercise, estimateFor, filesOf, finalise, form, lodgeAs, message, openingOf, PASSWORD_FIELD, PLAIN, prepare, setClosing, setFileClass, sign, signedIn, start, submit, unsealed, who, fixtureSetup, fixtureTeardown, FIGURE_TEXT, PEPPER_ENV, type Officer } from "./online-opening.fixture";
import { actFieldNames } from "@/lib/auth/act-field-names";
import { db } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/portal/bids/limits";
import type { BidPartRule } from "@/lib/bids/online/types";
import { facts } from "@/lib/test-db/auth-fixtures";

import { lodgeEstimate } from "../scope/actions";
import { checkUnlock, rekeyExercise } from "../scope/key-actions";
import { authoriseOnlineUnseal } from "./unseal-actions";
import { fileSealedBidFiles, finaliseOnline, signOnlineFinalise } from "./online-finalise-actions";
import { disableAccount } from "@/lib/auth/administration";
import { ensureFileMoved, moveReleasedFiles } from "@/lib/sealing/online-file-mover";
import { MATRIX_FAULT_TEXT } from "@/lib/opening/matrix";
import { checklistFromSnapshot } from "@/lib/opening/checklist";
import { sulitGranted } from "@/lib/auth/sulit-access";
import { openingSection } from "@/lib/opening/read";
import { loadOpeningCheckFiles } from "@/lib/opening/sealed-file-store";
import { loadPepperList } from "@/lib/sealing/pepper-store";
import { finaliseOpening, recordChecklistAnswer, recordInitial, recordSignature, recordVerdict } from "./actions";

let org = "";
let bidFileClassId = "";

beforeAll(async () => {
  ({ org } = await fixtureSetup());
  bidFileClassId = ctx.bidFileClassId;
});
afterAll(fixtureTeardown);
const events = (exerciseId: string) => db.sealedAccessEvent.findMany({ where: { exerciseId }, orderBy: { at: "asc" } });


const sha256Of = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");


/// Tampers with a stored ciphertext as someone with the owner's login could: the immutability triggers are switched off for the one transaction and put back as they were.
async function tamperCipher(fileId: string, keepDigest: boolean) {
  const file = await db.onlineBidFile.findUniqueOrThrow({ where: { id: fileId } });
  const blob = await db.blobContent.findUniqueOrThrow({ where: { organisationId_sha256: { organisationId: org, sha256: file.cipherSha256 } } });
  const flipped = new Uint8Array(blob.bytes);
  flipped[0] ^= 0xff;
  const tables = ["BlobContent", "OnlineBidFile"];
  await db.$transaction(async (tx) => {
    const saved = await tx.$queryRawUnsafe<{ tbl: string; name: string; mode: string }[]>(
      `SELECT c.relname::text AS tbl, t.tgname::text AS name, t.tgenabled::text AS mode FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal AND c.relname IN ('BlobContent','OnlineBidFile')`,
    );
    for (const t of tables) await tx.$executeRawUnsafe(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
    if (keepDigest) await tx.$executeRawUnsafe(`UPDATE "BlobContent" SET "bytes" = $3 WHERE "organisationId" = $1 AND "sha256" = $2`, org, file.cipherSha256, Buffer.from(flipped));
    else await tx.$executeRawUnsafe(`UPDATE "BlobContent" SET "bytes" = $3, "sha256" = $4 WHERE "organisationId" = $1 AND "sha256" = $2`, org, file.cipherSha256, Buffer.from(flipped), sha256Of(flipped));
    for (const t of saved) await tx.$executeRawUnsafe(`ALTER TABLE "${t.tbl}" ${t.mode === "A" ? "ENABLE ALWAYS" : t.mode === "R" ? "ENABLE REPLICA" : "ENABLE"} TRIGGER "${t.name}"`);
  });
}

describe("the online finalise, n = 2 (D10, ruling 20t)", () => {
  it("finalises with one officer's passphrase after both signatures: the prices are written only then, the snapshots carry them, the keys are released and shredded as the files are filed", async () => {
    const { ex, opening, offers } = await unsealed(2, 2);
    await prepare(ex, opening.id, offers);
    const [o1, o2] = ex.officers;

    // No price exists before the finalise.
    for (const o of await db.openedBid.findMany({ where: { openingId: opening.id } })) expect(o).toMatchObject({ priceAsRead: null, completionPeriod: null, completionUnit: null });
    // The paper finalise refuses an online opening in words and never throws.
    who.actor = o1.actor;
    const paper = await finaliseOpening({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, [PASSWORD_FIELD]: o1.password }));
    expect(paper.ok).toBe(false);
    expect(message(paper)).toMatch(/takes bids online/);
    expect(message(paper)).toMatch(/Finalising section of this exercise/);

    // Nobody has signed: refused by name, and nothing was written.
    const none = await finalise(ex, opening.id, o1);
    expect(none.ok).toBe(false);
    expect(message(none)).toMatch(/Every named officer signs first/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    expect((await db.openedBid.findMany({ where: { openingId: opening.id } })).every((o) => o.priceAsRead === null)).toBe(true);

    // One signature of two is not enough.
    const s1 = await sign(ex, opening.id, o1);
    expect(s1.ok, message(s1)).toBe(true);
    expect(message(s1)).toMatch(/1 named officer has still to sign/);
    const one = await finalise(ex, opening.id, o2);
    expect(one.ok).toBe(false);
    expect(message(one)).toMatch(/Every named officer signs first/);
    // A signature is the officer's own, once.
    expect((await sign(ex, opening.id, o1)).ok).toBe(false);
    const s2 = await sign(ex, opening.id, o2);
    expect(s2.ok, message(s2)).toBe(true);
    expect(await db.openingSignature.count({ where: { openingId: opening.id } })).toBe(2);

    // A wrong passphrase is refused, counted on the key, and nothing is written.
    const wrong = await finalise(ex, opening.id, o2, { passphrase: "not the passphrase at all" });
    expect(wrong.ok).toBe(false);
    expect(message(wrong)).toMatch(/passphrase/i);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: o2.person.id, retiredAt: null } })).failedAttempts).toBe(1);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();

    // Any one of the two finalises, with only their own passphrase.
    const done = await finalise(ex, opening.id, o2);
    expect(done.ok, message(done)).toBe(true);
    expect(message(done)).toMatch(/4 files are being filed/);
    const after = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(after.finalisedAt).not.toBeNull();
    const priced = await db.openedBid.findMany({ where: { openingId: opening.id } });
    for (const p of priced) expect(p).toMatchObject({ completionPeriod: 9, completionUnit: "MONTHS" });
    expect(priced.map((p) => p.priceAsRead?.toString())).toEqual(["123456.78", "123456.78"]);
    // The snapshots were built from the prices written in the same transaction: every online price is in the schedule and in the Grand Summary.
    expect(JSON.stringify(after.scheduleSnapshot).match(/123,?456\.78/g)?.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(after.grandSummarySnapshot).match(/123,?456\.78/g)?.length).toBeGreaterThanOrEqual(2);
    expect((await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).status).toBe("OPENED");

    // Every data key was released, the mover filed each file, and every key reads NULL once all are moved.
    const files = await filesOf(ex.id);
    expect(files).toHaveLength(4);
    expect(files.every((f) => f.releasedDek === null && f.attachment !== null)).toBe(true);
    const docs = await db.documentAttachment.findMany({ where: { onlineBidFileId: { in: files.map((f) => f.id) } }, include: { version: { include: { document: true } } } });
    expect(docs).toHaveLength(4);
    for (const d of docs) {
      expect(d.purpose).toBe("ONLINE_BID_FILE");
      expect(d.version.sha256).toBe(sha256Of(new Uint8Array(PLAIN)));
      expect(d.version.document).toMatchObject({ status: "FILED", classificationSnapshot: "SULIT", documentClassId: bidFileClassId });
      expect(d.version.recordedBySupplierAccountId).not.toBeNull();
    }
    // The finalise is in the trail and the access log; the trail holds the price under the SULIT key and nowhere else in words.
    expect((await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.outcome === "GRANTED")).toHaveLength(1);
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: { in: [opening.id, ...priced.map((p) => p.id)] } } });
    expect(trail.some((a) => a.entityId === opening.id && JSON.stringify(a.changes).match(/filesReleasedToTheStore/))).toBe(true);
    expect(trail.filter((a) => priced.some((p) => p.id === a.entityId) && JSON.stringify(a.changes).match(/openingPrice/)).length).toBe(2);
    // Finalised twice is refused in words.
    const again = await finalise(ex, opening.id, o1);
    expect(again.ok).toBe(false);
    expect(message(again)).toMatch(/already finalised/);
  }, 300_000);

  it("a file that does not open whole blocks the finalise in words, before it commits: nothing is written, no key is released", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const files = await filesOf(ex.id);
    await tamperCipher(files[0].id, false);
    const blocked = await finalise(ex, opening.id, ex.officers[0]);
    expect(blocked.ok).toBe(false);
    expect(message(blocked)).toMatch(/did not open whole/);
    expect(message(blocked)).toMatch(/Nothing was finalised/);
    expect(message(blocked)).not.toMatch(/ONLINE_|FILE_UNREADABLE/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    expect((await db.openedBid.findMany({ where: { openingId: opening.id } })).every((o) => o.priceAsRead === null)).toBe(true);
    expect((await filesOf(ex.id)).every((f) => f.releasedDek === null)).toBe(true);
    expect((await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.outcome === "REFUSED" && e.reasonCode === "ONLINE_FILE_UNREADABLE")).toHaveLength(1);
  }, 300_000);

  it("a stored body that no longer matches its digest blocks the finalise too", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    await tamperCipher((await filesOf(ex.id))[1].id, true);
    const blocked = await finalise(ex, opening.id, ex.officers[1]);
    expect(blocked.ok).toBe(false);
    expect(message(blocked)).toMatch(/no longer matches the digest/);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
  }, 300_000);

  it("is refused for an administrator, someone not named on the exercise, and an opening not unsealed, and each is logged after the session check", async () => {
    const { ex, opening } = await unsealed(2, 1);
    const stranger = await signedIn();
    const strangerAsOfficer = { ...stranger, rosterId: "", passphrase: "does not matter" } as Officer;
    const named = await finalise(ex, opening.id, strangerAsOfficer);
    expect(named.ok).toBe(false);
    expect(message(named)).toMatch(/Only an opening officer named/);
    const admin = await signedIn(true);
    who.actor = admin.actor;
    const refusedAdmin = await finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, passphrase: "x".repeat(14), [PASSWORD_FIELD]: admin.password }));
    expect(refusedAdmin.ok).toBe(false);
    expect(message(refusedAdmin)).toMatch(/administrator/i);
    const unsigned = await sign(ex, opening.id, strangerAsOfficer);
    expect(unsigned.ok).toBe(false);
    const reasons = (await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.outcome === "REFUSED").map((e) => e.reasonCode);
    expect(reasons).toEqual(expect.arrayContaining(["NOT_NAMED_OFFICER", "ADMINISTRATOR"]));

    // Not unsealed: an opening that has only started.
    const exB = await exercise(2);
    const sB = await bidder(exB);
    await submit(sB, exB);
    await setClosing(exB.id, ago(40));
    expect((await start(exB)).ok).toBe(true);
    const openingB = await openingOf(exB);
    const early = await finalise(exB, openingB.id, exB.officers[0]);
    expect(early.ok).toBe(false);
    expect(message(early)).toMatch(/not unsealed yet|bids are not unsealed/i);
  }, 300_000);

  it("is refused in words, before any passphrase is tried, while the class a filed bid takes is not set", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    await setFileClass(null);
    try {
      const r = await finalise(ex, opening.id, ex.officers[0]);
      expect(r.ok).toBe(false);
      expect(message(r)).toMatch(/class that an online bid's files take/);
      expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: ex.officers[0].person.id, retiredAt: null } })).failedAttempts).toBe(0);
      expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    } finally {
      await setFileClass(bidFileClassId);
    }
  }, 300_000);
});

describe("the officer's screen of the online finalise and the files to check (20at)", () => {
  it("offers a named officer only the opening-check files, never another reader, and never after finalising; and says who has still to sign", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
    const rules = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id } })).onlineBidRules as unknown as { v: 1; frozenAt: string; parts: BidPartRule[] };
    // Only the part the rules mark as checked at the opening: the priced bill stays sealed until the finalise.
    const list = await loadOpeningCheckFiles({ organisationId: org, exerciseId: ex.id, openingId: opening.id, rules });
    expect(list).toHaveLength(1);
    expect(list[0].files.map((f) => f.partLabel)).toEqual(["Form of Tender"]);

    const named = await openingSection(org, ex.id, granted, ex.officers[0].person.id);
    expect(named!.openings[0].checkFiles?.[0].files).toHaveLength(1);
    const stranger = await signedIn();
    const other = await openingSection(org, ex.id, granted, stranger.person.id);
    expect(other!.openings[0].checkFiles).toBeNull();
    expect((await openingSection(org, ex.id, granted, null))!.openings[0].checkFiles).toBeNull();

    // The finalise is not offered as the paper one: it names who is still to sign, and the paper refusal is no outstanding item.
    const view = named!.openings[0];
    expect(view.finalise.online).toMatchObject({ signed: 0, of: 2 });
    expect(view.finalise.outstanding.join(" ")).not.toMatch(/takes bids online/);
    expect(view.signFor.map((p) => p.personId).sort()).toEqual(ex.officers.map((o) => o.person.id).sort());

    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const ready = (await openingSection(org, ex.id, granted, ex.officers[0].person.id))!.openings[0];
    expect(ready.finalise.online).toMatchObject({ signed: 2, of: 2 });
    expect(ready.finalise.outstanding).toEqual([]);
    expect(ready.finalise.allowed.allowed).toBe(true);
    expect((await finalise(ex, opening.id, ex.officers[1])).ok).toBe(true);
    expect((await openingSection(org, ex.id, granted, ex.officers[0].person.id))!.openings[0].checkFiles).toBeNull();
  }, 300_000);
});

describe("the mover (D10, M5)", () => {
  async function finalisedWithoutMover(bids: number) {
    const { ex, opening, offers } = await unsealed(2, bids);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    mover.skip = true;
    try {
      const done = await finalise(ex, opening.id, ex.officers[0]);
      expect(done.ok, message(done)).toBe(true);
    } finally {
      mover.skip = false;
    }
    return { ex, opening };
  }

  it("an interrupted mover resumes without duplicates, and every released key reads NULL once all are moved", async () => {
    const { ex } = await finalisedWithoutMover(1);
    const files = await filesOf(ex.id);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.releasedDek !== null && f.attachment === null)).toBe(true);
    // A crash after the link and the shred were written, before the commit: the whole transaction is gone.
    await expect(ensureFileMoved(org, files[0].id, { beforeCommit: () => { throw new Error("the mover was interrupted"); } })).rejects.toThrow(/interrupted/);
    const stillThere = await filesOf(ex.id);
    expect(stillThere.every((f) => f.releasedDek !== null && f.attachment === null)).toBe(true);
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: { in: files.map((f) => f.id) } } })).toBe(0);
    // Resumed.
    const first = await moveReleasedFiles({ organisationId: org, exerciseId: ex.id });
    expect(first).toMatchObject({ moved: 2, failed: [], remaining: 0 });
    const again = await moveReleasedFiles({ organisationId: org, exerciseId: ex.id });
    expect(again).toMatchObject({ moved: 0, failed: [], remaining: 0 });
    const done = await filesOf(ex.id);
    expect(done.every((f) => f.releasedDek === null && f.attachment !== null)).toBe(true);
    expect(await db.documentAttachment.count({ where: { onlineBidFileId: { in: files.map((f) => f.id) } } })).toBe(2);
  }, 300_000);

  it("two movers do not double-store", async () => {
    const { ex } = await finalisedWithoutMover(2);
    const files = await filesOf(ex.id);
    expect(files).toHaveLength(4);
    const before = await db.document.count({ where: { organisationId: org } });
    const results = await Promise.all([moveReleasedFiles({ organisationId: org, exerciseId: ex.id }), moveReleasedFiles({ organisationId: org, exerciseId: ex.id }), ensureFileMoved(org, files[0].id)]);
    expect(results[0].failed).toEqual([]);
    expect(results[1].failed).toEqual([]);
    expect(await db.document.count({ where: { organisationId: org } })).toBe(before + 4);
    const attachments = await db.documentAttachment.findMany({ where: { onlineBidFileId: { in: files.map((f) => f.id) } } });
    expect(attachments).toHaveLength(4);
    expect(new Set(attachments.map((a) => a.onlineBidFileId)).size).toBe(4);
    expect((await filesOf(ex.id)).every((f) => f.releasedDek === null)).toBe(true);
  }, 300_000);

  it("a file with no released key has nothing to move, and one that is not an id of this organisation is not found", async () => {
    const { ex } = await unsealed(2, 1);
    const f = (await filesOf(ex.id))[0];
    expect(await ensureFileMoved(org, f.id)).toEqual({ status: "NOTHING_TO_MOVE" });
    expect(await ensureFileMoved(org, "no_such_file")).toMatchObject({ status: "FAILED", code: "FILE_NOT_FOUND" });
  }, 300_000);
});

describe("the officer's passphrase acts take a per-account rate (20bb)", () => {
  it("counts before anything is tried: past the limit the act is refused in words and only the first refusal in the window is written", async () => {
    const ex = await exercise(2);
    const limit = RATE_LIMITS["officer-passphrase-act"].limit;
    const stranger = await signedIn();
    who.actor = stranger.actor;
    const call = (n: number) => finaliseOnline({ ok: false }, form({ exerciseId: ex.id, openingId: `no_opening_${n}`, passphrase: "", [PASSWORD_FIELD]: stranger.password }));
    for (let i = 0; i < limit; i++) expect(message(await call(i))).not.toMatch(/too many times/);
    const over = await call(limit);
    expect(over.ok).toBe(false);
    expect(message(over)).toMatch(/tried too many times/);
    for (let i = 1; i < 4; i++) expect(message(await call(limit + i))).toMatch(/tried too many times/);
    expect((await events(ex.id)).filter((e) => e.staffPersonId === stranger.person.id && e.reasonCode === "RATE_LIMITED")).toHaveLength(1);
    // The authorisation, the passphrase check and the signature share the one per-account count: the same account is refused at each.
    const authorised = await authoriseOnlineUnseal({ ok: false }, form({ exerciseId: ex.id, openingId: "x", passphrase: "", [PASSWORD_FIELD]: stranger.password }));
    expect(message(authorised)).toMatch(/tried too many times/);
    const checked = await checkUnlock({ ok: false }, form({ exerciseId: ex.id, passphrase: "", [PASSWORD_FIELD]: stranger.password }));
    expect(message(checked)).toMatch(/tried too many times/);
    const signed = await signOnlineFinalise({ ok: false }, form({ exerciseId: ex.id, openingId: "x", [PASSWORD_FIELD]: stranger.password }));
    expect(message(signed)).toMatch(/tried too many times/);
    expect((await events(ex.id)).filter((e) => e.staffPersonId === stranger.person.id && e.reasonCode === "RATE_LIMITED")).toHaveLength(1);
  }, 300_000);
});

describe("the exercises that still need the pepper (20y), read from the database", () => {
  it("lists an exercise wrapped under the held pepper's full id until its main opening is finalised, never reads a missing pepper as none, and leaves a cancelled one out", async () => {
    const keyA = randomBytes(32).toString("base64");
    process.env.SEALING_PEPPER = keyA;
    process.env.SEALING_PEPPER_ID = "ptest-a";
    try {
      const { ex, opening, offers } = await unsealed(2, 1);
      const ids = async () => (await loadPepperList(org)).rows.map((r) => r.id);
      const list = await loadPepperList(org);
      expect(list.state).toBe("SOME");
      expect(list.rows.find((r) => r.id === ex.id)).toMatchObject({ reference: ex.reference, title: "Unseal test" });
      // The same name with another key has another check value: it is not the pepper these officers wrapped under.
      process.env.SEALING_PEPPER = randomBytes(32).toString("base64");
      expect(await ids()).not.toContain(ex.id);
      // No pepper held, and one that is not usable: the list says so and never reads as nothing needing it.
      delete process.env.SEALING_PEPPER;
      delete process.env.SEALING_PEPPER_ID;
      expect(await loadPepperList(org)).toMatchObject({ state: "NOT_HELD", rows: [] });
      process.env.SEALING_PEPPER = "not base64 at all!";
      process.env.SEALING_PEPPER_ID = "ptest-a";
      expect(await loadPepperList(org)).toMatchObject({ state: "INVALID", rows: [] });

      // Held again: finalised, and with no late bid in the roll, the exercise no longer needs it.
      process.env.SEALING_PEPPER = keyA;
      expect(await ids()).toContain(ex.id);
      await prepare(ex, opening.id, offers);
      for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
      expect((await finalise(ex, opening.id, ex.officers[0])).ok).toBe(true);
      expect(await ids()).not.toContain(ex.id);

      // A cancelled exercise needs it no more (the status is set as the owner: the cancellation's own path is not under test).
      const other = await unsealed(2, 1);
      expect(await ids()).toContain(other.ex.id);
      await db.sourcingExercise.update({ where: { id: other.ex.id }, data: { status: "CANCELLED" } });
      expect(await ids()).not.toContain(other.ex.id);
    } finally {
      for (const k of PEPPER_ENV) delete process.env[k];
    }
  }, 300_000);
});

const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
const standing = (exerciseId: string) => db.sealedEstimateLodgement.findMany({ where: { exerciseId, supersededAt: null } });

describe("the sealed company estimate lodgement (step 16, ruling 20g)", () => {
  it("seals the figure under the live key through the real lodge act, is lodged once, and the figure reaches the opening only at the finalise", async () => {
    const lodged = { estimateId: "" };
    const { ex, opening, offers } = await unsealed(2, 1, async (e) => {
      lodged.estimateId = await estimateFor(e);
      const r = await lodgeAs(e, e.officers[0], lodged.estimateId);
      expect(r.ok, message(r)).toBe(true);
      // Lodged under this key already: lodging it again is refused as before.
      const dup = await lodgeAs(e, e.officers[0], lodged.estimateId);
      expect(dup.ok).toBe(false);
      expect(message(dup)).toMatch(/lodged/i);
      // No plain figure is stored in the lodgement, the trail or the access log.
      const [row] = await standing(e.id);
      expect(Buffer.concat([row.sealedEstimate, row.estimateDek]).includes(Buffer.from("55000"))).toBe(false);
      expect(row.keyId).toBe(e.keyId);
      const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: row.id } });
      expect(trail).toHaveLength(1);
      expect(JSON.stringify(trail)).not.toMatch(/55000/);
      expect(JSON.stringify(await events(e.id))).not.toMatch(/55000/);
      expect((await events(e.id)).filter((x) => x.kind === "ESTIMATE_LODGED" && x.outcome === "GRANTED")).toHaveLength(1);
      // No paper-box envelope is made online.
      expect(await db.bidEnvelope.count({ where: { exerciseId: e.id, kind: "COMPANY_ESTIMATE" } })).toBe(0);
    });
    // Before the finalise no figure of the estimate is on the opening.
    const before = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(before.estimateLodgedAmount).toBeNull();
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    const done = await finalise(ex, opening.id, ex.officers[1]);
    expect(done.ok, message(done)).toBe(true);
    const after = await db.opening.findUniqueOrThrow({ where: { id: opening.id } });
    expect(after.estimateLodgedAmount?.toFixed(2)).toBe(FIGURE_TEXT);
  }, 300_000);

  it("after a re-key the lodging officer lodges the same version again with a reason, nobody else does, and the start reads it as not lodged until then", async () => {
    const ex = await exercise(2, { requiresEstimate: true });
    const estimateId = await estimateFor(ex);
    const [o1, o2] = ex.officers;
    expect((await lodgeAs(ex, o1, estimateId)).ok).toBe(true);
    const first = (await standing(ex.id))[0];

    who.actor = o1.actor;
    const rekey = await rekeyExercise({ ok: false }, form({ exerciseId: ex.id, reason: "A passphrase was shared", [PASSWORD_FIELD]: o1.password }));
    expect(rekey.ok, message(rekey)).toBe(true);
    const liveKey = await db.exerciseSealingKey.findFirstOrThrow({ where: { exerciseId: ex.id, retiredAt: null } });
    expect(liveKey.id).not.toBe(first.keyId);

    // ESTIMATE_NOT_LODGED reads the online channel: the copy under the retired key no longer counts, though the estimate's state still says lodged.
    const notLodged = /none is lodged/;
    const gateAfterRekey = (await openingSection(org, ex.id, granted, null))!.start.allowed;
    expect(gateAfterRekey.allowed).toBe(false);
    expect(JSON.stringify(gateAfterRekey)).toMatch(notLodged);

    // Without a reason, and by another officer, it is refused and nothing changes.
    const noReason = await lodgeAs(ex, o1, estimateId);
    expect(noReason.ok).toBe(false);
    expect(message(noReason)).toMatch(/Say why/);
    const other = await lodgeAs(ex, o2, estimateId, { reason: "Because the key changed" });
    expect(other.ok).toBe(false);
    expect(message(other)).toMatch(/same officer/);
    expect((await standing(ex.id)).map((r) => r.id)).toEqual([first.id]);
    expect((await events(ex.id)).filter((e) => e.kind === "ESTIMATE_LODGED" && e.outcome === "REFUSED").length).toBe(2);

    const again = await lodgeAs(ex, o1, estimateId, { reason: "The key was changed" });
    expect(again.ok, message(again)).toBe(true);
    const now = await standing(ex.id);
    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({ keyId: liveKey.id });
    const old = await db.sealedEstimateLodgement.findUniqueOrThrow({ where: { id: first.id } });
    expect(old.supersededReason).toBe("The key was changed");
    // The same version: no new version row, and the start no longer reads the estimate as not lodged.
    expect(await db.companyEstimateVersion.count({ where: { estimateId } })).toBe(1);
    expect(JSON.stringify((await openingSection(org, ex.id, granted, null))!.start.allowed)).not.toMatch(notLodged);
    const trail = await db.auditEntry.findMany({ where: { organisationId: org, entityId: now[0].id } });
    expect(trail.map((t) => t.reason)).toContain("The key was changed");
    expect(JSON.stringify(trail)).not.toMatch(/55000/);
  }, 300_000);

  it("is refused after the closing, and refused for an administrator, each in words", async () => {
    const ex = await exercise(2);
    const estimateId = await estimateFor(ex);
    await setClosing(ex.id, ago(5));
    const late = await lodgeAs(ex, ex.officers[0], estimateId);
    expect(late.ok).toBe(false);
    expect(message(late)).toMatch(/closing has passed/);
    expect(await standing(ex.id)).toHaveLength(0);
    expect((await events(ex.id)).some((e) => e.kind === "ESTIMATE_LODGED" && e.outcome === "REFUSED" && e.reasonCode === "LODGEMENT_CLOSED")).toBe(true);

    const admin = await signedIn(true);
    who.actor = admin.actor;
    const refused = await lodgeEstimate({ ok: false }, form({ exerciseId: ex.id, estimateId, [PASSWORD_FIELD]: admin.password }));
    expect(refused.ok).toBe(false);
    expect((await events(ex.id)).some((e) => e.kind === "ESTIMATE_LODGED" && e.reasonCode === "ADMINISTRATOR")).toBe(true);
    expect(await standing(ex.id)).toHaveLength(0);
  }, 300_000);
});

describe("review of wave 3b: the doors that were open", () => {
  it("the paper signature act is refused on an online opening, for the officer's own and for another's, and writes nothing", async () => {
    const { ex, opening } = await unsealed(2, 1);
    const [o1, o2] = ex.officers;
    who.actor = o1.actor;
    const own = await recordSignature({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, personId: o1.person.id, signedOn: new Date().toISOString().slice(0, 10), [PASSWORD_FIELD]: o1.password }));
    expect(own.ok).toBe(false);
    expect(message(own)).toMatch(/takes bids online/);
    const other = await recordSignature({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id, personId: o2.person.id, signedOn: "2020-01-01", [PASSWORD_FIELD]: o1.password, [actFieldNames("personId").onBehalf]: "on", [actFieldNames("personId").paperReference]: "paper 1", [actFieldNames("personId").reason]: "signed on paper" }));
    expect(other.ok).toBe(false);
    expect(await db.openingSignature.count({ where: { openingId: opening.id } })).toBe(0);
  }, 300_000);

  it("a finalise before every officer has signed is refused before any passphrase is tried and before any grant is opened", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    expect((await sign(ex, opening.id, ex.officers[0])).ok).toBe(true);
    const early = await finalise(ex, opening.id, ex.officers[0], { passphrase: "a wrong passphrase, never tried" });
    expect(early.ok).toBe(false);
    expect(message(early)).toMatch(/Every named officer signs first/);
    expect((await db.officerExerciseKey.findFirstOrThrow({ where: { exerciseId: ex.id, personId: ex.officers[0].person.id, retiredAt: null } })).failedAttempts).toBe(0);
    expect((await events(ex.id)).filter((e) => e.kind === "FINALISE" && e.reasonCode === "ONLINE_NOT_ALL_SIGNED")).toHaveLength(1);
    expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
  }, 300_000);

  it("a file class that is no longer SULIT stops the finalise in words, and the mover refuses to file under it", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    await db.documentClass.update({ where: { id: bidFileClassId }, data: { classification: "INTERNAL" } });
    try {
      const r = await finalise(ex, opening.id, ex.officers[0]);
      expect(r.ok).toBe(false);
      expect(message(r)).toMatch(/no longer classified as the most restricted level/);
      expect((await db.opening.findUniqueOrThrow({ where: { id: opening.id } })).finalisedAt).toBeNull();
    } finally {
      await db.documentClass.update({ where: { id: bidFileClassId }, data: { classification: "SULIT" } });
    }
    mover.skip = true;
    try {
      expect((await finalise(ex, opening.id, ex.officers[0])).ok).toBe(true);
    } finally {
      mover.skip = false;
    }
    const file = (await filesOf(ex.id))[0];
    await db.documentClass.update({ where: { id: bidFileClassId }, data: { classification: "INTERNAL" } });
    try {
      expect(await ensureFileMoved(org, file.id)).toMatchObject({ status: "FAILED", code: "CLASS_NOT_SULIT" });
    } finally {
      await db.documentClass.update({ where: { id: bidFileClassId }, data: { classification: "SULIT" } });
    }
  }, 300_000);

  it("a named officer files what the mover left, again; someone not named cannot; and the count is on the opening until it is done", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    await prepare(ex, opening.id, offers);
    for (const o of ex.officers) expect((await sign(ex, opening.id, o)).ok).toBe(true);
    mover.skip = true;
    try {
      expect((await finalise(ex, opening.id, ex.officers[0])).ok).toBe(true);
    } finally {
      mover.skip = false;
    }
    const granted = sulitGranted(true as const, "ORGANISATION_PERMISSION");
    expect((await openingSection(org, ex.id, granted, ex.officers[0].person.id))!.openings[0].filesToFile).toBe(2);
    expect((await openingSection(org, ex.id, granted, null))!.openings[0].filesToFile).toBeNull();
    const stranger = await signedIn();
    who.actor = stranger.actor;
    const refused = await fileSealedBidFiles({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id }));
    expect(refused.ok).toBe(false);
    expect((await filesOf(ex.id)).every((f) => f.releasedDek !== null)).toBe(true);
    who.actor = ex.officers[1].actor;
    const done = await fileSealedBidFiles({ ok: false }, form({ exerciseId: ex.id, openingId: opening.id }));
    expect(done.ok, message(done)).toBe(true);
    expect((await filesOf(ex.id)).every((f) => f.releasedDek === null && f.attachment !== null)).toBe(true);
    expect((await openingSection(org, ex.id, granted, ex.officers[0].person.id))!.openings[0].filesToFile).toBe(0);
  }, 300_000);

  it("security audit: staff who are not on the panel cannot answer, decide or correct, and no one initials an online offer for another officer", async () => {
    const { ex, opening, offers } = await unsealed(2, 1);
    const item = checklistFromSnapshot(opening.checklistSnapshot).items[0];
    const stranger = await signedIn();
    who.actor = stranger.actor;
    for (const r of [
      await recordChecklistAnswer({ ok: false }, form({ exerciseId: ex.id, openedBidId: offers[0].id, itemKey: item.key, answer: "ABSENT" })),
      await recordVerdict({ ok: false }, form({ exerciseId: ex.id, openedBidId: offers[0].id, verdict: "REJECT", verdictReason: "No." })),
    ]) {
      expect(r.ok).toBe(false);
      // Wave 3c, plan §4.1 and 20cp: the refusal is the matrix's words (a person who is not a named officer), not the interim panel sentence it replaces.
      expect(message(r)).toBe(`Nothing was saved: ${MATRIX_FAULT_TEXT.NOT_A_NAMED_OFFICER}`);
    }
    expect(await db.openingChecklistAnswer.count({ where: { openedBidId: offers[0].id } })).toBe(0);
    expect((await db.openedBid.findUniqueOrThrow({ where: { id: offers[0].id } })).verdict).toBeNull();
    // An officer cannot initial for another on an online opening, even with a paper reference.
    who.actor = ex.officers[1].actor;
    const names = actFieldNames("personId");
    const other = await recordInitial({ ok: false }, form({ exerciseId: ex.id, openedBidId: offers[0].id, personId: ex.officers[0].person.id, [names.onBehalf]: "on", [names.paperReference]: "paper 1", [names.reason]: "initialled on paper" }));
    expect(other.ok).toBe(false);
    expect(await db.openedBidInitial.count({ where: { openedBidId: offers[0].id, personId: ex.officers[0].person.id } })).toBe(0);
  }, 300_000);

  it("one administrator cannot switch off the sign-in account of an opening officer between the unseal and finalising", async () => {
    const { ex } = await unsealed(2, 1);
    const admin = await signedIn(true);
    const refused = await disableAccount(admin.actor, { accountId: ex.officers[0].account.id, reason: "test" }, facts());
    expect(refused).toMatchObject({ ok: false, kind: "FAULTS", faults: [{ code: "OPENING_OFFICER_NEEDS_SECOND_PERSON" }] });
    expect((await db.staffAccount.findUniqueOrThrow({ where: { id: ex.officers[0].account.id } })).status).not.toBe("DISABLED");
  }, 300_000);
});
