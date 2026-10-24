/**
 * Which kinds a contract offers the contractor, and which files each version of a kind carries (ADR 0045 D6; WV-9, WV-10, WV-11). Pure.
 *
 * The route is the contract type's `paymentRoute`, read live at each act (WV-9). It decides only which kind may be PICKED: a document already sent keeps its kind,
 * and its later versions are taken whatever the route now says, so a change never hides or blocks a claim already sent.
 */

import { SUBMISSION_KINDS } from "@/lib/portal/projects/types";

import type { DocKind, Finding, PaymentRoute } from "./types";

/// The refusals of this file: a kind the route does not offer, a supply claim's missing file, and a file of a purpose the version's kind does not take.
export type KindFileFault = "KIND_NOT_OFFERED" | "SUPPLY_FILE_MISSING" | "FILE_PURPOSE_NOT_TAKEN";

/// WV-10: a delivery-order contract is paid on delivery orders and invoices, never on interim valuations.
const NOT_ON_SUPPLY: readonly DocKind[] = ["INTERIM_CLAIM", "MATERIALS_ON_SITE"];

/// The kinds offered, in the list's order. DELIVERY_ORDER_INVOICE: every kind but the two valuation claims, plus SUPPLY_CLAIM. CERTIFIED_CLAIM or not set: today's six.
export function kindsOffered(route: PaymentRoute | null): DocKind[] {
  if (route === "DELIVERY_ORDER_INVOICE") return SUBMISSION_KINDS.filter((k) => !NOT_ON_SUPPLY.includes(k));
  return SUBMISSION_KINDS.filter((k) => k !== "SUPPLY_CLAIM");
}

/// A kind picked with a first version that the contract's route does not offer. Null: it is offered (or none was picked).
export function kindOfferedFault(kind: DocKind | null, route: PaymentRoute | null): Finding<KindFileFault> | null {
  return kind !== null && !kindsOffered(route).includes(kind) ? { code: "KIND_NOT_OFFERED", level: "block", data: { kind } } : null;
}

/// WV-11: a supply claim's two file purposes, on the version owner.
export const SUPPLY_FILE_PURPOSES = ["DELIVERY_ORDER", "SUPPLY_INVOICE"] as const;
export type SupplyFilePurpose = (typeof SUPPLY_FILE_PURPOSES)[number];
export const isSupplyFilePurpose = (v: unknown): v is SupplyFilePurpose => typeof v === "string" && (SUPPLY_FILE_PURPOSES as readonly string[]).includes(v);

/// Every purpose a project document's version may pin (the migration's CHECK on the version owner).
export const VERSION_FILE_PURPOSES = ["PROJECT_DOCUMENT_FILE", ...SUPPLY_FILE_PURPOSES] as const;
export type VersionFilePurpose = (typeof VERSION_FILE_PURPOSES)[number];

/**
 * The purposes of one version's files, judged against the document's kind. SUPPLY_CLAIM: at least one file of each supply purpose, and PROJECT_DOCUMENT_FILE refused
 * (SUPPLY_FILE_MISSING names the missing purpose; FILE_PURPOSE_NOT_TAKEN names the file, from 1). Any other kind, or none: only PROJECT_DOCUMENT_FILE.
 */
export function versionFileFaults(kind: DocKind | null, purposes: readonly string[]): Finding<KindFileFault>[] {
  const out: Finding<KindFileFault>[] = [];
  const supply = kind === "SUPPLY_CLAIM";
  purposes.forEach((p, n) => {
    if (supply ? !isSupplyFilePurpose(p) : p !== "PROJECT_DOCUMENT_FILE") out.push({ code: "FILE_PURPOSE_NOT_TAKEN", level: "block", data: { file: n + 1, purpose: p, kind } });
  });
  if (supply) for (const p of SUPPLY_FILE_PURPOSES) if (!purposes.includes(p)) out.push({ code: "SUPPLY_FILE_MISSING", level: "block", data: { purpose: p } });
  return out;
}
