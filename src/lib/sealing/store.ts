/**
 * The key ceremony's rows (ADR 0036 D3, D4, D11; rulings 20d, 20g, 20p). Every function takes the transaction of the act that calls it, which holds the exercise's lock
 * (`withLockedExerciseScope`). Nothing here asks who the actor is or whether the act is allowed: the pure rules in `ceremony.ts` and `share.ts` do, before these are called.
 *
 * What is written is key material and ciphertext built by `ceremony-seal.ts`. Nothing secret is returned, logged or audited: the audit rows built by the callers name ids,
 * fingerprints and counts only.
 */

import { randomUUID } from "node:crypto";

import type { Tx } from "@/lib/audit/record";

import { keyState } from "./ceremony";
import { makeExerciseKey, type ShareHolder } from "./ceremony-seal";

export interface RosterRow { id: string; personId: string; name: string; seatLabel: string }
export interface LiveOfficerKey { id: string; openingOfficerId: string; personId: string; publicKey: Uint8Array; pepperId: string | null }
export interface LiveExerciseKey { id: string; fingerprint: string; officerCount: number }

export interface CeremonyFacts {
  roster: RosterRow[];
  officerKeys: LiveOfficerKey[];
  liveKey: LiveExerciseKey | null;
  /// Roster rows that hold a live share of the live key, sealed to that row's own live officer key.
  shareHolderRowIds: string[];
  state: ReturnType<typeof keyState>;
  published: boolean;
  /// Every submission of the exercise, of any status. A re-key is refused once one exists.
  submissions: number;
}

/// The ceremony's rows as they stand. Read under the exercise's lock.
export async function loadCeremony(tx: Tx, organisationId: string, exerciseId: string): Promise<CeremonyFacts> {
  const ex = await tx.sourcingExercise.findFirstOrThrow({ where: { id: exerciseId, organisationId }, select: { publishedKeyFingerprint: true } });
  const rows = await tx.exerciseOpeningOfficer.findMany({ where: { exerciseId, organisationId, endedAt: null }, orderBy: [{ namedAt: "asc" }, { id: "asc" }], select: { id: true, personId: true, seatLabelSnapshot: true, person: { select: { name: true } } } });
  const roster = rows.map((r) => ({ id: r.id, personId: r.personId, name: r.person.name, seatLabel: r.seatLabelSnapshot }));
  const officerKeys = await tx.officerExerciseKey.findMany({ where: { exerciseId, organisationId, retiredAt: null }, select: { id: true, openingOfficerId: true, personId: true, publicKey: true, pepperId: true } });
  const liveKey = await tx.exerciseSealingKey.findFirst({ where: { exerciseId, organisationId, retiredAt: null }, select: { id: true, fingerprint: true, officerCount: true } });
  const shares = liveKey ? await tx.exerciseKeyShare.findMany({ where: { keyId: liveKey.id, organisationId, sealedShare: { not: null } }, select: { openingOfficerId: true, officerKeyId: true } }) : [];
  const keyOf = new Map(officerKeys.map((k) => [k.openingOfficerId, k.id]));
  const shareHolderRowIds = shares.filter((s) => keyOf.get(s.openingOfficerId) === s.officerKeyId).map((s) => s.openingOfficerId);
  const rosterIds = roster.map((r) => r.id);
  const state = keyState({ liveOfficerRowIds: rosterIds, officersWithKey: rosterIds.filter((id) => keyOf.has(id)), liveKey: liveKey ? { shareHolderRowIds } : null });
  const submissions = await tx.onlineBid.count({ where: { exerciseId, organisationId } });
  return { roster, officerKeys, liveKey, shareHolderRowIds, state, published: ex.publishedKeyFingerprint !== null, submissions };
}

/// A sealed-access event for a granted ceremony act. The row holds ids only.
export async function logCeremonyEvent(tx: Tx, i: { organisationId: string; exerciseId: string; kind: "SHARE_SET" | "KEY_CREATED" | "KEY_RETIRED"; staffPersonId: string; recordId: string; reasonCode?: string; at: Date }): Promise<void> {
  await tx.sealedAccessEvent.create({ data: { organisationId: i.organisationId, exerciseId: i.exerciseId, kind: i.kind, outcome: "GRANTED", reasonCode: i.reasonCode ?? "", staffPersonId: i.staffPersonId, recordId: i.recordId, at: i.at } });
}

