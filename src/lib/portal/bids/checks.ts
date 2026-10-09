/**
 * The pre-sale checks a supplier sees before it asks for the tender documents, and what a request does with them (FR-VND-012, FR-ADV-010, Phase 4d). Pure.
 *
 * FR-ADV-010: before the documents are issued the system checks that the purchaser's representative holds proof of authority; that, for a restricted tender, the original or a certified true copy of the
 * status certificate has been shown; and that the status is valid, the registration has not been cancelled and the supplier is not suspended. The officer sights papers at the counter, so the first two are
 * shown as things to bring, never as passed. The register's reading (registered, not cancelled, not suspended, not blacklisted) is the same one `recordSale` uses (`saleStandingCheck`), and the attendance rule is
 * `attendanceFaults`: a mandatory event the supplier did not attend, or one not yet held, stops a purchase. A request that the checks stop is kept as a refused attempt with the reason (FR-ADV-010: "refused with the
 * reason recorded"). A request that passes starts nothing by itself: an officer records the sale, and online payment is not built (INT-10).
 */

import { attendanceFaults } from "@/lib/window/events";
import type { WindowPhase } from "@/lib/window/phase";
import { STANDING_LABEL } from "@/lib/suppliers/labels";
import type { SaleCheck } from "@/lib/suppliers/sale";
import type { Standing } from "@/lib/suppliers/standing";
import type { EventFacts, WindowPath } from "@/lib/window/types";

import type { BidFinding } from "./types";

export type CheckKey = "ON_SALE" | "INVITED" | "REGISTER" | "ATTENDANCE" | "RESTRICTION" | "AUTHORITY" | "ALREADY";
/// PASS: made and clear. BLOCK: stops the request. BRING: sighted by an officer at the counter, so it is never passed here. INFO: nothing to do.
export type CheckState = "PASS" | "BLOCK" | "BRING" | "INFO";

export interface PreSaleCheck {
  key: CheckKey;
  state: CheckState;
  /// In words, as the supplier reads it. Never a code.
  detail: string;
}

export interface PreSaleInput {
  phase: WindowPhase;
  path: WindowPath | null;
  /// On the invited path: the supplier is linked to an invitee whose letter was issued.
  invited: boolean;
  /// The register's reading of this supplier (`saleStandingCheck`), judged now.
  register: SaleCheck;
  restrictedTender: boolean | null;
  /// The organisation's own words for the restriction on bidders, or null where none is set.
  restrictionLabel: string | null;
  events: readonly EventFacts[];
  /// Whether mandatory attendance is permitted for this window (what it was published under).
  permitted: boolean | null;
  /// The supplier's linked party on this exercise, where the office has one (it carries the attendance register).
  partyId: string | null;
  /// A live sale to the supplier exists.
  alreadyBought: boolean;
}

const KIND = { BRIEFING: "briefing", SITE_VISIT: "site visit" } as const;

function onSale(phase: WindowPhase): PreSaleCheck {
  switch (phase) {
    case "OPEN_FOR_PURCHASE":
      return { key: "ON_SALE", state: "PASS", detail: "The documents are on sale now." };
    case "PUBLISHED":
      return { key: "ON_SALE", state: "BLOCK", detail: "The sale of the documents has not started yet." };
    case "CLOSED_FOR_PURCHASE":
      return { key: "ON_SALE", state: "BLOCK", detail: "The last day of the sale has passed." };
    case "CLOSED":
      return { key: "ON_SALE", state: "BLOCK", detail: "The closing has passed, so the documents are no longer sold." };
    case "CANCELLED":
      return { key: "ON_SALE", state: "BLOCK", detail: "This exercise was cancelled." };
    case "NOT_PUBLISHED":
      return { key: "ON_SALE", state: "BLOCK", detail: "This exercise has not been published." };
    case "UNKNOWN":
      return { key: "ON_SALE", state: "BLOCK", detail: "The dates of the sale are not complete, so nothing can be asked for yet. Tell the procurement office." };
    default: {
      const never: never = phase;
      return never;
    }
  }
}

function register(r: SaleCheck): PreSaleCheck {
  const block = r.findings.find((f) => f.level === "block");
  if (block) {
    if (block.code === "SALE_NOT_REGISTERED") return { key: "REGISTER", state: "BLOCK", detail: "Your company is not on the supplier register yet, so the documents cannot be sold to it. Finish your registration under Company." };
    if (block.code === "BARRED") {
      const standing = String(block.data?.standing ?? "") as Standing;
      const label = STANDING_LABEL[standing]?.en.toLowerCase();
      return { key: "REGISTER", state: "BLOCK", detail: `Your company is ${label ?? "barred"} on the supplier register, so the documents cannot be sold to it. Ask the procurement office.` };
    }
    return { key: "REGISTER", state: "BLOCK", detail: "The supplier register does not allow the documents to be sold to your company. Ask the procurement office." };
  }
  const lapse = r.findings.some((f) => f.code === "LAPSE_RULE_NOT_SET");
  return {
    key: "REGISTER",
    state: "PASS",
    detail: lapse
      ? "Registered, not cancelled and not suspended. A document of yours has expired and the office has not set whether that suspends a supplier, so the office may ask you about it."
      : "Registered, not cancelled, not suspended and not blacklisted, on the supplier register.",
  };
}

