/**
 * When each part of the window may be written (plan §4): the notice's items, the fee and its basis,
 * the events and the channels' publications are prepared from preparation to approval for
 * tendering and frozen once published — after that, a change is an addendum (FR-ADV-014) or a
 * closing change (FR-ADV-015). The registers (sales, attendance, addenda, deliveries) run while the
 * window is published. Pure.
 */

import type { ExerciseStatus, PackKind } from "@/lib/method/types";

import type { Finding, WindowPath } from "./types";

export type EditFault = "NO_TENDER_DOCUMENTS" | "NOT_IN_PREPARATION" | "WINDOW_PUBLISHED" | "EXERCISE_CANCELLED" | "PATH_NOT_SET" | "WINDOW_NOT_PREPARED";

/// Whether the window's prepared parts (items, fee, basis, events) may change now.
export function windowEditFault(status: ExerciseStatus, packKind: PackKind | null): Finding<EditFault> | null {
  if (packKind !== "TENDER" && packKind !== "QUOTATION") return { code: "NO_TENDER_DOCUMENTS", level: "block" };
  switch (status) {
    case "DRAFT":
      return { code: "NOT_IN_PREPARATION", level: "block" };
    case "DOCUMENTS_IN_PREPARATION":
    case "PENDING_APPROVAL_FOR_TENDERING":
    case "APPROVED_FOR_TENDERING":
      return null;
    case "ADVERTISED":
    case "INVITED":
      return { code: "WINDOW_PUBLISHED", level: "block" };
    case "CANCELLED":
      return { code: "EXERCISE_CANCELLED", level: "block" };
    default: {
      const never: never = status;
      return never;
    }
  }
}

export type PublicationFault = "NOT_APPROVED_FOR_TENDERING" | "WINDOW_PUBLISHED" | "PUBLIC_CHANNEL_ON_INVITED" | "CHANNEL_RETIRED" | "CHANNEL_ALREADY_RECORDED" | "PUBLICATION_IN_FUTURE" | "PUBLICATION_BEFORE_APPROVAL" | "PERSON_REQUIRED" | "TIME_ZONE_UNSET";

/**
 * Recording a publication on a channel (FR-ADV-001): on an advertised window approved for
 * tendering and not yet published, once per channel, on a day not after today and not before the
 * approval for tendering, by a named Person (recorded on their behalf, not signed).
 */
export function publicationFault(i: {
  status: ExerciseStatus;
  path: WindowPath | null;
  channel: { retiredOn: string | null } | null;
  alreadyRecorded: boolean;
  publishedOn: string;
  approvedOn: string | null;
  today: string | null;
  personActive: boolean;
}): Finding<PublicationFault>[] {
  const out: Finding<PublicationFault>[] = [];
  const f = (code: PublicationFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (i.status === "ADVERTISED" || i.status === "INVITED") f("WINDOW_PUBLISHED");
  else if (i.status !== "APPROVED_FOR_TENDERING") f("NOT_APPROVED_FOR_TENDERING");
  if (i.path === "INVITED") f("PUBLIC_CHANNEL_ON_INVITED");
  if (!i.channel || (i.channel.retiredOn != null && i.channel.retiredOn <= i.today)) f("CHANNEL_RETIRED");
  if (i.alreadyRecorded) f("CHANNEL_ALREADY_RECORDED");
  if (i.publishedOn > i.today) f("PUBLICATION_IN_FUTURE", { day: i.publishedOn });
  if (i.approvedOn && i.publishedOn < i.approvedOn) f("PUBLICATION_BEFORE_APPROVAL", { day: i.publishedOn, approvedOn: i.approvedOn });
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type RegisterFault = "NOT_PUBLISHED" | "EXERCISE_CANCELLED" | "NOT_INVITED" | "PERSON_REQUIRED";

/// Whether a party may be sold the documents on the invited path: only an invitee whose letter issued (FR-ADV-002).
export function invitedSaleFault(path: WindowPath | null, hasLetter: boolean): Finding<RegisterFault> | null {
  return path === "INVITED" && !hasLetter ? { code: "NOT_INVITED", level: "block" } : null;
}

/// What a window_change route stores when it opens: a refusal means the change is not made, and it
/// may be asked for again (BD-65-7). No customer document says so: ASSUMED, shown as such.
export function windowChangeRejectionSnapshot(at: Date) {
  return {
    rejectionSnapshotAt: at,
    rejectionDestinationId: null,
    rejectionKind: "RETURN_TO_ORIGINATOR" as const,
    rejectionReturnToRoleCode: null,
    rejectionProvenance: "ASSUMED" as const,
  };
}

/// How the trail says who decided where a refused window change goes.
export const CHANGE_REFUSED_DECIDED_BY = "the change is not made, and may be asked for again";
