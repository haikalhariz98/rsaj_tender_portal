/**
 * The online unseal's rows (ADR 0036 D3, D10, H2, H3 option a; rulings 20t, 20aa; wave 3b step 13). Every function takes the transaction of the act that calls it, which holds the exercise's locks
 * (`inOpening`). Nothing here asks who the actor is or whether the act is allowed: the pure rules in `unseal.ts`, `start.ts` and `online-unseal.ts` do, before these are called.
 *
 * This is the one file that reads the sealed bids' identity (the supplier, to list its party) and the one that writes an online `OpenedBid`, with its price NULL: the declared figures stay sealed
 * until the finalise (ruling 20). It never decrypts a declaration, a late bid, a replaced bid or a withdrawn one. The exercise key, the officer's key, every data key and every share are zeroed
 * before a function returns.
 */

import { createHash, randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { receiptRoll } from "@/lib/bids/online/roll";
import { submissionNumbers } from "@/lib/bids/online/receipt";
import { declarationDekAad, manifestAad, manifestDekAad } from "@/lib/sealing/bid-seal";
import { loadCeremony } from "@/lib/sealing/store";
import { shareAad } from "@/lib/sealing/ceremony-seal";
import { fileDekAad } from "@/lib/sealing/file-seal";
import { SealError, zero, type Bytes } from "@/lib/sealing/types";
import { combineHeld, estimateDekAad, officerGrantAad, openRelease, openStoredGcm, openStoredHpke, sealGrant, sealRelease, shareReleaseAad, type HeldShare } from "@/lib/sealing/unseal-seal";
import type { AlternativeConsideration, SaleFinding, RestrictionFinding } from "./types";
import type { OnlineBidRules } from "@/lib/bids/online/types";

import { bidCheckFaults, grantPlan, listingOrder, parseManifest, partyFor, rollEntries, unsealSelection, type OnlineUnsealFault } from "./online-unseal";
import { alternativeOf, nextListingNo } from "./open";

export interface UnsealKeys {
  liveKey: { id: string; fingerprint: string; publicKey: Bytes };
  /// The live key's shares, one per named officer, by the share's own id.
  shares: { id: string; rosterRowId: string; officerKeyId: string }[];
  officers: { rosterRowId: string; personId: string; officerKeyId: string; publicKey: Bytes }[];
}

/// The database's clock, the one the triggers read (ruling 20aa). Never the application server's.
export async function databaseClock(tx: Tx): Promise<Date> {
  const rows = await tx.$queryRaw<{ clock: Date }[]>`SELECT clock_timestamp() AS clock`;
  return rows[0].clock;
}

/**
 * The live key and the officers it is split across, as the unseal needs them. Null (with the reason) where the key is not live, or is not split across exactly the officers named now: the
 * roster changed after the key was made, which is a controlled change (step 17) and not something the unseal repairs.
 */
export async function loadUnsealKeys(tx: Tx, organisationId: string, exerciseId: string): Promise<{ ok: true; keys: UnsealKeys } | { ok: false; fault: "KEY_NOT_LIVE" | "KEY_OFFICERS_MISMATCH" }> {
  const f = await loadCeremony(tx, organisationId, exerciseId);
  if (!f.liveKey) return { ok: false, fault: "KEY_NOT_LIVE" };
  const keyOf = new Map(f.officerKeys.map((k) => [k.openingOfficerId, k]));
  const held = new Set(f.shareHolderRowIds);
  if (f.liveKey.officerCount !== f.roster.length || f.roster.some((r) => !keyOf.has(r.id) || !held.has(r.id)) || held.size !== f.roster.length) return { ok: false, fault: "KEY_OFFICERS_MISMATCH" };
  const key = await tx.exerciseSealingKey.findFirstOrThrow({ where: { id: f.liveKey.id, organisationId }, select: { publicKey: true } });
  const rows = await tx.exerciseKeyShare.findMany({ where: { keyId: f.liveKey.id, organisationId, sealedShare: { not: null } }, select: { id: true, openingOfficerId: true, officerKeyId: true } });
  const shares = rows.map((s) => ({ id: s.id, rosterRowId: s.openingOfficerId, officerKeyId: s.officerKeyId }));
  const officers = f.roster.map((r) => ({ rosterRowId: r.id, personId: r.personId, officerKeyId: keyOf.get(r.id)!.id, publicKey: new Uint8Array(keyOf.get(r.id)!.publicKey) }));
  return { ok: true, keys: { liveKey: { id: f.liveKey.id, fingerprint: f.liveKey.fingerprint, publicKey: new Uint8Array(key.publicKey) }, shares, officers } };
}

/// The roll `startOpening` freezes: every standing submission's sequence, receipt digest and late flag. Read after the start's locks and the skew, so it equals the in-time state at the closing.
export async function freezeReceiptRoll(tx: Tx, organisationId: string, exerciseId: string): Promise<ReturnType<typeof receiptRoll>> {
  const rows = await tx.onlineBid.findMany({ where: { exerciseId, organisationId }, select: { status: true, receiptDigest: true, envelope: { select: { sequence: true, late: true } } } });
  return receiptRoll(rows.map((r) => ({ sequence: r.envelope.sequence, receiptDigest: r.receiptDigest, late: r.envelope.late, status: r.status })));
}

// ------------------------------------------------------------------ the shares

export type GatherFault = "SHARES_INCOMPLETE" | "SHARES_MISMATCH";

/**
 * The shares this officer holds now: their own (the live key's share sealed to their key), and every release made to them by an officer who authorised this sitting before them. Opened with
 * the officer's private key. A share or release that does not open is a defect or an attack and is reported as SHARES_MISMATCH, never skipped.
 */
export async function gatherHeldShares(tx: Tx, i: { organisationId: string; exerciseId: string; openingId: string; sittingNo: number; keys: UnsealKeys; officerKeyId: string; privateKey: Bytes }): Promise<{ ok: true; held: HeldShare[]; incoming: string[] } | { ok: false; fault: GatherFault }> {
  const own = i.keys.shares.find((s) => s.officerKeyId === i.officerKeyId);
  if (!own) return { ok: false, fault: "SHARES_INCOMPLETE" };
  const row = await tx.exerciseKeyShare.findFirst({ where: { id: own.id, organisationId: i.organisationId, sealedShare: { not: null } }, select: { sealedShare: true } });
  if (!row?.sealedShare) return { ok: false, fault: "SHARES_INCOMPLETE" };
  const held: HeldShare[] = [];
  const incoming: string[] = [];
  try {
    held.push({ shareId: own.id, share: openStoredHpke({ privateKey: i.privateKey, stored: new Uint8Array(row.sealedShare), aad: shareAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keys.liveKey.id, shareId: own.id }) }) });
    const releases = await tx.shareRelease.findMany({
      where: { organisationId: i.organisationId, openingId: i.openingId, purpose: "UNSEAL", keyId: i.keys.liveKey.id, toOfficerKeyId: i.officerKeyId, usedAt: null, lapsedAt: null, sealedShares: { not: null }, authorisation: { sittingNo: i.sittingNo, lapsedAt: null } },
      select: { id: true, sealedShares: true },
    });
    for (const r of releases) {
      held.push(...openRelease({ recipientPrivate: i.privateKey, sealed: new Uint8Array(r.sealedShares!), aad: shareReleaseAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keys.liveKey.id, releaseId: r.id, toOfficerKeyId: i.officerKeyId }) }));
      incoming.push(r.id);
    }
  } catch (e) {
    for (const h of held) zero(h.share);
    if (e instanceof SealError) return { ok: false, fault: "SHARES_MISMATCH" };
    throw e;
  }
  return { ok: true, held, incoming };
}

