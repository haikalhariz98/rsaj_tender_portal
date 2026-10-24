import type { AcceptForm } from "@/lib/portal/projects/award-card";

/**
 * The Accept drawer's pure part: what it starts with, what changes when another signatory is chosen, whether it may be sent, and the body it sends. The server judges every rule again; this
 * only keeps an unfinished form from being sent. The identity card number is typed and kept only in the drawer's state.
 */

export interface AcceptValues {
  signatoryId: string;
  capacity: string;
  icNumber: string;
  occupation: string;
  address: string;
  witnessName: string;
  signed: boolean;
  witnessed: boolean;
  stamped: boolean;
}

export type StagedScans = Readonly<Record<string, string>>;

const designationOf = (form: AcceptForm, id: string) => form.signatories.find((s) => s.id === id)?.designation ?? "";

/// The signed-in contact is the default signatory, and the capacity is that contact's designation.
export const startValues = (form: AcceptForm): AcceptValues => ({
  signatoryId: form.defaultSignatoryId,
  capacity: designationOf(form, form.defaultSignatoryId),
  icNumber: "",
  occupation: "",
  address: form.address,
  witnessName: "",
  signed: false,
  witnessed: false,
  stamped: false,
});

/// Another signatory is another capacity: it is filled again from that contact's designation.
export const chooseSignatory = (form: AcceptForm, v: AcceptValues, id: string): AcceptValues => ({ ...v, signatoryId: id, capacity: designationOf(form, id) });

export function canSend(form: AcceptForm, staged: StagedScans, v: AcceptValues, password: string): boolean {
  if (password === "" || !form.scans.every((s) => staged[s.key])) return false;
  if (!form.isIndent) return true;
  return v.signatoryId !== "" && [v.icNumber, v.occupation, v.address, v.capacity, v.witnessName].every((t) => t.trim() !== "") && v.signed && v.witnessed && v.stamped;
}

/// The submit route's body. A Letter of Acceptance has no `page`; an indent sends the chosen contact's id, the five typed fields and the three ticks. The server writes that
/// contact's name (security review M1).
export function submitBody(contractId: string, form: AcceptForm, staged: StagedScans, v: AcceptValues, password: string): Record<string, unknown> {
  const files = Object.fromEntries(form.scans.map((s) => [s.key, staged[s.key]]));
  if (!form.isIndent) return { contractId, files, password };
  return {
    contractId,
    files,
    page: {
      signatoryContactId: v.signatoryId,
      icNumber: v.icNumber.trim(),
      occupation: v.occupation.trim(),
      address: v.address.trim(),
      capacity: v.capacity.trim(),
      witnessName: v.witnessName.trim(),
      contractorSigned: v.signed,
      stampAffixed: v.stamped,
      witnessSigned: v.witnessed,
    },
    password,
  };
}
