import type { AwardStatus } from "@/lib/award/types";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE } from "@/lib/award/labels";
import { MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from "@/lib/committee/labels";
import { CONTRACT_STATUS_WORDS } from "@/lib/contract/labels";
import type { ContractStatus } from "@/lib/contract/types";
import { formatDate } from "@/lib/format";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_TONE } from "@/lib/method/labels";
import type { ExerciseStatus } from "@/lib/method/types";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/requisition/labels";
import type { RequisitionStatus } from "@/lib/requisition/types";
import { SUPPLIER_STATUS_LABEL, SUPPLIER_STATUS_TONE } from "@/lib/suppliers/labels";
import type { SupplierStatus } from "@/lib/suppliers/types";

import type { HitTone, SearchHit } from "./types";

/**
 * A loaded row as the one line a hit shows (ADR 0044 D3). Pure. A hit holds identifiers and a status label, never a code, a SULIT value,
 * a project's exercise title (AC-18) or a sitting's agenda or matter title (ST-3, FR-MTD-007).
 */

const status = (text: string, tone: string): SearchHit["status"] => ({ text, ...(tone === "neutral" ? {} : { tone: tone as HitTone }) });
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

export interface RequisitionRow { id: string; reference: string; title: string; status: RequisitionStatus; erpRequisitionNo: string | null }
export interface ExerciseRow { id: string; reference: string; title: string; status: ExerciseStatus }
export interface ProjectRow { id: string; reference: string; status: AwardStatus; exerciseId: string; contract: { number: string; status: ContractStatus } | null }
export interface SupplierRow { id: string; reference: string; registeredName: string; status: SupplierStatus }
export interface SittingRow { id: string; reference: string; meetingDate: Date; status: keyof typeof MEETING_STATUS_LABEL; committee: { nameEn: string } }

export const requisitionHit = (r: RequisitionRow, exact: boolean): SearchHit => ({
  entity: "requisition", id: r.id, title: r.title, sub: join(r.reference, r.erpRequisitionNo), href: `/requisitions/${r.id}`, status: status(STATUS_LABEL[r.status], STATUS_TONE[r.status]), exact,
});
export const exerciseHit = (r: ExerciseRow, exact: boolean): SearchHit => ({
  entity: "exercise", id: r.id, title: r.title, sub: r.reference, href: `/sourcing/${r.id}`, status: status(EXERCISE_STATUS_LABEL[r.status], EXERCISE_STATUS_TONE[r.status]), exact,
});
export const projectHit = (r: ProjectRow, exact: boolean): SearchHit => ({
  entity: "project", id: r.id, title: r.contract?.number ?? r.reference, sub: r.contract ? r.reference : "", href: `/projects/${r.id}`,
  status: r.contract ? { text: CONTRACT_STATUS_WORDS[r.contract.status].en } : status(AWARD_STATUS_LABEL[r.status], AWARD_STATUS_TONE[r.status]), exact,
});
export const supplierHit = (r: SupplierRow, exact: boolean): SearchHit => ({
  entity: "supplier", id: r.id, title: r.registeredName, sub: r.reference, href: `/suppliers/${r.id}`, status: status(SUPPLIER_STATUS_LABEL[r.status].en, SUPPLIER_STATUS_TONE[r.status]), exact,
});
/// Reference, committee name, date, status: nothing from the sitting's agenda or matters.
export const sittingHit = (r: SittingRow): SearchHit => ({
  entity: "sitting", id: r.id, title: r.committee.nameEn, sub: join(r.reference, formatDate(r.meetingDate)), href: `/committees/${r.id}`, status: status(MEETING_STATUS_LABEL[r.status], MEETING_STATUS_TONE[r.status]), exact: false,
});