/// A non-last authorisation: every share held, sealed to each officer still to act, one release each.
export async function forwardShares(tx: Tx, i: { organisationId: string; exerciseId: string; openingId: string; authorisationId: string; keys: UnsealKeys; fromOfficerKeyId: string; held: readonly HeldShare[]; to: readonly string[]; now: Date }): Promise<number> {
  for (const rosterRowId of i.to) {
    const officer = i.keys.officers.find((o) => o.rosterRowId === rosterRowId)!;
    const releaseId = randomUUID();
    const sealed = sealRelease({ recipientPublic: officer.publicKey, held: i.held, aad: shareReleaseAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keys.liveKey.id, releaseId, toOfficerKeyId: officer.officerKeyId }) });
    await tx.shareRelease.create({
      data: { id: releaseId, organisationId: i.organisationId, keyId: i.keys.liveKey.id, purpose: "UNSEAL", openingId: i.openingId, authorisationId: i.authorisationId, fromOfficerKeyId: i.fromOfficerKeyId, toOfficerKeyId: officer.officerKeyId, sealedShares: sealed as Uint8Array<ArrayBuffer>, createdAt: i.now },
    });
  }
  return i.to.length;
}

/// Shreds releases once used (a release consumed by an authorisation, or every one left when the unseal is done) or lapsed (the authorisations that made them lapsed, C-2): the sealed shares become NULL.
export async function shredReleases(tx: Tx, i: { organisationId: string; openingId: string; ids?: readonly string[]; authorisationIds?: readonly string[]; as: "used" | "lapsed"; now: Date }): Promise<number> {
  const where: Prisma.ShareReleaseWhereInput = { organisationId: i.organisationId, openingId: i.openingId, purpose: "UNSEAL", sealedShares: { not: null }, ...(i.ids ? { id: { in: [...i.ids] } } : {}), ...(i.authorisationIds ? { authorisationId: { in: [...i.authorisationIds] } } : {}) };
  const r = await tx.shareRelease.updateMany({ where, data: { sealedShares: null, ...(i.as === "used" ? { usedAt: i.now } : { lapsedAt: i.now }) } });
  return r.count;
}