function attendance(i: PreSaleInput): PreSaleCheck | null {
  const mandatory = i.events.filter((e) => e.mandatory === true && !e.cancelled);
  if (i.permitted !== true || mandatory.length === 0) return null;
  const faults = attendanceFaults(i.partyId, i.events, i.permitted);
  if (faults.length === 0) return { key: "ATTENDANCE", state: "PASS", detail: "You are on the attendance register of the briefing or site visit that the notice made mandatory." };
  const words = faults.map((f) => {
    const kind = KIND[String(f.data?.kind) as keyof typeof KIND] ?? "event";
    return f.code === "EVENT_NOT_HELD" ? `The ${kind} the notice made mandatory has not been held yet, so its register is not complete.` : `The ${kind} the notice made mandatory has been held, and your company is not on its attendance register. Signing up online does not count as attending.`;
  });
  return { key: "ATTENDANCE", state: "BLOCK", detail: words.join(" ") };
}

export function preSaleChecks(i: PreSaleInput): PreSaleCheck[] {
  const out: PreSaleCheck[] = [onSale(i.phase)];
  if (i.path === "INVITED") {
    out.push(i.invited ? { key: "INVITED", state: "PASS", detail: "Your company is on the list of suppliers invited." } : { key: "INVITED", state: "BLOCK", detail: "This exercise invites named suppliers only, and your company is not on its list." });
  }
  out.push(register(i.register));
  const a = attendance(i);
  if (a) out.push(a);
  if (i.restrictedTender === true) {
    out.push({
      key: "RESTRICTION",
      state: "BRING",
      detail: `${i.restrictionLabel ? `${i.restrictionLabel}: ` : "The notice restricts who may tender. "}Bring the original, or a certified true copy, of your status certificate. The officer checks it at the counter.`,
    });
  }
  out.push({ key: "AUTHORITY", state: "BRING", detail: "Bring proof that the person collecting the documents may receive them for your company, such as a letter naming them. The officer checks it at the counter." });
  if (i.alreadyBought) out.push({ key: "ALREADY", state: "INFO", detail: "The documents have already been sold to your company." });
  return out;
}

export const blockingChecks = (cs: readonly PreSaleCheck[]) => cs.filter((c) => c.state === "BLOCK");

export const COLLECTOR_MAX = 240;

export interface RequestInput {
  checks: readonly PreSaleCheck[];
  collectorName: string;
  /// A request of the supplier's for this window that stands (not withdrawn, not refused).
  standing: boolean;
  alreadyBought: boolean;
}

export type RequestJudgement =
  /// Something the supplier can put right before anything is recorded.
  | { outcome: "FAULTS"; faults: BidFinding[] }
  /// The checks stop it: kept as a refused attempt with the checks.
  | { outcome: "REFUSED" }
  | { outcome: "MAKE" };

export function judgeRequest(i: RequestInput): RequestJudgement {
  const faults: BidFinding[] = [];
  const collector = i.collectorName.trim();
  if (!collector) faults.push({ code: "COLLECTOR_REQUIRED", level: "block" });
  else if (collector.length > COLLECTOR_MAX) faults.push({ code: "COLLECTOR_TOO_LONG", level: "block" });
  if (i.standing) faults.push({ code: "REQUEST_STANDS", level: "block" });
  if (i.alreadyBought) faults.push({ code: "ALREADY_BOUGHT", level: "block" });
  if (faults.length > 0) return { outcome: "FAULTS", faults };
  return blockingChecks(i.checks).length > 0 ? { outcome: "REFUSED" } : { outcome: "MAKE" };
}

/// Where a request stands, for display and for the officer's register. Fulfilled by a live sale, which the request never makes.
export type RequestState = "WAITING" | "BOUGHT" | "WITHDRAWN" | "REFUSED";
export function requestState(r: { refusedAt: Date | null; endedAt: Date | null }, bought: boolean): RequestState {
  if (r.refusedAt) return "REFUSED";
  if (r.endedAt) return "WITHDRAWN";
  return bought ? "BOUGHT" : "WAITING";
}
