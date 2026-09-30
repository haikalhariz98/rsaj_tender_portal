/**
 * The rules a method-selection configuration must keep to, and what an exercise keeps
 * of a draft for its method. Pure; the Reference data actions and the exercise
 * actions call these inside their locked transactions and never restate them.
 */

import type { DeliverableKind, Method } from "./types";

export interface Fault {
  field: string;
  message: string;
}

type MethodFlags = Pick<
  Method,
  | "nameEn"
  | "availableInTender"
  | "availableInQuotation"
  | "availableBelow"
  | "defaultInTender"
  | "defaultInQuotation"
  | "defaultBelow"
  | "requiresProposal"
  | "requiresNameApproval"
  | "requiresDossier"
  | "dossierSeriesKey"
>;

const BANDS = [
  ["defaultInTender", "availableInTender", "in the tender band"],
  ["defaultInQuotation", "availableInQuotation", "in the quotation band"],
  ["defaultBelow", "availableBelow", "below the quotation floor"],
] as const;

/**
 * Why a sourcing method cannot be saved. `others` are the organisation's other methods
 * in force; `seriesKeys` the numbering series configured.
 *
 * - It must be usable in some band, and proposed only where it is usable.
 * - One method proposed per band, or the regime proposes nothing (ruling R-12).
 * - A dossier is numbered from a configured series.
 * - A proposal is reviewed on its way to approval of the name.
 */
export function methodConfigFaults(m: MethodFlags, others: readonly MethodFlags[], seriesKeys: readonly string[]): Fault[] {
  const out: Fault[] = [];
  if (!m.availableInTender && !m.availableInQuotation && !m.availableBelow) out.push({ field: "availableInTender", message: "Choose at least one value band, or the method can never be used." });
  for (const [d, a, band] of BANDS) {
    if (m[d] && !m[a]) out.push({ field: d, message: `A method can be proposed ${band} only where it is available there.` });
    const clash = m[d] ? others.find((o) => o[d]) : null;
    if (clash) out.push({ field: d, message: `${clash.nameEn} is already the method proposed ${band}. Untick it there first.` });
  }
  if (m.requiresDossier && !m.dossierSeriesKey) out.push({ field: "dossierSeriesKey", message: "A method that keeps a justification dossier needs the numbering series its references are issued from." });
  if (m.dossierSeriesKey && !seriesKeys.includes(m.dossierSeriesKey)) out.push({ field: "dossierSeriesKey", message: "No numbering series has that key. Add it under Configuration, Numbering first." });
  if (m.requiresProposal && !m.requiresNameApproval) out.push({ field: "requiresNameApproval", message: "A proposal is reviewed on its way to approval of the name. Tick that the method needs the name approved, or untick the proposal." });
  return out;
}

/// One contract type in force per deliverable, or the deliverable test derives nothing.
export function contractTypeConfigFaults(t: { deliverableKind: DeliverableKind | null }, others: readonly { nameEn: string; deliverableKind: DeliverableKind | null }[]): Fault[] {
  const clash = t.deliverableKind ? others.find((o) => o.deliverableKind === t.deliverableKind) : null;
  return clash ? [{ field: "deliverableKind", message: `${clash.nameEn} is already the default for this deliverable.` }] : [];
}

/**
 * The mixed-scope threshold as typed: empty is not set (ruling R-11); otherwise a share
 * strictly between 0 and 100 percent, to four places. Which share is the customer's
 * policy, so the product bounds only what a share can be.
 */
export function dominanceShareFault(raw: string): { value: string | null; fault: Fault | null } {
  const v = raw.trim();
  if (!v) return { value: null, fault: null };
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(v) || Number(v) <= 0 || Number(v) >= 100) {
    return { value: null, fault: { field: "dominanceSharePct", message: "A share above 0 and below 100 percent, to at most four decimal places." } };
  }
  return { value: v, fault: null };
}

/**
 * The name-approval routes a draft's edit withdraws (build decision BD-5): an open or
 * approved route approved a different exercise once the method or value changes.
 */
export function nameRoutesToWithdraw<T extends { id: string; status: string }>(instances: readonly T[], change: { methodChanged: boolean; valueChanged: boolean }): { routes: T[]; reason: string | null } {
  if (!change.methodChanged && !change.valueChanged) return { routes: [], reason: null };
  return {
    routes: instances.filter((i) => i.status === "PENDING" || i.status === "APPROVED"),
    reason: change.methodChanged ? "The method changed after the name was sent for approval." : "The value changed after the name was sent for approval.",
  };
}

/**
 * What an exercise keeps of a draft for its method: the fields the method asks for,
 * and nothing it does not. The reason for a method is kept only for an override.
 */
export function keptForMethod(
  m: Pick<Method, "requiresFreshSourcing" | "requiresJustification" | "requiresDossier" | "requiresCoordinationRecord"> | null,
  d: {
    methodCode: string | null;
    proposedCode: string | null;
    methodReason: string;
    parentContractRef: string | null;
    justificationReasonCode: string | null;
    justificationText: string;
    evidenceNote: string;
    emergencyTrigger: string;
    coordinationMeetingOn: string | null;
    coordinationAttendees: string;
    coordinationScopeNote: string;
    bqReference: string | null;
  },
) {
  const coordination = !!m?.requiresCoordinationRecord;
  return {
    methodReason: d.proposedCode === d.methodCode ? "" : d.methodReason,
    parentContractRef: m && !m.requiresFreshSourcing ? d.parentContractRef : null,
    justificationReasonCode: m?.requiresDossier ? d.justificationReasonCode : null,
    justificationText: m?.requiresJustification || m?.requiresDossier ? d.justificationText : "",
    evidenceNote: m?.requiresDossier ? d.evidenceNote : "",
    emergencyTrigger: coordination ? d.emergencyTrigger : "",
    coordinationMeetingOn: coordination ? d.coordinationMeetingOn : null,
    coordinationAttendees: coordination ? d.coordinationAttendees : "",
    coordinationScopeNote: coordination ? d.coordinationScopeNote : "",
    bqReference: coordination ? d.bqReference : null,
  };
}
