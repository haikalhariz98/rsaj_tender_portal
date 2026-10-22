/**
 * Where a received-but-unfiled document can be attached: for each record of a kind, the
 * purposes that suit it, and for each whether it is open now, and if not the words why.
 * Pure: the same `purposeFits` and `ownerState` the attach act judges under its lock, so the
 * choice offered and the act that follows never disagree. The act still re-judges everything.
 *
 * An exercise keeps a dossier or a scope document only where its method asks for one
 * (`methodKeeps`, the rule the attach act refuses by); the exercise's own screen shows the
 * same (`exercisePurposes`), so a document is never filed under a heading the exercise never shows.
 */

import { caseHref } from "@/lib/contract/links";
import { administrationConflict } from "@/lib/auth/administration-conflict";
import { methodKeeps, ownerState, purposeFits, type OwnerFacts } from "./attach";
import { exitWords, PURPOSE_LABEL } from "./labels";
import { ATTACHMENT_PURPOSES, OWNER_ACT_PURPOSES, OWNER_KINDS, PURPOSE_OWNER, type AttachmentPurpose, type OwnerKind } from "./types";

/// The kinds a received document can be attached to from the shared choice: those with at
/// least one purpose that is not attached by its owner's own act (a bill version is not one).
export const ATTACHABLE_OWNER_KINDS: readonly OwnerKind[] = OWNER_KINDS.filter((k) => ATTACHMENT_PURPOSES.some((p) => PURPOSE_OWNER[p] === k && !OWNER_ACT_PURPOSES.includes(p)));

export const OWNER_KIND_LABEL: Readonly<Record<OwnerKind, string>> = {
  meeting: "Committee sitting",
  exercise: "Sourcing exercise",
  award: "Award",
  delegation: "Delegation",
  specificationPanel: "Specification panel",
  bqVersion: "Bill of quantities",
  tenderPackPart: "Tender document part",
  addendum: "Addendum",
  bidWithdrawal: "Bid withdrawal",
  validityExtension: "Validity extension",
  opening: "Bid opening",
  evaluation: "Evaluation",
  evaluationMeeting: "Evaluation meeting",
  evaluationBidder: "Bid under evaluation",
  supplierDocument: "Supplier's document",
  supplierApplication: "Supplier's application",
  contract: "Contract",
  variationInstruction: "S.O.'s instruction (variation)",
  standingEvent: "Supplier's registration cancelled",
  delayNotice: "Delay notice",
  eotClaim: "Extension-of-time claim",
  registrationDraftDocument: "Certificate in a supplier's registration",
  creditorProfile: "Supplier's creditor profile",
  onlineBidFile: "File of an online bid",
  portalApplicationDocument: "Certificate in an online application",
  portalApplicationCreditor: "Bank details in an online application",
  projectDocumentVersion: "Version of a project document",
};

