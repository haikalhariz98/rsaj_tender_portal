/**
 * Sealing the company estimate's lodged copy (ADR 0036 D10, ruling 20g; wave 3b step 16). Pure: no database, no clock. The lodgement store (`scope/estimate-store.ts`, the one
 * accessor of the figure) hands the figure in and writes the three columns that come out; the finalise (`opening/online-finalise-store.ts`) opens them with the same additional data
 * from `unseal-seal.ts`. The figure is sealed under a fresh one-use data key, and that key is HPKE-sealed to the exercise key's public half, as a bid's declaration is. The lodgement
 * id is the record id in both bindings, so it is made before the row is written.
 */

import { createHash, randomBytes } from "node:crypto";

import { senToDecimalString, type Sen } from "@/lib/money";

import { gcmSeal, packGcm, zero } from "./aead";
import { hpkeSeal, packHpke } from "./hpke";
import type { Bytes } from "./types";
import { estimateAad, estimateDekAad } from "./unseal-seal";

export interface EstimateSealContext { organisationId: string; exerciseId: string; keyId: string; lodgementId: string }

export interface SealedEstimate { sealedEstimate: Bytes; estimateDek: Bytes; cipherSha256: string }

/// The figure as the sealed copy holds it: UTF-8 text of the decimal amount with two places, which `parseEstimateFigure` reads back. The plain bytes are zeroed before this returns.
export function sealEstimateFigure(i: { context: EstimateSealContext; exercisePublicKey: Bytes; figure: Sen }): SealedEstimate {
  const plain = new TextEncoder().encode(senToDecimalString(i.figure));
  const dek = new Uint8Array(randomBytes(32));
  try {
    const sealedEstimate = packGcm(gcmSeal(dek, plain, estimateAad(i.context)));
    return {
      sealedEstimate,
      estimateDek: packHpke(hpkeSeal(i.exercisePublicKey, dek, estimateDekAad(i.context))),
      cipherSha256: createHash("sha256").update(sealedEstimate).digest("hex"),
    };
  } finally {
    zero(plain, dek);
  }
}
