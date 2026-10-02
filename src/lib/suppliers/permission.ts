/**
 * Special permission (FR-ADV-017): for one party on one exercise, relaxing one condition (grade or field
 * codes) of one of its registration requirements, only where the exercise's notice offers it. The
 * officer confirms both conditions the spec sets (the party already holds a registration class, and its
 * record is good), and names who grants it: registration bodies outside the organisation (recorded),
 * and/or a route inside it on `special_permission` (rows ship empty; no rule refuses, naming the
 * Approval matrix). A permission that needs the internal route is granted only once the route approves.
 * Pure.
 */

import type { RouteState } from "./blacklist";
import type { Finding } from "./types";

export type PermissionFault =
  | "TIME_ZONE_UNSET"
  | "NOT_OFFERED"
  | "OFFER_NOT_SET"
  | "REQUIREMENT_REQUIRED"
  | "REQUIREMENT_NOT_ON_EXERCISE"
  | "RELAXES_REQUIRED"
  | "PERMISSION_AUTHORITY_REQUIRED"
  | "BODY_NOT_CONFIGURED"
  | "CLASS_NOT_CONFIRMED"
  | "RECORD_NOT_CONFIRMED"
  | "PERMISSION_DUPLICATE"
  | "PERSON_REQUIRED"
  | "ALREADY_GRANTED"
  | "INTERNAL_ROUTE_NOT_APPROVED"
  | "GRANTED_REQUIRED"
  | "GRANTED_IN_FUTURE"
  | "GRANTED_BEFORE_APPROVAL";

export interface PermissionInput {
  requirementId: string | null;
  relaxes: "GRADE" | "FIELD_CODE" | null;
  grantingBodyIds: readonly string[];
  internalApproval: boolean;
  existingClassConfirmed: boolean;
  goodRecordConfirmed: boolean;
  personActive: boolean;
}

/// Asking for (and, with no internal route, granting) a special permission.
export function specialPermissionFaults(i: PermissionInput, ctx: { today: string | null; offered: boolean | null; requirementIds: readonly string[]; bodyIds: readonly string[]; existing: readonly { requirementId: string; relaxes: string }[] }): Finding<PermissionFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<PermissionFault>[] = [];
  if (ctx.offered == null) out.push({ code: "OFFER_NOT_SET", level: "block" });
  else if (!ctx.offered) out.push({ code: "NOT_OFFERED", level: "block" });
  if (!i.requirementId) out.push({ code: "REQUIREMENT_REQUIRED", level: "block" });
  else if (!ctx.requirementIds.includes(i.requirementId)) out.push({ code: "REQUIREMENT_NOT_ON_EXERCISE", level: "block" });
  if (!i.relaxes) out.push({ code: "RELAXES_REQUIRED", level: "block" });
  if (i.grantingBodyIds.length === 0 && !i.internalApproval) out.push({ code: "PERMISSION_AUTHORITY_REQUIRED", level: "block" });
  if (i.grantingBodyIds.some((b) => !ctx.bodyIds.includes(b))) out.push({ code: "BODY_NOT_CONFIGURED", level: "block" });
  if (!i.existingClassConfirmed) out.push({ code: "CLASS_NOT_CONFIRMED", level: "block" });
  if (!i.goodRecordConfirmed) out.push({ code: "RECORD_NOT_CONFIRMED", level: "block" });
  if (i.requirementId && i.relaxes && ctx.existing.some((e) => e.requirementId === i.requirementId && e.relaxes === i.relaxes)) out.push({ code: "PERMISSION_DUPLICATE", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/// Granting one that waited for its internal route: the route approved, on a day no earlier than its approval, not after today.
export function grantFaults(i: { grantedOn: string | null; personActive: boolean }, ctx: { today: string | null; offered: boolean | null; granted: boolean; internalApproval: boolean; route: RouteState; approvedOn: string | null }): Finding<PermissionFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<PermissionFault>[] = [];
  if (ctx.granted) out.push({ code: "ALREADY_GRANTED", level: "block" });
  if (ctx.offered !== true) out.push({ code: ctx.offered == null ? "OFFER_NOT_SET" : "NOT_OFFERED", level: "block" });
  if (ctx.internalApproval && ctx.route !== "APPROVED") out.push({ code: "INTERNAL_ROUTE_NOT_APPROVED", level: "block" });
  if (!i.grantedOn) out.push({ code: "GRANTED_REQUIRED", level: "block" });
  else if (i.grantedOn > ctx.today) out.push({ code: "GRANTED_IN_FUTURE", level: "block" });
  else if (ctx.approvedOn && i.grantedOn < ctx.approvedOn) out.push({ code: "GRANTED_BEFORE_APPROVAL", level: "block", data: { approvedOn: ctx.approvedOn } });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}