/// Where an owner's own screen is, for a link from a document to the record it is on.
/// A specification panel, a bill version and a tender pack part are shown on their exercise's screen: pass the exercise's id as `exerciseId`.
export function ownerHref(kind: OwnerKind, id: string, exerciseId?: string): string {
  switch (kind) {
    case "meeting":
      return `/committees/${id}`;
    case "exercise":
      return `/sourcing/${id}`;
    case "award":
      return caseHref({ awardId: id, contractId: null });
    case "delegation":
      return "/configuration/users";
    case "specificationPanel":
      return exerciseId ? `/sourcing/${exerciseId}` : "/sourcing";
    case "bqVersion":
      return exerciseId ? `/sourcing/${exerciseId}?tab=scope&section=bq` : "/sourcing";
    case "tenderPackPart":
      return exerciseId ? `/sourcing/${exerciseId}?tab=documents` : "/sourcing";
    case "addendum":
      return exerciseId ? `/sourcing/${exerciseId}?tab=documents&section=publishing` : "/sourcing";
    case "bidWithdrawal":
    case "validityExtension":
      return exerciseId ? `/sourcing/${exerciseId}?tab=bids` : "/sourcing";
    case "opening":
      return exerciseId ? `/sourcing/${exerciseId}?tab=bids&section=schedule` : "/sourcing";
    case "evaluation":
      return exerciseId ? `/sourcing/${exerciseId}?tab=evaluation&section=report` : "/sourcing";
    case "evaluationMeeting":
      return exerciseId ? `/sourcing/${exerciseId}?tab=evaluation&section=meetings` : "/sourcing";
    case "evaluationBidder":
      return exerciseId ? `/sourcing/${exerciseId}?tab=evaluation&section=stages` : "/sourcing";
    // 6.15: the third argument is the supplier's id.
    case "supplierDocument":
      return exerciseId ? `/suppliers/${exerciseId}?tab=documents` : "/suppliers";
    case "supplierApplication":
      return exerciseId ? `/suppliers/${exerciseId}?tab=applications` : "/suppliers";
    // 6.12: a contract's papers are on its Formation tab.
    case "contract":
      return `/projects/${id}?tab=formation`;
    // 6.13 (FR-VAR-015): an instruction is on its variation's Instruction tab; the third argument is
    // "<contractId>/variations/<variationId>".
    case "variationInstruction":
      return exerciseId ? `/projects/${exerciseId}?tab=instruction` : "/projects";
    // 6.15 (615-C2): a registration cancelled is on its supplier's Standing tab; the third argument is the supplier's id.
    case "standingEvent":
      return exerciseId ? `/suppliers/${exerciseId}?tab=standing` : "/suppliers";
    // 6.13 Part B run 1b: a delay notice and an EOT claim are on their contract's Time tab (phase B); the third argument is
    // the contract's id.
    case "delayNotice":
    case "eotClaim":
      return exerciseId ? `/projects/${exerciseId}?tab=time` : "/projects";
    // 6.15 Phase 4b: a certificate in a supplier's registration is on its supplier's Documents tab, and the creditor profile on its own tab; the third argument is the supplier's id.
    case "registrationDraftDocument":
      return exerciseId ? `/suppliers/${exerciseId}?tab=documents` : "/suppliers";
    case "creditorProfile":
      return exerciseId ? `/suppliers/${exerciseId}?tab=creditor` : "/suppliers";
    // Wave 3b step 15: a moved bid file is on its exercise's Bids tab.
    case "onlineBidFile":
      return exerciseId ? `/sourcing/${exerciseId}?tab=bids` : "/sourcing";
    // ADR 0041: what an online application holds is on its own page; the third argument is the application's id.
    case "portalApplicationDocument":
    case "portalApplicationCreditor":
      return exerciseId ? `/suppliers/online/${exerciseId}` : "/suppliers/online";
    // ADR 0042 D5: a Project workspace version is on its contract's Documents list (the tab id stays "submissions"); the third argument is the contract's id.
    case "projectDocumentVersion":
      return exerciseId ? `/projects/${exerciseId}?tab=submissions` : "/projects";
  }
}

export { exercisePurposes } from "./attach";

export interface TargetOwner {
  id: string;
  /// Its reference, never an id.
  label: string;
  href?: string;
  /// An exercise's facts carry what its method keeps (`method`), read the way the attach act reads it.
  facts: OwnerFacts;
}

export interface TargetPurpose {
  value: AttachmentPurpose;
  label: string;
  open: boolean;
  /// Why it is not open, in words; null while open.
  reason: string | null;
}

export interface TargetRecord {
  id: string;
  label: string;
  purposes: TargetPurpose[];
  /// Where the record's own screen is, where its id alone does not say (a panel is on its exercise).
  href?: string;
}

const NOTHING_KEPT = "Nothing is kept against this record: its method asks for no document.";

export function attachTargets(owners: readonly TargetOwner[]): (TargetRecord & { nothingKept: string | null })[] {
  return owners.map((o) => {
    // A purpose its owner's own act attaches (the bill's import) is never offered here.
    const kept = ATTACHMENT_PURPOSES.filter((p) => !OWNER_ACT_PURPOSES.includes(p) && purposeFits(p, o.facts) && methodKeeps(p, o.facts));
    const purposes = kept.map((value) => {
      const st = ownerState(value, o.facts);
      return { value, label: PURPOSE_LABEL[value], open: st.state === "OPEN", reason: st.state === "OPEN" ? null : exitWords(st) };
    });
    return { id: o.id, label: o.label, purposes, nothingKept: purposes.length === 0 ? NOTHING_KEPT : null, ...(o.href ? { href: o.href } : {}) };
  });
}

/// The version to attach: the newest one that is not withdrawn. Null where every version is withdrawn: nothing can be attached.
export function attachableVersion(versions: readonly { id: string; versionNo: number; withdrawnAt: Date | null }[]): string | null {
  return [...versions].filter((v) => v.withdrawnAt == null).sort((a, b) => b.versionNo - a.versionNo)[0]?.id ?? null;
}

/**
 * Why "Attach to a record" is not offered to this account, in words, or null where it is (product owner, 2026-10-08, ruling on log lines 1795(2) and 1809). Attaching is the
 * documents module's act, a decision of an office, and `attachDocument` refuses an administrator account; the screen says so up front, as a disabled control with the reason,
 * rather than offering a button that then fails. The words are the act's own (`administrationConflict`), so the two never differ.
 */
export function attachRefusal(actor: { isAdministrator: boolean }): string | null {
  return administrationConflict({ kind: "ACT", act: "TRANSACTION", actorIsAdministrator: actor.isAdministrator })?.en ?? null;
}
