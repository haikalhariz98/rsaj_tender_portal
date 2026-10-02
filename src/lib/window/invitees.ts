/**
 * The invitee list a name route approves (FR-MTD-008, FR-ADV-002; 6.5 OD-4, ADR 0015).
 *
 * Requesting the name freezes the proposed invitees on the route (`NameRouteInvitee`). The
 * invitation then goes to exactly that list: a party added or removed since — told apart by
 * registration number — means the approved route approved another list. A route approved before
 * the list was recorded (any route from before 6.5) approved no list at all (OD-4 A): invitation
 * is refused until the name is requested again with the list.
 *
 * While a name route is pending or approved, changing the proposed list withdraws it ("Withdrawn
 * on change"): it no longer describes the exercise. Once invited, the list is frozen; the exit is
 * cancellation and a replacement exercise (FR-ADV-016). Pure.
 */

import { invitationFault, latestFirst } from "@/lib/method/approval";
import type { ExerciseStatus } from "@/lib/method/types";

import type { Finding } from "./types";

/// A registration number as compared: trimmed, spaces collapsed, case ignored.
export const regKey = (registrationNo: string) => registrationNo.trim().replace(/\s+/g, " ").toUpperCase();

export type InviteeListFault = "LIST_NOT_RECORDED" | "LIST_CHANGED" | "NO_INVITEES";

/**
 * The proposed list against the list the approved route froze. `approved` null: the route holds
 * no list (approved before lists were recorded).
 */
export function inviteeListFault(approved: readonly { registrationNo: string }[] | null, proposed: readonly { registrationNo: string }[]): Finding<InviteeListFault> | null {
  if (approved == null || approved.length === 0) return { code: "LIST_NOT_RECORDED", level: "block" };
  const a = new Set(approved.map((x) => regKey(x.registrationNo)));
  const p = new Set(proposed.map((x) => regKey(x.registrationNo)));
  const added = [...p].filter((k) => !a.has(k)).length;
  const removed = [...a].filter((k) => !p.has(k)).length;
  if (added || removed) return { code: "LIST_CHANGED", level: "block", data: { added, removed } };
  return null;
}

type NameRoute = { id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED"; openedAt: Date; createdAt?: Date | null; invitees: readonly { registrationNo: string }[] };

/**
 * Whether the invited path may invite this list: the method's name approval approved
 * (`invitationFault`, FR-MTD-008) and its frozen list the proposed one; or, where the method asks
 * no approval of the name, simply a list. Every reason at once.
 */
export function invitedListFaults(
  method: { requiresNameApproval: boolean },
  nameRoutes: readonly NameRoute[],
  proposed: readonly { registrationNo: string }[],
): Finding[] {
  const out: Finding[] = [];
  if (proposed.length === 0) out.push({ code: "NO_INVITEES", level: "block" });
  if (!method.requiresNameApproval) return out;
  const name = invitationFault(method, nameRoutes);
  if (name) return [...out, name];
  const route = latestFirst(nameRoutes)[0]!;
  const list = inviteeListFault(route.invitees, proposed);
  if (list) out.push(list);
  return out;
}

/// The approved name route the letters are issued on, where the method asks for one.
export const approvedNameRoute = <R extends NameRoute>(nameRoutes: readonly R[]): R | null => {
  const latest = latestFirst(nameRoutes)[0];
  return latest?.status === "APPROVED" ? latest : null;
};

export type InviteeEditFault = "LIST_FROZEN" | "EXERCISE_NOT_OPEN" | "DUPLICATE" | "NOT_A_PROPOSED_INVITEE" | "PARTY_HAS_RECORDS" | "NAME_REQUIRED" | "REGISTRATION_REQUIRED" | "NOT_INVITED_PATH";

/**
 * Whether the proposed list may change now: in draft, in preparation, with approval for
 * tendering and approved for tendering (BD-4 extended); never once invited (frozen) or cancelled.
 */
export function inviteeEditFault(status: ExerciseStatus): Finding<InviteeEditFault> | null {
  switch (status) {
    case "DRAFT":
    case "DOCUMENTS_IN_PREPARATION":
    case "PENDING_APPROVAL_FOR_TENDERING":
    case "APPROVED_FOR_TENDERING":
      return null;
    case "ADVERTISED":
    case "INVITED":
    // 6.7: frozen since publication.
    case "OPENING_IN_PROGRESS":
    case "OPENED":
      return { code: "LIST_FROZEN", level: "block" };
    case "CANCELLED":
      return { code: "EXERCISE_NOT_OPEN", level: "block" };
    default: {
      const never: never = status;
      return never;
    }
  }
}

/// The name routes a change of the list withdraws: every one pending or approved.
export const routesWithdrawnByListChange = <R extends { status: string }>(nameRoutes: readonly R[]): R[] => nameRoutes.filter((r) => r.status === "PENDING" || r.status === "APPROVED");

/// Requesting the name needs a list to freeze (ADR 0015): the route approves these contractors.
export const nameListFault = (proposed: readonly unknown[]): Finding<"NAME_NO_INVITEES"> | null => (proposed.length === 0 ? { code: "NAME_NO_INVITEES", level: "block" } : null);