/// A refused attempt at the ceremony (ADR 0036: every attempt by a signed-in actor leaves a row, a refusal too), outside the refused transaction. Written only where the exercise is
/// the organisation's: naming one that is not leaves nothing. `reasonCode` is the rule that refused, never a secret.
export async function logCeremonyRefusal(client: Pick<Tx, "sourcingExercise" | "sealedAccessEvent">, i: { organisationId: string; exerciseId: string; kind: "SHARE_SET" | "KEY_RETIRED"; staffPersonId: string; reasonCode: string }): Promise<void> {
  const ex = await client.sourcingExercise.findFirst({ where: { id: i.exerciseId, organisationId: i.organisationId }, select: { id: true } });
  if (!ex) return;
  await client.sealedAccessEvent.create({ data: { organisationId: i.organisationId, exerciseId: ex.id, kind: i.kind, outcome: "REFUSED", reasonCode: i.reasonCode, staffPersonId: i.staffPersonId, at: new Date() } });
}

/// Retires an exercise key and shreds every share of it, in the same transaction (rulings 20g, D11). The shares are ended with the reason; their sealed column becomes NULL.
export async function retireExerciseKey(tx: Tx, organisationId: string, keyId: string, reason: string, now: Date): Promise<void> {
  await tx.exerciseSealingKey.update({ where: { id: keyId, organisationId }, data: { retiredAt: now, retiredReason: reason } });
  await tx.exerciseKeyShare.updateMany({ where: { keyId, organisationId, sealedShare: { not: null } }, data: { sealedShare: null, endedAt: now, endedReason: reason } });
}

export async function retireOfficerKey(tx: Tx, organisationId: string, officerKeyId: string, reason: string, now: Date): Promise<void> {
  await tx.officerExerciseKey.update({ where: { id: officerKeyId, organisationId }, data: { retiredAt: now, retiredReason: reason } });
}

/// The draft files uploaded under a key, discarded because the key changed (D11). Returns how many.
export async function discardDraftsUnder(tx: Tx, organisationId: string, exerciseId: string, keyId: string): Promise<number> {
  const r = await tx.onlineBidFile.updateMany({ where: { organisationId, exerciseId, keyId, state: "DRAFT" }, data: { state: "DISCARDED" } });
  return r.count;
}

export interface MadeKey { keyId: string; fingerprint: string; officerCount: number }

/**
 * Makes the exercise key, if it can be made: every live roster row has a live officer key, there are at least two, and no live key exists. Splits it across the rows'
 * officer keys and seals each share to its own. Needs no passphrase, because it uses only public halves. Returns null when it cannot be made (nothing is written).
 * It does not judge publication, the closing or the pin: the caller's rules did (and the database's triggers do again).
 */
export async function makeKeyIfComplete(tx: Tx, organisationId: string, exerciseId: string, now: Date, facts?: CeremonyFacts): Promise<MadeKey | null> {
  const f = facts ?? (await loadCeremony(tx, organisationId, exerciseId));
  if (f.liveKey || f.roster.length < 2 || f.state.missing.length > 0) return null;
  const keyOf = new Map(f.officerKeys.map((k) => [k.openingOfficerId, k]));
  const keyId = randomUUID();
  const holders: ShareHolder[] = f.roster.map((r) => ({ rosterRowId: r.id, officerKeyId: keyOf.get(r.id)!.id, shareId: randomUUID(), officerPublicKey: keyOf.get(r.id)!.publicKey }));
  const made = makeExerciseKey({ organisationId, exerciseId, keyId, holders });
  await tx.exerciseSealingKey.create({ data: { id: keyId, organisationId, exerciseId, publicKey: made.publicKey as Uint8Array<ArrayBuffer>, fingerprint: made.fingerprint, officerCount: made.officerCount, createdAt: now } });
  await tx.exerciseKeyShare.createMany({
    data: made.shares.map((s) => ({ id: s.shareId, organisationId, keyId, openingOfficerId: s.rosterRowId, officerKeyId: s.officerKeyId, sealedShare: s.sealedShare as Uint8Array<ArrayBuffer>, createdAt: now })),
  });
  return { keyId, fingerprint: made.fingerprint, officerCount: made.officerCount };
}

/**
 * A roster change before publication: the live key (if any) no longer matches the officers, so it is retired and its shares shredded in the same transaction (D11), and the
 * officer keys of anyone no longer on the roster are retired. The remaining officers keep their own keys. Where the changed roster is complete again (a removal leaves every
 * remaining officer with a key) the key is made at once, since nobody is left to be the last to set theirs. Returns what changed, for the audit row.
 */