/// Lapses every share release still holding other officers' shares on any opening of the exercise (security audit, stage C): called where the exercise ends or the split can no longer be used, so
/// a copy of the database holds no officer's share beyond the sitting that made it. Returns how many were shredded.
export async function shredExerciseReleases(tx: Tx, i: { organisationId: string; exerciseId: string; now: Date }): Promise<number> {
  const r = await tx.shareRelease.updateMany({ where: { organisationId: i.organisationId, purpose: "UNSEAL", sealedShares: { not: null }, opening: { exerciseId: i.exerciseId } }, data: { sealedShares: null, lapsedAt: i.now } });
  return r.count;
}

// ------------------------------------------------------------------ the unseal itself

export interface BidToOpen {
  onlineBidId: string;
  envelopeId: string;
  sequence: number;
  kind: "BID" | "ALTERNATIVE";
  /// The current parent bid (null: none, or cleared by its withdrawal).
  parentOnlineBidId: string | null;
  partyId: string;
  partyName: string;
  grants: { subject: "FILE" | "DECLARATION"; recordId: string; use: "OPENING_CHECK" | "FINALISE"; officerKeyId: string; sealedDek: Bytes }[];
}

export interface UnsealPlan {
  open: BidToOpen[];
  /// Late, still sealed, waiting for the committee and a supplementary opening.
  waiting: number;
  estimateGrants: { recordId: string; officerKeyId: string; sealedDek: Bytes }[];
}

export type PrepareResult = { ok: true; plan: UnsealPlan } | { ok: false; faults: { fault: OnlineUnsealFault; sequence?: number }[] };

/**
 * Reconstructs the exercise key from the shares gathered, opens the manifests of the bids this opening opens and checks each against its own row, the roll and its receipt digest, then
 * re-seals every data key to each named officer. Reads only; writes nothing. Nothing is returned that is plain. The key and every data key are zeroed in `finally`.
 */
