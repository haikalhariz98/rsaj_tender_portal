/**
 * The one accessor of the company estimate's sealed columns (ADR 0012, OD-1).
 *
 * The application client omits CompanyEstimateVersion.value and .reason from every query
 * (`SEALED_OMIT` in src/lib/db.ts). Since ruling 20ch the figure is read only through the
 * database's logged reader, called from this file alone (`readFigure`); the reason is named
 * in an explicit select here. This file alone writes a version; `sealed.test.ts` scans the source for any
 * other reader. What it returns is `SealedFigures`, which the pure functions in estimate.ts
 * show only once the estimate is DISCLOSED. Nothing in src/app calls `readSealedFigures`
 * before 6.7 discloses an estimate at opening.
 */

import { randomUUID } from "node:crypto";

import type { Tx } from "@/lib/audit/record";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import { sealEstimateFigure } from "@/lib/sealing/estimate-seal";

import { sealFigures, type SealedFigures } from "./estimate";

/// Who reads, for the access row: a person (with session and address) or a loader run by label, exactly one (plan golive-n6 3.5).
export type FigureReader = { organisationId: string } & ({ personId: string; sessionId: string | null; sourceAddress: string | null } | { systemLabel: string });

/// The one call of the database's logged reader (ruling 20ch): the figure leaves the version table only through `public.read_company_estimate_figure`, which writes one
/// SulitAccessEvent row in this transaction. Sen from the numeric text through parseSen, never a float.
async function readFigure(tx: Tx, reader: FigureReader, versionId: string): Promise<Sen> {
  const personId = "personId" in reader ? reader.personId : null;
  const systemLabel = "systemLabel" in reader ? reader.systemLabel : null;
  const sessionId = "personId" in reader ? reader.sessionId : null;
  const sourceAddress = "personId" in reader ? reader.sourceAddress : null;
  const rows = await tx.$queryRaw<{ v: string }[]>`SELECT public.read_company_estimate_figure(${reader.organisationId}::text, ${versionId}::text, ${personId}::text, ${systemLabel}::text, ${sessionId}::text, ${sourceAddress}::text)::text AS v`;
  return parseSen(rows[0].v);
}

/// Read one estimate's figures and amendment reasons. The caller decides, through
/// `estimateView`, whether anything of them may be shown: before disclosure, nothing.
/// Each figure is read through the logged reader, one call per version.
export async function readSealedFigures(tx: Tx, estimateId: string, reader: FigureReader): Promise<SealedFigures> {
  const rows = await tx.companyEstimateVersion.findMany({
    where: { estimateId, organisationId: reader.organisationId },
    orderBy: { versionNo: "asc" },
    select: { id: true, versionNo: true, reason: true },
  });
  const versions: { versionNo: number; value: Sen; reason: string }[] = [];
  for (const r of rows) versions.push({ versionNo: r.versionNo, value: await readFigure(tx, reader, r.id), reason: r.reason });
  return sealFigures(estimateId, versions);
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
  i: { organisationId: string; exerciseId: string; estimateId: string; versionNo: number; key: { id: string; publicKey: Uint8Array }; lodgedByPersonId: string; supersededReason: string; now: Date; reader: FigureReader },
): Promise<{ lodgementId: string; versionId: string; superseded: number }> {
  const version = await tx.companyEstimateVersion.findFirstOrThrow({
    where: { estimateId: i.estimateId, versionNo: i.versionNo, organisationId: i.organisationId },
    select: { id: true },
  });
  const figure = await readFigure(tx, i.reader, version.id);
  const lodgementId = randomUUID();
  const sealed = sealEstimateFigure({
    context: { organisationId: i.organisationId, exerciseId: i.exerciseId, keyId: i.key.id, lodgementId },
    exercisePublicKey: i.key.publicKey,
    figure,
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
