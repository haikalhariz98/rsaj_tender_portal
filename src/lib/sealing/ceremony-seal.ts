/**
 * The key ceremony's cryptography, composed (ADR 0036 D3, D4; rulings 20d, 20k). Pure: no database, no clock. The store (`store.ts`) reads and writes the rows; this file
 * builds what goes in them, and nothing else builds an officer key's wrap or an exercise key's shares, so the AAD that step 13's unseal rebuilds is written once here.
 *
 * An officer key is an X25519 pair per roster row, its private half wrapped under the officer's passphrase (AAD: OFFICER_KEY, keyId = the officer key's id, recordId = the
 * roster row). The exercise key is made when every live roster row has an officer key: split n-of-n (`splitKey`), each share HPKE-sealed to one officer key's public half
 * (AAD: SHARE, keyId = the exercise key's id, recordId = the share's id). The private key and every share are zeroed before this returns.
 */

import { packGcm, zero } from "./aead";
import { hpkeSeal, packHpke } from "./hpke";
import { wrapKey } from "./kdf";
import { splitKey } from "./split";
import { fingerprint, generateX25519 } from "./x25519";
import type { AadContext, Bytes } from "./types";

export const officerKeyAad = (i: { organisationId: string; exerciseId: string; officerKeyId: string; rosterRowId: string }): AadContext => ({ purpose: "OFFICER_KEY", organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.officerKeyId, recordId: i.rosterRowId });
export const shareAad = (i: { organisationId: string; exerciseId: string; keyId: string; shareId: string }): AadContext => ({ purpose: "SHARE", organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, recordId: i.shareId });

export interface NewOfficerKey { publicKey: Bytes; wrappedPrivateKey: Bytes; kdfLog2N: number; kdfR: number; kdfP: number; kdfSalt: Bytes; pepperId: string | null }

/// An officer's key pair for one roster row, the private half wrapped under the passphrase (and the pepper, where given). The private half is zeroed.
export async function makeOfficerKey(i: { organisationId: string; exerciseId: string; officerKeyId: string; rosterRowId: string; passphrase: string; pepper: { id: string; key: Bytes } | null }): Promise<NewOfficerKey> {
  const pair = generateX25519();
  try {
    const wrapped = await wrapKey(pair.privateKey, i.passphrase, i.pepper, officerKeyAad(i));
    return { publicKey: pair.publicKey, wrappedPrivateKey: packGcm(wrapped.sealed), kdfLog2N: wrapped.params.log2N, kdfR: wrapped.params.r, kdfP: wrapped.params.p, kdfSalt: wrapped.params.salt, pepperId: wrapped.pepperId };
  } finally {
    zero(pair.privateKey);
  }
}

export interface ShareHolder { rosterRowId: string; officerKeyId: string; shareId: string; officerPublicKey: Bytes }
export interface NewExerciseKey { publicKey: Bytes; fingerprint: string; officerCount: number; shares: { shareId: string; rosterRowId: string; officerKeyId: string; sealedShare: Bytes }[] }

/// The exercise key pair, split across the holders and each share sealed to its holder's officer key. At least two holders (n-of-n needs two). Nothing secret survives the call.
export function makeExerciseKey(i: { organisationId: string; exerciseId: string; keyId: string; holders: readonly ShareHolder[] }): NewExerciseKey {
  const pair = generateX25519();
  const raw = splitKey(pair.privateKey, i.holders.length);
  try {
    const shares = i.holders.map((h, n) => ({
      shareId: h.shareId,
      rosterRowId: h.rosterRowId,
      officerKeyId: h.officerKeyId,
      sealedShare: packHpke(hpkeSeal(h.officerPublicKey, raw[n], shareAad({ organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.keyId, shareId: h.shareId }))),
    }));
    return { publicKey: pair.publicKey, fingerprint: fingerprint(pair.publicKey), officerCount: i.holders.length, shares };
  } finally {
    zero(pair.privateKey, ...raw);
  }
}
