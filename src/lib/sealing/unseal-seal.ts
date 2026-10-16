/**
 * The unseal's cryptography, composed (ADR 0036 D3, D10; wave 3b step 13, plan section 1.5f). Pure: no database, no clock. The store (`opening/unseal-store.ts`) reads and writes the
 * rows; this file builds and opens what goes in them. It is the one place the additional data of a share release, an officer's grant and the sealed estimate is written, so that
 * steps 14, 15 and 16 rebuild it identically.
 *
 * A non-last authorisation forwards every share the officer holds (their own, and any released to them earlier) to each officer still to act, as one `ShareRelease` sealed to
 * that officer's key. Each share travels with its id, because the last officer receives overlapping sets and `combineShares` XORs: a share counted twice would cancel itself out.
 * `combineHeld` therefore dedupes by id and demands exactly the live key's shares, no more and no fewer, before it combines.
 */

import { unpackGcm, zero } from "./aead";
import { hpkeSeal, packHpke, unpackHpke } from "./hpke";
import { gcmOpen, hpkeOpen } from "./open";
import { combineShares } from "./split";
import { SealError, type AadContext, type Bytes } from "./types";
import { X25519_KEY_BYTES } from "./x25519";

export type GrantSubjectKind = "FILE" | "DECLARATION" | "ESTIMATE";
export type GrantUseKind = "OPENING_CHECK" | "FINALISE";

/// The additional data of a share release: bound to the exercise key, the release and the one officer key it is sealed to. A release lifted to another officer does not open.
export const shareReleaseAad = (i: { organisationId: string; exerciseId: string; keyId: string; releaseId: string; toOfficerKeyId: string }): AadContext => ({
  purpose: "SHARE_RELEASE", organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, recordId: i.releaseId, partKey: i.toOfficerKeyId,
});

/// The additional data of a data key re-sealed to one officer: keyed by the officer's key, bound to the opening, the record the key opens, what it is (a file, a declaration or the
/// estimate) and what it may be used for. The use is inside the binding, so a FINALISE grant cannot be read as an OPENING_CHECK one.
export const officerGrantAad = (i: { organisationId: string; exerciseId: string; openingId: string; officerKeyId: string; subject: GrantSubjectKind; recordId: string; use: GrantUseKind }): AadContext => ({
  purpose: "OFFICER_GRANT", organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.officerKeyId, recordId: i.recordId, partKey: `${i.openingId}.${i.subject}.${i.use}`,
});

/// The company estimate's sealed lodgement (step 16 writes it, step 15 reads it): the data key sealed to the exercise key, and the figure under the data key.
export const estimateDekAad = (i: { organisationId: string; exerciseId: string; keyId: string; lodgementId: string }): AadContext => ({
  purpose: "ESTIMATE_DEK", organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, recordId: i.lodgementId,
});
export const estimateAad = (i: { organisationId: string; exerciseId: string; keyId: string; lodgementId: string }): AadContext => ({
  purpose: "ESTIMATE", organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, recordId: i.lodgementId,
});

/// One share an officer holds, with the id of the `ExerciseKeyShare` it is.
export interface HeldShare { shareId: string; share: Bytes }

const PAYLOAD_VERSION = 1;
const MAX_SHARES = 32;
const MAX_ID_BYTES = 64;

/// The plain payload of a release: version, count, then for each share its id (length-prefixed UTF-8) and its 32 bytes.
export function packHeldShares(held: readonly HeldShare[]): Bytes {
  if (held.length === 0 || held.length > MAX_SHARES) throw new SealError("FORMAT");
  const parts: Buffer[] = [Buffer.from([PAYLOAD_VERSION, held.length])];
  for (const h of held) {
    const id = Buffer.from(h.shareId, "utf8");
    if (id.length === 0 || id.length > MAX_ID_BYTES || h.share.length !== X25519_KEY_BYTES) throw new SealError("FORMAT");
    parts.push(Buffer.from([id.length]), id, Buffer.from(h.share));
  }
  return new Uint8Array(Buffer.concat(parts));
}