export async function prepareUnseal(
  tx: Tx,
  i: {
    organisationId: string;
    exerciseId: string;
    opening: { kind: "MAIN" | "SUPPLEMENTARY"; id: string; admissionEnvelopeId: string | null };
    /// The MAIN opening's frozen roll (a supplementary opening checks its bid against the same list).
    roll: unknown;
    keys: UnsealKeys;
    held: readonly HeldShare[];
    rules: OnlineBidRules | null;
    /// The parties of the exercise, to list each bidder, and which have a standing sale.
    parties: readonly { id: string; name: string; vendorId: string | null }[];
    salePartyIds: ReadonlySet<string>;
  },
): Promise<PrepareResult> {
  const combined = combineHeld(i.held, i.keys.shares.map((s) => s.id), i.keys.liveKey.publicKey);
  if (!combined.ok) return { ok: false, faults: [{ fault: combined.fault === "SHARE_COUNT" ? "SHARES_INCOMPLETE" : "SHARES_MISMATCH" }] };
  const k = combined.k;
  const secrets: Bytes[] = [k];
  try {
    const entries = rollEntries(i.roll);
    if (!entries) return { ok: false, faults: [{ fault: "ROLL_NOT_FROZEN" }] };
    const bids = await tx.onlineBid.findMany({
      where: { exerciseId: i.exerciseId, organisationId: i.organisationId },
      include: { envelope: { select: { id: true, sequence: true, late: true, receivedAt: true } }, parts: { include: { file: { select: { id: true, packPartId: true, cipherSha256: true, sealedDek: true, keyId: true } } } } },
    });
    const view = bids.map((b) => ({ id: b.id, sequence: b.envelope.sequence, status: b.status, late: b.envelope.late }));
    const faults: { fault: OnlineUnsealFault; sequence?: number }[] = [];
    let chosen: string[];
    let waiting = 0;
    if (i.opening.kind === "MAIN") {
      const sel = unsealSelection({ bids: view, roll: entries });
      faults.push(...sel.faults.map((f) => ({ fault: f.fault, sequence: f.sequence })));
      chosen = sel.open;
      waiting = sel.waiting.length;
    } else {
      const one = bids.find((b) => b.envelopeId === i.opening.admissionEnvelopeId && b.status === "SUBMITTED" && b.envelope.late);
      chosen = one ? [one.id] : [];
      if (!one) faults.push({ fault: "BID_ROLL_CHANGED" });
    }
    const byId = new Map(bids.map((b) => [b.id, b]));
    const replacedBy = (id: string) => bids.find((b) => b.replacesOnlineBidId === id)?.id ?? null;
    const live = await tx.sealedEstimateLodgement.findFirst({ where: { exerciseId: i.exerciseId, organisationId: i.organisationId, keyId: i.keys.liveKey.id, supersededAt: null }, orderBy: { lodgedAt: "desc" }, select: { id: true, estimateDek: true } });

    const open: BidToOpen[] = [];
    for (const id of listingOrder(chosen.map((c) => ({ id: c, kind: byId.get(c)!.kind, sequence: byId.get(c)!.envelope.sequence })))) {
      const b = byId.get(id.id)!;
      const sequence = b.envelope.sequence;
      const ctx = { organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: b.keyId, onlineBidId: b.id };
      const own = bids.filter((x) => x.supplierId === b.supplierId).map((x) => ({ id: x.id, sequence: x.envelope.sequence }));
      let manifest = null as ReturnType<typeof parseManifest>;
      if (b.keyId === i.keys.liveKey.id) {
        let dek: Bytes | null = null;
        let plain: Bytes | null = null;
        try {
          dek = openStoredHpke({ privateKey: k, stored: new Uint8Array(b.manifestDek), aad: manifestDekAad(ctx) });
          plain = openStoredGcm({ dek, stored: new Uint8Array(b.sealedManifest), aad: manifestAad(ctx) });
          manifest = parseManifest(JSON.parse(new TextDecoder().decode(plain)));
        } catch (e) {
          if (!(e instanceof SealError) && !(e instanceof SyntaxError)) throw e;
        } finally {
          if (dek) zero(dek);
          if (plain) zero(plain);
        }
      }
      const found = bidCheckFaults({
        bid: {
          id: b.id, exerciseId: b.exerciseId, supplierId: b.supplierId, accountId: b.submittedBySupplierAccountId, kind: b.kind, parentOnlineBidId: b.parentOnlineBidId, replacesOnlineBidId: b.replacesOnlineBidId, keyId: b.keyId,
          sequence, receivedAt: b.envelope.receivedAt, sealedManifest: new Uint8Array(b.sealedManifest), sealedDeclaration: new Uint8Array(b.sealedDeclaration),
          manifestCipherSha256: b.manifestCipherSha256, declarationCipherSha256: b.declarationCipherSha256, receiptDigest: b.receiptDigest,
          files: b.parts.map((p) => ({ fileId: p.file.id, packPartId: p.file.packPartId, cipherSha256: p.file.cipherSha256 })),
        },
        manifest,
        liveKey: { id: i.keys.liveKey.id, fingerprint: i.keys.liveKey.fingerprint },
        submissionNumber: submissionNumbers(own).get(b.id) ?? 0,
        rollEntry: entries.find((e) => e.sequence === sequence) ?? null,
        replacedBy,
        // A sealed parent that was withdrawn cleared this alternative's link (20h, trigger 6).
        withdrawnClearedLink: manifest?.parentOnlineBidId ? byId.get(manifest.parentOnlineBidId)?.status === "WITHDRAWN" : false,
        expectLate: i.opening.kind === "SUPPLEMENTARY",
      });
      if (found.length) {
        faults.push(...found.map((fault) => ({ fault, sequence })));
        continue;
      }
      const party = partyFor(i.parties.filter((p) => p.vendorId === b.supplierId), i.salePartyIds);
      if (!party) {
        faults.push({ fault: "PARTY_NOT_FOUND", sequence });
        continue;
      }
      // Every data key of the bid, opened with the exercise key and sealed again to each named officer.
      const keysToGrant: { subject: "FILE" | "DECLARATION"; recordId: string; use: "OPENING_CHECK" | "FINALISE"; dek: Bytes }[] = [];
      try {
        const plan = grantPlan({ files: b.parts.map((p) => ({ fileId: p.file.id, packPartId: p.file.packPartId })), declarationBidId: b.id, rules: i.rules?.parts ?? [] });
        for (const item of plan) {
          let dek: Bytes;
          if (item.subject === "FILE") {
            const file = b.parts.find((p) => p.file.id === item.recordId)!.file;
            dek = openStoredHpke({ privateKey: k, stored: new Uint8Array(file.sealedDek), aad: fileDekAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: file.keyId, fileId: file.id, packPartId: file.packPartId }) });
          } else {
            dek = openStoredHpke({ privateKey: k, stored: new Uint8Array(b.declarationDek), aad: declarationDekAad(ctx) });
          }
          secrets.push(dek);
          keysToGrant.push({ ...item, dek });
        }
      } catch (e) {
        if (e instanceof SealError) {
          faults.push({ fault: "BID_FILES", sequence });
          continue;
        }
        throw e;
      }
      const grants = i.keys.officers.flatMap((o) =>
        keysToGrant.map((g) => ({
          subject: g.subject, recordId: g.recordId, use: g.use, officerKeyId: o.officerKeyId,
          sealedDek: sealGrant({ officerPublic: o.publicKey, dek: g.dek, aad: officerGrantAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, openingId: i.opening.id, officerKeyId: o.officerKeyId, subject: g.subject, recordId: g.recordId, use: g.use }) }),
        })),
      );
      open.push({ onlineBidId: b.id, envelopeId: b.envelopeId, sequence, kind: b.kind, parentOnlineBidId: b.parentOnlineBidId, partyId: party, partyName: i.parties.find((p) => p.id === party)!.name, grants });
    }
    if (faults.length) return { ok: false, faults };

    // The company estimate's data key, where one was lodged under this key: re-sealed to each officer for the finalise alone.
    const estimateGrants: UnsealPlan["estimateGrants"] = [];
    if (live && i.opening.kind === "MAIN") {
      try {
        const dek = openStoredHpke({ privateKey: k, stored: new Uint8Array(live.estimateDek), aad: estimateDekAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keys.liveKey.id, lodgementId: live.id }) });
        secrets.push(dek);
        for (const o of i.keys.officers) {
          estimateGrants.push({ recordId: live.id, officerKeyId: o.officerKeyId, sealedDek: sealGrant({ officerPublic: o.publicKey, dek, aad: officerGrantAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, openingId: i.opening.id, officerKeyId: o.officerKeyId, subject: "ESTIMATE", recordId: live.id, use: "FINALISE" }) }) });
        }
      } catch (e) {
        if (e instanceof SealError) return { ok: false, faults: [{ fault: "SHARES_MISMATCH" }] };
        throw e;
      }
    }
    return { ok: true, plan: { open, waiting, estimateGrants } };
  } finally {
    zero(...secrets);
  }
}