export async function rekeyAfterRosterChange(tx: Tx, organisationId: string, exerciseId: string, reason: string, now: Date, staffPersonId: string): Promise<{ retiredKey: string | null; retiredOfficerKeys: number; made: MadeKey | null }> {
  let facts = await loadCeremony(tx, organisationId, exerciseId);
  let retiredKey: string | null = null;
  if (facts.liveKey) {
    await retireExerciseKey(tx, organisationId, facts.liveKey.id, reason, now);
    retiredKey = facts.liveKey.id;
    await logCeremonyEvent(tx, { organisationId, exerciseId, kind: "KEY_RETIRED", staffPersonId, recordId: facts.liveKey.id, reasonCode: "ROSTER_CHANGED", at: now });
  }
  const onRoster = new Set(facts.roster.map((r) => r.id));
  const orphaned = await tx.officerExerciseKey.findMany({ where: { exerciseId, organisationId, retiredAt: null, openingOfficerId: { notIn: [...onRoster] } }, select: { id: true } });
  for (const k of orphaned) await retireOfficerKey(tx, organisationId, k.id, reason, now);
  facts = await loadCeremony(tx, organisationId, exerciseId);
  const made = await makeKeyIfComplete(tx, organisationId, exerciseId, now, facts);
  if (made) await logCeremonyEvent(tx, { organisationId, exerciseId, kind: "KEY_CREATED", staffPersonId, recordId: made.keyId, at: now });
  return { retiredKey, retiredOfficerKeys: orphaned.length, made };
}

/// The SQLSTATE of a refusal the sealed triggers made (PA0xx), or null. The adapter puts it in different places by version, so the message is read as well.
export function sealedSqlState(e: unknown): string | null {
  const x = e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } }; cause?: { originalCode?: string; code?: string }; message?: string; code?: string };
  const direct = x?.meta?.driverAdapterError?.cause?.originalCode ?? x?.cause?.originalCode ?? x?.cause?.code ?? x?.code;
  if (typeof direct === "string" && /^PA\d{3}$/.test(direct)) return direct;
  const m = /\bPA\d{3}\b/.exec(String(x?.message ?? ""));
  return m ? m[0] : null;
}

/**
 * Changes the exercise key while no submission exists (rulings 20g, 20p). In order, because the triggers read what is already written:
 *  1. the old key is retired and every share of it shredded;
 *  2. the drafts uploaded under it are discarded (their data keys were sealed to it);
 *  3. the new key is made across the officers' current keys;
 *  4. after publication, the append-only `PublishedKeyChange` is written, and only then the published fingerprint is re-frozen.
 * The caller has judged `rekeyFaults`; the closing and the one-live-key rules are the database's again. Returns null when the new key could not be made (an officer lacks a key).
 */
export async function rekeyKey(tx: Tx, i: { organisationId: string; exerciseId: string; reason: string; now: Date; byPersonId: string; /** The officer key whose signed setting caused this change (`setOfficerShare`); absent for `rekeyExercise`, which signs the change row itself. */ viaOfficerKeyId?: string }): Promise<{ from: LiveExerciseKey; made: MadeKey; discarded: number; published: boolean; changeId: string | null } | null> {
  const before = await loadCeremony(tx, i.organisationId, i.exerciseId);
  if (!before.liveKey) return null;
  const old = before.liveKey;
  await retireExerciseKey(tx, i.organisationId, old.id, i.reason, i.now);
  const discarded = await discardDraftsUnder(tx, i.organisationId, i.exerciseId, old.id);
  const made = await makeKeyIfComplete(tx, i.organisationId, i.exerciseId, i.now);
  if (!made) return null;
  let changeId: string | null = null;
  if (before.published) {
    const change = await tx.publishedKeyChange.create({ data: { organisationId: i.organisationId, exerciseId: i.exerciseId, fromKeyId: old.id, toKeyId: made.keyId, fromFingerprint: old.fingerprint, toFingerprint: made.fingerprint, reason: i.reason, ...(i.viaOfficerKeyId ? { viaOfficerKeyId: i.viaOfficerKeyId } : {}), byPersonId: i.byPersonId, at: i.now } });
    changeId = change.id;
    await tx.sourcingExercise.update({ where: { id: i.exerciseId, organisationId: i.organisationId }, data: { publishedKeyFingerprint: made.fingerprint } });
  }
  await logCeremonyEvent(tx, { organisationId: i.organisationId, exerciseId: i.exerciseId, kind: "KEY_RETIRED", staffPersonId: i.byPersonId, recordId: old.id, reasonCode: "REKEYED", at: i.now });
  await logCeremonyEvent(tx, { organisationId: i.organisationId, exerciseId: i.exerciseId, kind: "KEY_CREATED", staffPersonId: i.byPersonId, recordId: made.keyId, at: i.now });
  return { from: old, made, discarded, published: before.published, changeId };
}
