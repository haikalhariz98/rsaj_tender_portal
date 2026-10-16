/**
 * A substitution's rows, and the exposure of a share-holder who leaves (ADR 0036 D11, rulings 11, 20bc, 20bk, 20t; build plan step 17). Every function takes the transaction of the act that calls it,
 * which holds the exercise's lock. Nothing here asks who the actor is or whether the act is allowed: the pure rules in `substitution.ts` and `deactivation.ts` do, before these are called.
 *
 * The share is moved, never copied out: the departing officer's own share is opened with their private key (which the caller unwrapped with their passphrase) and sealed again to the incoming
 * officer's public key as a share row of the incoming officer's own. The departing share is then shredded, which the database allows only because a SUBSTITUTION release is written first (PA026, PA014).
 * The release is written and, in the same transaction, marked used and shredded (C-2): the share it carried is the incoming officer's own row from that moment, so nothing outlives the act.
 */

import { randomUUID } from "node:crypto";

import type { Tx } from "@/lib/audit/record";
import { lateBidWaitingOf } from "@/lib/bids/envelope-status";
import { loadLateMatters } from "@/lib/bids/repo";
import { shredExerciseReleases } from "@/lib/opening/unseal-store";

import { zero } from "./aead";
import { shareAad } from "./ceremony-seal";
import { exposuresOf, type HolderExposure } from "./deactivation";
import { hpkeSeal, packHpke } from "./hpke";
import { loadCeremony, retireOfficerKey } from "./store";
import { pendingSubstitution, type DepartedHolder, type PendingSubstitution, type ShareLessOfficer } from "./substitution";
import type { Bytes } from "./types";
import { openStoredHpke, sealRelease, shareReleaseAad } from "./unseal-seal";

/// The substitution waiting on the exercise, with the live key it moves a share of. Read under the exercise's lock.
export async function loadPendingSubstitution(tx: Tx, organisationId: string, exerciseId: string): Promise<{ pending: PendingSubstitution; keyId: string | null }> {
  const facts = await loadCeremony(tx, organisationId, exerciseId);
  if (!facts.liveKey) return { pending: { state: "NONE" }, keyId: null };
  const keyId = facts.liveKey.id;
  const ended = await tx.exerciseOpeningOfficer.findMany({
    where: { exerciseId, organisationId, endedAt: { not: null }, keyShares: { some: { keyId, sealedShare: { not: null }, officerKey: { retiredAt: null } } } },
    orderBy: { endedAt: "asc" },
    select: { id: true, personId: true, person: { select: { name: true } }, keyShares: { where: { keyId, sealedShare: { not: null }, officerKey: { retiredAt: null } }, select: { officerKeyId: true } } },
  });
  const departed: DepartedHolder[] = ended.map((r) => ({ rosterRowId: r.id, officerKeyId: r.keyShares[0].officerKeyId, personId: r.personId, name: r.person.name }));
  const keyed = new Set(facts.officerKeys.map((k) => k.openingOfficerId));
  const held = new Set(facts.shareHolderRowIds);
  const shareless: ShareLessOfficer[] = facts.roster.filter((r) => !held.has(r.id)).map((r) => ({ rosterRowId: r.id, personId: r.personId, name: r.name, hasKey: keyed.has(r.id) }));
  return { pending: pendingSubstitution({ departed, shareless }), keyId };
}

export interface TransferredShare { releaseId: string; newShareId: string; oldShareId: string; incomingOfficerKeyId: string; departingOfficerKeyId: string }

/**
 * Moves the departing officer's share to the incoming officer, in the caller's transaction: the release, the incoming officer's share row, the shred of the departing share, the release marked used and
 * shredded, the departing officer's key retired, and the exercise's outstanding unseal releases shredded (20bc: this act changes who holds the key, and 20bk leaves the transferred share itself alone).
 * The caller zeroes `privateKey`.
 */
