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

import type { Tx } from "@/lib/audit/record";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";

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
