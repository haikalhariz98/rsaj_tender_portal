/**
 * Sealing one online submission's manifest and declaration (ADR 0036 D4, D5; wave 3b step 10). Pure: no database, no clock, nothing written. The submit route reads the rows
 * and writes them; this file builds what goes in them, and nothing else builds the two ciphertexts, so the additional data that step 13's unseal rebuilds is written once here.
 *
 * Each of the two is sealed under its own fresh one-use data key (AES-256-GCM), and that data key is HPKE-sealed to the exercise key's public half. All four ciphertexts bind the
 * organisation, the exercise, the exercise key's id and the submission's id as `recordId`, so one lifted into another submission, exercise or key does not open. The declaration is
 * sealed first, because the manifest carries its digest. The stored form of a body is `iv || ct || tag` (`packGcm`), of a sealed data key `enc || ct` (`packHpke`); a digest is the
 * SHA-256 of the stored form, as the file's is of its stored body.
 */

import { createHash, randomBytes } from "node:crypto";

import type { Declaration, Manifest } from "@/lib/bids/online/types";

import { gcmSeal, packGcm, zero } from "./aead";
import { hpkeSeal, packHpke } from "./hpke";
import type { AadContext, Bytes } from "./types";

export interface BidSealContext { organisationId: string; exerciseId: string; keyId: string; onlineBidId: string }

const aad = (purpose: "MANIFEST_DEK" | "MANIFEST" | "DECLARATION_DEK" | "DECLARATION", c: BidSealContext): AadContext => ({ purpose, organisationId: c.organisationId, exerciseId: c.exerciseId, keyId: c.keyId, recordId: c.onlineBidId });
export const manifestAad = (c: BidSealContext): AadContext => aad("MANIFEST", c);
export const manifestDekAad = (c: BidSealContext): AadContext => aad("MANIFEST_DEK", c);
export const declarationAad = (c: BidSealContext): AadContext => aad("DECLARATION", c);
export const declarationDekAad = (c: BidSealContext): AadContext => aad("DECLARATION_DEK", c);

export interface SealedSubmission {
  sealedManifest: Bytes;
  manifestDek: Bytes;
  manifestCipherSha256: string;
  sealedDeclaration: Bytes;
  declarationDek: Bytes;
  declarationCipherSha256: string;
}

const sha256Hex = (b: Bytes): string => createHash("sha256").update(b).digest("hex");

function sealOne(exercisePublicKey: Bytes, plain: Bytes, bodyAad: AadContext, dekAad: AadContext): { sealed: Bytes; sealedDek: Bytes } {
  const dek = new Uint8Array(randomBytes(32));
  try {
    return { sealed: packGcm(gcmSeal(dek, plain, bodyAad)), sealedDek: packHpke(hpkeSeal(exercisePublicKey, dek, dekAad)) };
  } finally {
    zero(dek);
  }
}

/// `manifest` is the Manifest without its declaration digest, which is filled in here from the sealed declaration. The plain bytes made here are zeroed before this returns.
export function sealSubmission(i: { context: BidSealContext; exercisePublicKey: Bytes; declaration: Declaration; manifest: Omit<Manifest, "declarationCipherSha256"> }): SealedSubmission {
  const c = i.context;
  const declarationPlain = new TextEncoder().encode(JSON.stringify(i.declaration));
  let manifestPlain: Uint8Array | null = null;
  try {
    const declaration = sealOne(i.exercisePublicKey, declarationPlain, declarationAad(c), declarationDekAad(c));
    const declarationCipherSha256 = sha256Hex(declaration.sealed);
    manifestPlain = new TextEncoder().encode(JSON.stringify({ ...i.manifest, declarationCipherSha256 } satisfies Manifest));
    const manifest = sealOne(i.exercisePublicKey, manifestPlain, manifestAad(c), manifestDekAad(c));
    return {
      sealedManifest: manifest.sealed,
      manifestDek: manifest.sealedDek,
      manifestCipherSha256: sha256Hex(manifest.sealed),
      sealedDeclaration: declaration.sealed,
      declarationDek: declaration.sealedDek,
      declarationCipherSha256,
    };
  } finally {
    zero(declarationPlain);
    if (manifestPlain) zero(manifestPlain);
  }
}
