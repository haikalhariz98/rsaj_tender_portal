/**
 * A supplier's statutory documents (FR-VND-002, 004, 008): lodged as configured document types (no
 * enum, no literal names), each with its reference, issuing authority, values, validity and expiry,
 * verified by a named officer, and renewed as a chain.
 *
 * What a document *is* on a day is derived, never stored (FR-VND-002's valid / not applicable /
 * missing): the document in force of a type on a day is the newest one in its chain that an officer
 * has verified and whose validity has started by that day (6.15a fix M-3). A renewal lodged but not
 * verified leaves the old one in force (FR-VND-008: a renewal does not take effect until re-approved),
 * and so does a verified renewal whose validity starts later: it is carried alongside as `upcoming`
 * and shown. So an old certificate that has expired under an unverified renewal, or under a verified
 * one not yet started, reads EXPIRED, and the lapse rule handles it. With nothing verified started yet,
 * the newest verified reads NOT_YET_VALID. A document not in order is never in force. Pure: the day is
 * passed in.
 */

import { isDay } from "@/lib/dates";

import type { DocumentFacts, DocumentTypeFacts, Finding, RegistrationValueKind, VerificationState } from "./types";

/// What a type of document is for a supplier on a day.
export type DocumentState =
  | "VALID"
  | "NOT_APPLICABLE"
  | "NOT_YET_VALID"
  | "EXPIRED"
  /// Lodged, and nobody has checked it yet.
  | "NOT_CHECKED"
  /// Lodged, and found not in order; nothing else effective.
  | "NOT_IN_ORDER"
  | "MISSING";

/// The documents of one type for one supplier, newest first by the chain (a renewal after what it renews), then by lodging.
export function chainOrder(docs: readonly DocumentFacts[]): DocumentFacts[] {
  const depth = (d: DocumentFacts): number => {
    let n = 0;
    let at: DocumentFacts | undefined = d;
    const seen = new Set<string>();
    while (at?.supersedesId && !seen.has(at.id)) {
      seen.add(at.id);
      n++;
      at = docs.find((x) => x.id === at!.supersedesId);
    }
    return n;
  };
  return [...docs].sort((a, b) => depth(b) - depth(a) || b.lodgedOn.localeCompare(a.lodgedOn) || b.id.localeCompare(a.id));
}

/// The newest verified document of a type, whatever its validity. A renewal waiting for verification, or one not in order, is never it.
export function effectiveDocument(chain: readonly DocumentFacts[]): DocumentFacts | null {
  return chainOrder(chain).find((d) => d.verification === "VERIFIED") ?? null;
}

/// Whether a document's validity has started on a day (no "valid from" recorded: from when it was issued, so started).
const started = (d: DocumentFacts, on: string) => d.validFrom == null || d.validFrom <= on;

/**
 * The document in force for a type on `on` (fix M-3): the newest verified one whose validity has started.
 * None started: the newest verified one (it then reads NOT_YET_VALID). Never one waiting for its check.
 */
export function documentInForce(chain: readonly DocumentFacts[], on: string): DocumentFacts | null {
  const verified = chainOrder(chain).filter((d) => d.verification === "VERIFIED");
  return verified.find((d) => started(d, on)) ?? verified[0] ?? null;
}

export interface TypeStanding {
  state: DocumentState;
  /// The document the state is read from, where there is one.
  effective: DocumentFacts | null;
  /// A newer lodgement waiting for verification (a renewal not yet in effect), where there is one.
  pending: DocumentFacts | null;
  /// A newer renewal verified but not yet started on the day (fix M-3): it takes over on its "valid from".
  upcoming: DocumentFacts | null;
}

/**
 * A type's state on `on`: the effective document's (valid, not applicable, not yet valid, expired on the
 * day after its expiry), or, with none effective, whether anything is lodged and how it was found.
 */
export function documentState(chain: readonly DocumentFacts[], on: string): TypeStanding {
  const ordered = chainOrder(chain);
  const effective = documentInForce(ordered, on);
  const newer = effective ? ordered.slice(0, ordered.indexOf(effective)) : ordered;
  const pending = newer.find((d) => d.verification === "NOT_CHECKED") ?? null;
  const upcoming = newer.find((d) => d.verification === "VERIFIED" && !started(d, on)) ?? null;
  if (!effective) {
    if (ordered.length === 0) return { state: "MISSING", effective: null, pending: null, upcoming: null };
    return { state: pending ? "NOT_CHECKED" : "NOT_IN_ORDER", effective: null, pending, upcoming: null };
  }
  if (effective.notApplicable) return { state: "NOT_APPLICABLE", effective, pending, upcoming };
  if (!started(effective, on)) return { state: "NOT_YET_VALID", effective, pending, upcoming };
  // The expiry day itself is still valid; the day after is not.
  if (effective.expiresOn && effective.expiresOn < on) return { state: "EXPIRED", effective, pending, upcoming };
  return { state: "VALID", effective, pending, upcoming };
}