export interface OpenedFindings { saleFinding: SaleFinding; restrictionFinding: RestrictionFinding; restrictionReading: Prisma.InputJsonValue | null; eligibility: Prisma.InputJsonValue | null }

export interface OpenedRecord { openedBidId: string; onlineBidId: string; listingNo: number; sequence: number; kind: "BID" | "ALTERNATIVE"; partyName: string; alternativeStatus: AlternativeConsideration | null; parentListingNo: number | null; findings: OpenedFindings }

/**
 * Writes what the last authorisation decided, in the order the triggers need (security audit 2): the caller has set `Opening.unsealedAt` in this transaction first, so a submission may move to
 * OPENED (PA022); the offer is created with its price NULL (PA021); the submission moves, and only then its envelope (it follows its submission). A parent is opened before its alternatives.
 */
export async function commitUnseal(
  tx: Tx,
  i: { organisationId: string; exerciseId: string; openingId: string; plan: UnsealPlan; now: Date; existingListingNos: readonly number[]; alternativesPermitted: boolean | null; findingsFor: (partyId: string) => Promise<OpenedFindings> },
): Promise<OpenedRecord[]> {
  const out: OpenedRecord[] = [];
  const nos = [...i.existingListingNos];
  const openedOf = new Map<string, { id: string; listingNo: number }>();
  for (const b of i.plan.open) {
    const findings = await i.findingsFor(b.partyId);
    const listingNo = nextListingNo(nos);
    nos.push(listingNo);
    const isAlternative = b.kind === "ALTERNATIVE";
    const alternativeStatus = alternativeOf(isAlternative, i.alternativesPermitted);
    const parent = b.parentOnlineBidId ? (openedOf.get(b.parentOnlineBidId) ?? null) : null;
    const created = await tx.openedBid.create({
      data: {
        organisationId: i.organisationId, exerciseId: i.exerciseId, openingId: i.openingId, envelopeId: b.envelopeId, listingNo, partyId: b.partyId, openedAt: i.now,
        bidderNameAsRead: b.partyName, registrationClassAsRead: "", registrationStatusAsRead: "",
        // Ruling 20: not read until the finalise; the database allows it only on an online envelope, before the opening is finalised.
        priceAsRead: null, completionPeriod: null, completionUnit: null, validityDaysStated: null,
        isAlternative, parentOpenedBidId: parent?.id ?? null, alternativeStatus,
        saleFinding: findings.saleFinding, restrictionFinding: findings.restrictionFinding,
        ...(findings.restrictionReading ? { restrictionReading: findings.restrictionReading } : {}),
        ...(findings.eligibility ? { eligibilityFinding: findings.eligibility } : {}),
      },
      select: { id: true },
    });
    openedOf.set(b.onlineBidId, { id: created.id, listingNo });
    await tx.onlineBid.update({ where: { id: b.onlineBidId, organisationId: i.organisationId }, data: { status: "OPENED", statusAt: i.now } });
    await tx.bidEnvelope.update({ where: { id: b.envelopeId, organisationId: i.organisationId }, data: { status: "OPENED", partyId: b.partyId } });
    if (b.grants.length) {
      await tx.officerDekGrant.createMany({
        data: b.grants.map((g) => ({ organisationId: i.organisationId, openingId: i.openingId, officerKeyId: g.officerKeyId, subject: g.subject, recordId: g.recordId, use: g.use, sealedDek: g.sealedDek as Uint8Array<ArrayBuffer>, createdAt: i.now })),
      });
    }
    out.push({ openedBidId: created.id, onlineBidId: b.onlineBidId, listingNo, sequence: b.sequence, kind: b.kind, partyName: b.partyName, alternativeStatus, parentListingNo: parent?.listingNo ?? null, findings });
  }
  if (i.plan.estimateGrants.length) {
    await tx.officerDekGrant.createMany({
      data: i.plan.estimateGrants.map((g) => ({ organisationId: i.organisationId, openingId: i.openingId, officerKeyId: g.officerKeyId, subject: "ESTIMATE" as const, recordId: g.recordId, use: "FINALISE" as const, sealedDek: g.sealedDek as Uint8Array<ArrayBuffer>, createdAt: i.now })),
    });
  }
  return out;
}

/// A digest for the audit row of the unseal: the roll the bids were opened against, never any bid's content.
export const rollDigestOf = (roll: unknown): string | null => {
  const r = roll as { rollDigest?: unknown } | null;
  return typeof r?.rollDigest === "string" ? r.rollDigest : r ? createHash("sha256").update(JSON.stringify(r)).digest("hex") : null;
};
