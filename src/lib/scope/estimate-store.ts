/**
 * The one accessor of the company estimate's sealed columns (ADR 0012, OD-1).
 *
 * The application client omits CompanyEstimateVersion.value and .reason from every query
 * (`SEALED_OMIT` in src/lib/db.ts). This file alone sets them back (`omit: { value: false,
 * reason: false }`) and alone writes a version; `sealed.test.ts` scans the source for any
 * other reader. What it returns is `SealedFigures`, which the pure functions in estimate.ts
 * show only once the estimate is DISCLOSED. Nothing in src/app calls `readSealedFigures`
 * before 6.7 discloses an estimate at opening.
 */

import { randomUUID } from "node:crypto";

import type { Tx } from "@/lib/audit/record";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import { sealEstimateFigure } from "@/lib/sealing/estimate-seal";

import { sealFigures, type SealedFigures } from "./estimate";

/// Read one estimate's figures and amendment reasons. The caller decides, through
/// `estimateView`, whether anything of them may be shown: before disclosure, nothing.
export async function readSealedFigures(tx: Tx, estimateId: string): Promise<SealedFigures> {
  const rows = await tx.companyEstimateVersion.findMany({
    where: { estimateId },
    orderBy: { versionNo: "asc" },
    omit: { value: false, reason: false },
  });
  return sealFigures(estimateId, rows.map((r) => ({ versionNo: r.versionNo, value: parseSen(r.value.toString()), reason: r.reason })));
}

/**
 * Write one version. The figure and the reason go in; only the row's id and number come
 * back. Called by the estimate actions inside their locked transaction, after
 * `versionFaults` passed on the locked rows.
 */
export async function writeEstimateVersion(
  tx: Tx,
  v: { organisationId: string; estimateId: string; versionNo: number; value: Sen; reason: string; preparedOn: Date; preparerPersonId: string; bqVersionId: string | null },
): Promise<{ id: string; versionNo: number }> {
  return tx.companyEstimateVersion.create({
    data: {
      organisationId: v.organisationId,
      estimateId: v.estimateId,
      versionNo: v.versionNo,
      value: senToDecimalString(v.value),
      reason: v.versionNo === 1 ? "" : v.reason.trim(),
      preparedOn: v.preparedOn,
      preparerPersonId: v.preparerPersonId,
      bqVersionId: v.bqVersionId,
    },
    select: { id: true, versionNo: true },
  });
}

/**
 * Lodge one version's figure sealed under the exercise's live key (ADR 0036 D10, D11; ruling 20g; wave 3b step 16). This is the one place the figure leaves the version table
 * for the online box, and only as ciphertext: the plain bytes are made, sealed and zeroed inside `sealEstimateFigure`, and only the lodgement's id and the number of copies it
 * superseded come back. Any unsuperseded copy of the exercise is superseded first, with the reason (a re-lodgement of the same version, or a later version), so exactly one stands.
 * Called inside the lodge act's locked transaction, after the faults passed on the locked rows. The database refuses it after the closing (LODGEMENT_CLOSED) and under a key that
 * is not the live one.
 */
export async function writeSealedLodgement(
  tx: Tx,
  i: { organisationId: string; exerciseId: string; estimateId: string; versionNo: number; key: { id: string; publicKey: Uint8Array }; lodgedByPersonId: string; supersededReason: string; now: Date },
): Promise<{ lodgementId: string; versionId: string; superseded: number }> {
  const version = await tx.companyEstimateVersion.findFirstOrThrow({
    where: { estimateId: i.estimateId, versionNo: i.versionNo, organisationId: i.organisationId },
    omit: { value: false, reason: true },
  });
  const lodgementId = randomUUID();
  const sealed = sealEstimateFigure({
    context: { organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.key.id, lodgementId },
    exercisePublicKey: i.key.publicKey,
    figure: parseSen(version.value.toString()),
  });
  const old = await tx.sealedEstimateLodgement.updateMany({
    where: { exerciseId: i.exerciseId, organisationId: i.organisationId, supersededAt: null },
    data: { supersededAt: i.now, supersededReason: i.supersededReason },
  });
  await tx.sealedEstimateLodgement.create({
    data: {
      id: lodgementId,
      organisationId: i.organisationId,
      exerciseId: i.exerciseId,
      keyId: i.key.id,
      estimateVersionId: version.id,
      sealedEstimate: sealed.sealedEstimate as Uint8Array<ArrayBuffer>,
      estimateDek: sealed.estimateDek as Uint8Array<ArrayBuffer>,
      cipherSha256: sealed.cipherSha256,
      lodgedAt: i.now,
      lodgedByPersonId: i.lodgedByPersonId,
    },
  });
  return { lodgementId, versionId: version.id, superseded: old.count };
}