/// Every configured type a supplier holds or must hold, with its state on `on`: mandatory types first, a missing mandatory type as MISSING.
export function documentStates(types: readonly DocumentTypeFacts[], docs: readonly DocumentFacts[], on: string): (TypeStanding & { type: DocumentTypeFacts; mandatory: boolean })[] {
  const held = new Set(docs.map((d) => d.typeId));
  return types
    .filter((t) => held.has(t.id) || (t.mandatoryAtRegistration === true && (t.retiredOn == null || t.retiredOn > on)))
    .map((t) => ({ type: t, mandatory: t.mandatoryAtRegistration === true, ...documentState(docs.filter((d) => d.typeId === t.id), on) }))
    .sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
}

/// What a state reads as for a decision: only VALID and NOT_APPLICABLE stand.
export const stands = (s: DocumentState) => s === "VALID" || s === "NOT_APPLICABLE";

// ------------------------------------------------------------------ lodging and renewing

export type LodgeFault =
  | "TIME_ZONE_UNSET"
  | "TYPE_NOT_CONFIGURED"
  | "TYPE_RETIRED"
  | "ALREADY_LODGED"
  | "REFERENCE_REQUIRED"
  | "AUTHORITY_REQUIRED"
  | "EXPIRES_NOT_SET"
  | "EXPIRY_REQUIRED"
  | "EXPIRY_NOT_TAKEN"
  | "NOT_APPLICABLE_NOT_SET"
  | "NOT_APPLICABLE_NOT_ALLOWED"
  | "NOT_APPLICABLE_WITH_DETAILS"
  | "DAY_NOT_VALID"
  | "ISSUED_IN_FUTURE"
  | "VALID_FROM_AFTER_EXPIRY"
  | "VALUE_NOT_OF_TYPE"
  | "VALUE_RETIRED"
  | "VALUES_NOT_TAKEN"
  | "RENEWS_NOTHING"
  | "RENEWS_SUPERSEDED"
  | "RENEWS_ANOTHER_TYPE"
  | "RENEWAL_NOT_LATER"
  | "SUPPLIER_CLOSED";

export interface LodgeInput {
  typeId: string;
  reference: string;
  issuingAuthority: string;
  issuedOn: string | null;
  validFrom: string | null;
  expiresOn: string | null;
  notApplicable: boolean;
  /// The registration values recorded on it, as configured.
  values: readonly { id: string; bodyId: string; kind: RegistrationValueKind; retiredOn: string | null }[];
}

/**
 * A document lodged (or a renewal lodged over `renews`). The type must be configured and live; its
 * switches must be set where they are read (whether it expires, whether "not applicable" is allowed);
 * its values must be of its body and its kinds. A supplier holds one chain per type: a second lodgement
 * of a type is a renewal of the chain's head, which must end later than what it renews.
 */
