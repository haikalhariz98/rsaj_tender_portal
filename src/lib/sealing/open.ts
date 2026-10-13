/**
 * The one way out of a seal for code outside `src/lib/sealing/` (ADR 0036 D12): `hpkeOpen` and `gcmOpen` are defined here and nowhere else, so a source scan can
 * hold every decryption in the product to this file's two names (build plan step 19).
 *
 * Each throws SealError: TAG for a wrong key or any change to the ciphertext or its AAD, LOW_ORDER for a malformed ephemeral key, LENGTH or FORMAT for a malformed
 * input.
 */

import { gcmOpenWithin } from "./aead";
import { hpkeOpenWithin } from "./hpke";
import type { AadContext, Bytes, GcmSealed, HpkeSealed } from "./types";

export function hpkeOpen(recipientPrivate: Bytes, sealed: HpkeSealed, aad: AadContext): Bytes {
  return hpkeOpenWithin(recipientPrivate, sealed, aad);
}

export function gcmOpen(key: Bytes, sealed: GcmSealed, aad: AadContext): Bytes {
  return gcmOpenWithin(key, sealed, aad);
}