export function unpackHeldShares(b: Bytes): HeldShare[] {
  if (b.length < 2 || b[0] !== PAYLOAD_VERSION || b[1] === 0 || b[1] > MAX_SHARES) throw new SealError("FORMAT");
  const out: HeldShare[] = [];
  let at = 2;
  for (let n = 0; n < b[1]; n++) {
    const idLength = b[at];
    if (idLength === undefined || idLength === 0 || idLength > MAX_ID_BYTES || at + 1 + idLength + X25519_KEY_BYTES > b.length) throw new SealError("FORMAT");
    const shareId = Buffer.from(b.slice(at + 1, at + 1 + idLength)).toString("utf8");
    out.push({ shareId, share: b.slice(at + 1 + idLength, at + 1 + idLength + X25519_KEY_BYTES) });
    at += 1 + idLength + X25519_KEY_BYTES;
  }
  if (at !== b.length) throw new SealError("FORMAT");
  return out;
}

/// What a non-last officer stores for one officer still to act: every share held, HPKE-sealed to that officer's key. The plain payload is zeroed.
export function sealRelease(i: { recipientPublic: Bytes; held: readonly HeldShare[]; aad: AadContext }): Bytes {
  const payload = packHeldShares(i.held);
  try {
    return packHpke(hpkeSeal(i.recipientPublic, payload, i.aad));
  } finally {
    zero(payload);
  }
}

/// A release opened with the receiving officer's private key. A wrong key, or a release made for another officer, throws SealError TAG.
export function openRelease(i: { recipientPrivate: Bytes; sealed: Bytes; aad: AadContext }): HeldShare[] {
  const payload = hpkeOpen(i.recipientPrivate, unpackHpke(i.sealed), i.aad);
  try {
    return unpackHeldShares(payload);
  } finally {
    zero(payload);
  }
}

/**
 * The exercise key from the shares gathered: deduped by id, then exactly the live key's shares (`expectedShareIds`) or nothing. A share the key does not have, a share missing, or the same id
 * carried with different bytes, is refused. The result is `combineShares`' own: SHARE_MISMATCH where the recombined key's public half is not the exercise key's.
 */
export function combineHeld(held: readonly HeldShare[], expectedShareIds: readonly string[], expectedPublic: Bytes): { ok: true; k: Bytes } | { ok: false; fault: "SHARE_COUNT" | "SHARE_MISMATCH" } {
  const byId = new Map<string, Bytes>();
  for (const h of held) {
    const seen = byId.get(h.shareId);
    if (seen) {
      if (Buffer.compare(Buffer.from(seen), Buffer.from(h.share)) !== 0) return { ok: false, fault: "SHARE_MISMATCH" };
      continue;
    }
    byId.set(h.shareId, h.share);
  }
  const expected = [...new Set(expectedShareIds)];
  if (expected.length < 2 || byId.size !== expected.length || expected.some((id) => !byId.has(id))) return { ok: false, fault: "SHARE_COUNT" };
  return combineShares(expected.map((id) => byId.get(id)!), expectedPublic);
}

/// A data key re-sealed to one named officer's public key, for an `OfficerDekGrant`.
export const sealGrant = (i: { officerPublic: Bytes; dek: Bytes; aad: AadContext }): Bytes => packHpke(hpkeSeal(i.officerPublic, i.dek, i.aad));

/// A grant opened with the officer's private key (steps 14 and 15).
export const openGrant = (i: { officerPrivate: Bytes; sealed: Bytes; aad: AadContext }): Bytes => hpkeOpen(i.officerPrivate, unpackHpke(i.sealed), i.aad);

/// A stored `enc || ct` opened with a private key (a data key sealed to the exercise key, a share sealed to an officer): the stored form never leaves this module.
export const openStoredHpke = (i: { privateKey: Bytes; stored: Bytes; aad: AadContext }): Bytes => hpkeOpen(i.privateKey, unpackHpke(i.stored), i.aad);

/// A stored `iv || ct || tag` opened with its data key (the manifest).
export const openStoredGcm = (i: { dek: Bytes; stored: Bytes; aad: AadContext }): Bytes => gcmOpen(i.dek, unpackGcm(i.stored), i.aad);

/// An officer's wrapped private key, in the form `unwrapKey` takes.
export const wrappedKeyOf = (k: { kdfLog2N: number; kdfR: number; kdfP: number; kdfSalt: Bytes; pepperId: string | null; wrappedPrivateKey: Bytes }) => ({ params: { log2N: k.kdfLog2N, r: k.kdfR, p: k.kdfP, salt: new Uint8Array(k.kdfSalt) }, pepperId: k.pepperId, sealed: unpackGcm(new Uint8Array(k.wrappedPrivateKey)) });
