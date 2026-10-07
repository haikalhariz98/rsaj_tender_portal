import { loadAttributions } from "@/lib/auth/attribution-read";
import { db } from "@/lib/db";
import { prDataOf, prRefusal, type PrSource } from "@/lib/requisition/pr-pdf-data";
import { buildPrPdf } from "@/lib/requisition/pr-pdf";
import { loadLookups, loadRequisition, recordOf } from "@/lib/requisition/repo";
import type { RequisitionStatus } from "@/lib/requisition/types";

export type PrDownload = { ok: true; reference: string; bytes: Uint8Array } | { ok: false; status: 404 | 409; message: string };

/**
 * Load a requisition and build its Expenditure Request Form. Reads only: the requisition, its
 * latest budget check and approval route, the organisation's name, logo and time zone, and the
 * names of its cost centre, account code and contract type.
 */
export async function loadPrPdf(organisationId: string, id: string): Promise<PrDownload> {
  const l = await loadRequisition(organisationId, id);
  if (!l) return { ok: false, status: 404, message: "There is no such requisition." };
  const r = l.req;
  const refusal = prRefusal(r.status as RequisitionStatus, r.approvalInstances.some((i) => i.status === "APPROVED"));
  if (refusal) return { ok: false, status: 409, message: refusal };

  const [{ costCentres, accountCodes, contractTypes }, org, logo] = await Promise.all([
    loadLookups(l.org.id),
    db.organisation.findUnique({ where: { id: l.org.id }, select: { name: true } }),
    db.organisationLogo.findUnique({ where: { organisationId: l.org.id }, select: { bytes: true, mediaType: true } }),
  ]);
  const named = (xs: { code: string; nameEn: string }[], code: string | null) => {
    if (!code) return null;
    const x = xs.find((y) => y.code === code);
    return { code, label: x ? `${code} · ${x.nameEn}` : code };
  };

  const source: PrSource = {
    ...r,
    approvalInstances: r.approvalInstances.map((i) => ({
      status: i.status,
      checkedAgainstMatrix: i.checkedAgainstMatrix,
      steps: i.steps.map((s) => {
        const rec = s.committeeDecision ? recordOf({ ...s.committeeDecision, meeting: s.committeeDecision.meeting }) : null;
        return {
          ...s,
          committee: rec ? { committee: rec.committee, meetingReference: rec.meetingReference, outcome: rec.outcome, date: rec.decisionDate ?? rec.meetingDate, notApprovedName: rec.notApproved?.nameEn ?? null } : null,
        };
      }),
    })),
  };

  const endorsed = await loadAttributions(db, l.org.id, [{ entity: "RequisitionEndorsement", slot: "person", ids: r.endorsements.map((e) => e.id) }]);
  const data = prDataOf(source, {
    organisationName: org?.name ?? "",
    logo: logo && (logo.mediaType === "image/png" || logo.mediaType === "image/jpeg") ? { bytes: new Uint8Array(logo.bytes), type: logo.mediaType === "image/png" ? "png" : "jpeg" } : null,
    timeZone: l.org.timeZone,
    purchaseType: contractTypes.find((c) => c.code === r.contractTypeCode)?.nameEn ?? null,
    costCentre: named(costCentres, r.costCentreCode || null),
    account: named(accountCodes, r.accountCode || null),
    generatedAt: new Date(),
    endorsedActed: (id, name) => endorsed.read({ entity: "RequisitionEndorsement", id, slot: "person" }, name).en,
  });
  return { ok: true, reference: r.reference, bytes: await buildPrPdf(data) };
}
