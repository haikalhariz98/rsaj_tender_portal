/**
 * What an officer is told about an online application before recording the supplier from it.
 *
 * The public form never says whether a registration number is already held (it would tell a stranger
 * who is registered). The officer needs exactly that, so it is worked out here, on the staff side,
 * from what the register holds at the time they look, and never stored: a register that changes
 * changes the answer. Pure: the holder and the count are passed in.
 */

import { SUPPLIER_STATUS_LABEL } from "@/lib/suppliers/labels";
import type { SupplierStatus } from "@/lib/suppliers/types";

export interface NumberHolder {
  reference: string;
  name: string;
  status: SupplierStatus;
}

export type PortalFlag = { code: "NUMBER_ON_REGISTER"; holder: NumberHolder } | { code: "NUMBER_SENT_AGAIN"; others: number };

export interface PortalFlagInput {
  /// The supplier already holding this application's registration number. Null: nobody does.
  holder: NumberHolder | null;
  /// Other online applications still waiting that name the same number.
  othersWaiting: number;
}

export function portalFlags(i: PortalFlagInput): PortalFlag[] {
  return [...(i.holder ? [{ code: "NUMBER_ON_REGISTER" as const, holder: i.holder }] : []), ...(i.othersWaiting > 0 ? [{ code: "NUMBER_SENT_AGAIN" as const, others: i.othersWaiting }] : [])];
}

/// A flag in an officer's words and the tone it is shown in.
export function flagWords(f: PortalFlag): { text: string; tone: "warn" | "err" } {
  if (f.code === "NUMBER_ON_REGISTER") return { text: `This number is already on the register: ${f.holder.name} (${f.holder.reference}), ${SUPPLIER_STATUS_LABEL[f.holder.status].en.toLowerCase()}. It cannot be recorded as a new supplier.`, tone: "err" };
  return { text: f.others === 1 ? "1 other online application is waiting with this number. Check which company holds the certificate before recording one." : `${f.others} other online applications are waiting with this number. Check which company holds the certificate before recording one.`, tone: "warn" };
}

/// Whether a flag stops the supplier being recorded from this application as it stands.
export const blocksRecording = (flags: readonly PortalFlag[]) => flags.some((f) => f.code === "NUMBER_ON_REGISTER");