export async function transferShare(
  tx: Tx,
  i: { organisationId: string; exerciseId: string; keyId: string; departing: DepartedHolder; incoming: ShareLessOfficer; privateKey: Bytes; byPersonId: string; now: Date },
): Promise<TransferredShare> {
  const old = await tx.exerciseKeyShare.findFirstOrThrow({
    where: { keyId: i.keyId, organisationId: i.organisationId, openingOfficerId: i.departing.rosterRowId, officerKeyId: i.departing.officerKeyId, sealedShare: { not: null } },
    select: { id: true, sealedShare: true },
  });
  const incomingKey = await tx.officerExerciseKey.findFirstOrThrow({ where: { organisationId: i.organisationId, exerciseId: i.exerciseId, openingOfficerId: i.incoming.rosterRowId, retiredAt: null }, select: { id: true, publicKey: true } });
  const incomingPublic = new Uint8Array(incomingKey.publicKey);
  const newShareId = randomUUID();
  const releaseId = randomUUID();
  const share = openStoredHpke({ privateKey: i.privateKey, stored: new Uint8Array(old.sealedShare!), aad: shareAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, shareId: old.id }) });
  try {
    const sealedForIncoming = packHpke(hpkeSeal(incomingPublic, share, shareAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, shareId: newShareId })));
    const sealedRelease = sealRelease({ recipientPublic: incomingPublic, held: [{ shareId: newShareId, share }], aad: shareReleaseAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, releaseId, toOfficerKeyId: incomingKey.id }) });
    // The release first: the database allows the departing share to be shredded only once it exists (PA026, PA014).
    await tx.shareRelease.create({
      data: {
        id: releaseId,
        organisationId: i.organisationId,
        keyId: i.keyId,
        purpose: "SUBSTITUTION",
        substitutionOfficerId: i.incoming.rosterRowId,
        fromOfficerKeyId: i.departing.officerKeyId,
        toOfficerKeyId: incomingKey.id,
        releasedByPersonId: i.byPersonId,
        sealedShares: sealedRelease as Uint8Array<ArrayBuffer>,
        createdAt: i.now,
      },
    });
    await tx.exerciseKeyShare.create({
      data: { id: newShareId, organisationId: i.organisationId, keyId: i.keyId, openingOfficerId: i.incoming.rosterRowId, officerKeyId: incomingKey.id, sealedShare: sealedForIncoming as Uint8Array<ArrayBuffer>, createdAt: i.now },
    });
    await tx.exerciseKeyShare.update({ where: { id: old.id, organisationId: i.organisationId }, data: { sealedShare: null, endedAt: i.now, endedReason: "Released at a substitution" } });
    await tx.shareRelease.update({ where: { id: releaseId, organisationId: i.organisationId }, data: { sealedShares: null, usedAt: i.now } });
  } finally {
    zero(share);
  }
  await retireOfficerKey(tx, i.organisationId, i.departing.officerKeyId, "The officer released their share at a substitution", i.now);
  await shredExerciseReleases(tx, { organisationId: i.organisationId, exerciseId: i.exerciseId, now: i.now });
  return { releaseId, newShareId, oldShareId: old.id, incomingOfficerKeyId: incomingKey.id, departingOfficerKeyId: i.departing.officerKeyId };
}

/**
 * The exercises each named person is a live opening officer of, and what their leaving would leave. One read for any number of people. Only ONLINE exercises that are not cancelled hold a share.
 * `personIds` absent: everybody named.
 */
export async function loadHolderExposures(tx: Tx, organisationId: string, now: Date, personIds?: readonly string[]): Promise<Map<string, HolderExposure[]>> {
  const rows = await tx.exerciseOpeningOfficer.findMany({
    where: { organisationId, endedAt: null, ...(personIds ? { personId: { in: [...personIds] } } : {}), exercise: { submissionChannel: "ONLINE", status: { not: "CANCELLED" } } },
    orderBy: [{ exercise: { reference: "asc" } }],
    // The whole exercise row is read, so the closing is read and never named here (the closing is written and keyed nowhere but its writers: closing-writers.test.ts).
    select: { personId: true, exercise: { include: { openings: { select: { kind: true, unsealedAt: true, finalisedAt: true } } } } },
  });
  const byPerson = new Map<string, ReturnType<typeof exposuresOf>>();
  const waiting = new Map<string, boolean>();
  for (const r of rows) {
    const e = r.exercise;
    if (!waiting.has(e.id)) {
      const late = await tx.bidEnvelope.findMany({ where: { exerciseId: e.id, late: true, kind: { not: "COMPANY_ESTIMATE" } }, select: { id: true, kind: true, late: true, status: true } });
      waiting.set(e.id, late.length > 0 && lateBidWaitingOf(late, await loadLateMatters(e.id, tx)));
    }
    const found = exposuresOf([{ exerciseId: e.id, reference: e.reference, title: e.title, closing: e.closingAt, openings: e.openings.map((o) => ({ kind: o.kind, unsealed: o.unsealedAt !== null, finalised: o.finalisedAt !== null })), lateBidWaiting: waiting.get(e.id) === true }], now);
    if (found.length) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), ...found]);
  }
  return byPerson;
}