export function lodgeFaults(i: LodgeInput, ctx: { today: string | null; type: DocumentTypeFacts | null; chain: readonly DocumentFacts[]; renews: DocumentFacts | null; renewing: boolean; supplierRejected: boolean }): Finding<LodgeFault>[] {
  const out: Finding<LodgeFault>[] = [];
  const add = (code: LodgeFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (ctx.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (ctx.supplierRejected) add("SUPPLIER_CLOSED");
  const t = ctx.type;
  if (!t) return [...out, { code: "TYPE_NOT_CONFIGURED", level: "block" }];
  if (t.retiredOn != null && t.retiredOn <= ctx.today) add("TYPE_RETIRED", { type: t.label });
  if (ctx.renewing) {
    if (!ctx.renews) add("RENEWS_NOTHING");
    else {
      if (ctx.renews.typeId !== t.id) add("RENEWS_ANOTHER_TYPE");
      if (ctx.chain.some((d) => d.supersedesId === ctx.renews!.id)) add("RENEWS_SUPERSEDED");
    }
  } else if (ctx.chain.length > 0) add("ALREADY_LODGED", { type: t.label });
  if (i.notApplicable) {
    if (t.notApplicableAllowed == null) add("NOT_APPLICABLE_NOT_SET", { type: t.label });
    else if (!t.notApplicableAllowed) add("NOT_APPLICABLE_NOT_ALLOWED", { type: t.label });
    if (i.reference.trim() || i.expiresOn || i.validFrom || i.issuedOn || i.values.length) add("NOT_APPLICABLE_WITH_DETAILS");
    return out;
  }
  if (!i.reference.trim()) add("REFERENCE_REQUIRED");
  if (!i.issuingAuthority.trim()) add("AUTHORITY_REQUIRED");
  for (const d of [i.issuedOn, i.validFrom, i.expiresOn]) if (d != null && !isDay(d)) add("DAY_NOT_VALID");
  if (t.expires == null) add("EXPIRES_NOT_SET", { type: t.label });
  else if (t.expires && !i.expiresOn) add("EXPIRY_REQUIRED");
  else if (!t.expires && i.expiresOn) add("EXPIRY_NOT_TAKEN", { type: t.label });
  if (i.issuedOn && i.issuedOn > ctx.today) add("ISSUED_IN_FUTURE");
  if (i.validFrom && i.expiresOn && i.validFrom > i.expiresOn) add("VALID_FROM_AFTER_EXPIRY");
  if (i.values.length && t.valueKinds.length === 0) add("VALUES_NOT_TAKEN", { type: t.label });
  else
    for (const v of i.values) {
      if (v.bodyId !== t.bodyId || !t.valueKinds.includes(v.kind)) add("VALUE_NOT_OF_TYPE", { type: t.label });
      else if (v.retiredOn != null && v.retiredOn <= ctx.today) add("VALUE_RETIRED");
    }
  // A correction of one found not in order (or not yet checked) may keep its expiry; a renewal of one in force ends later.
  if (ctx.renewing && ctx.renews?.verification === "VERIFIED" && ctx.renews.expiresOn && i.expiresOn && i.expiresOn <= ctx.renews.expiresOn) add("RENEWAL_NOT_LATER", { expiresOn: ctx.renews.expiresOn });
  return [...new Map(out.map((f) => [f.code, f])).values()];
}

// ------------------------------------------------------------------ verification (FR-VND-004)

export type VerifyFault = "TIME_ZONE_UNSET" | "ALREADY_CHECKED" | "STATE_REQUIRED" | "PERSON_REQUIRED" | "DAY_REQUIRED" | "IN_FUTURE" | "BEFORE_LODGED" | "NOTE_REQUIRED" | "SCAN_REQUIRED";

/**
 * An officer's check of one lodged document: verified, or not in order (with why), by a named active
 * Person on a day between the lodging and today. Recorded on their behalf, not signed. A checked
 * document is not checked again: a corrected one is lodged as a renewal. Verified needs the scan it
 * was verified on attached (the store keeps it: a verified document stands on it); a document lodged
 * as not applicable has nothing to scan.
 */
export function verifyFaults(i: { state: VerificationState | null; personActive: boolean; verifiedOn: string | null; note: string }, doc: Pick<DocumentFacts, "verification" | "lodgedOn" | "notApplicable"> & { scanned: boolean }, today: string | null): Finding<VerifyFault>[] {
  if (today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<VerifyFault>[] = [];
  if (doc.verification !== "NOT_CHECKED") out.push({ code: "ALREADY_CHECKED", level: "block" });
  if (i.state !== "VERIFIED" && i.state !== "NOT_IN_ORDER") out.push({ code: "STATE_REQUIRED", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  if (!i.verifiedOn || !isDay(i.verifiedOn)) out.push({ code: "DAY_REQUIRED", level: "block" });
  else if (i.verifiedOn > today) out.push({ code: "IN_FUTURE", level: "block" });
  else if (i.verifiedOn < doc.lodgedOn) out.push({ code: "BEFORE_LODGED", level: "block", data: { lodgedOn: doc.lodgedOn } });
  if (i.state === "NOT_IN_ORDER" && !i.note.trim()) out.push({ code: "NOTE_REQUIRED", level: "block" });
  if (i.state === "VERIFIED" && !doc.notApplicable && !doc.scanned) out.push({ code: "SCAN_REQUIRED", level: "block" });
  return out;
}

/// How many of a supplier's types stand in each state on the day (the register's summary chip).
export function stateCounts(rows: readonly { state: DocumentState }[]): Partial<Record<DocumentState, number>> {
  const out: Partial<Record<DocumentState, number>> = {};
  for (const r of rows) out[r.state] = (out[r.state] ?? 0) + 1;
  return out;
}
