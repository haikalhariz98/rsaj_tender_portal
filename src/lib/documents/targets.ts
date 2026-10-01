/**
 * Where a received-but-unfiled document can be attached: for each record of a kind, the
 * purposes that suit it, and for each whether it is open now, and if not the words why.
 * Pure: the same `purposeFits` and `ownerState` the attach act judges under its lock, so the
 * choice offered and the act that follows never disagree. The act still re-judges everything.
 *
 * An exercise keeps a dossier or a scope document only where its method asks for one
 * (`exercisePurposes`); the exercise's own screen shows the same, so a document is never
 * filed under a heading the exercise never shows.
 */

import { ownerState, purposeFits, type OwnerFacts } from "./attach";
import { EXIT_TEXT, PURPOSE_LABEL } from "./labels";
import { ATTACHMENT_PURPOSES, type AttachmentPurpose, type OwnerKind } from "./types";

export const OWNER_KIND_LABEL: Readonly<Record<OwnerKind, string>> = {
  meeting: "Committee sitting",
  exercise: "Sourcing exercise",
  award: "Award",
  delegation: "Delegation",
};

/// Where an owner's own screen is, for a link from a document to the record it is on.
export function ownerHref(kind: OwnerKind, id: string): string {
  return kind === "meeting" ? `/committees/${id}` : kind === "exercise" ? `/sourcing/${id}` : kind === "award" ? `/awards/${id}` : "/configuration/users";
}

/// What a method asks an exercise to keep: dossier evidence and/or the coordination scope document.
export function exercisePurposes(flags: { requiresDossier: boolean; requiresCoordinationRecord: boolean } | null): AttachmentPurpose[] {
  return [...(flags?.requiresDossier ? (["DOSSIER_EVIDENCE"] as const) : []), ...(flags?.requiresCoordinationRecord ? (["COORDINATION_SCOPE"] as const) : [])];
}

export interface TargetOwner {
  id: string;
  /// Its reference, never an id.
  label: string;
  facts: OwnerFacts;
  /// An exercise's method flags (null where its method is no longer configured).
  exerciseFlags?: { requiresDossier: boolean; requiresCoordinationRecord: boolean } | null;
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
}

const NOTHING_KEPT = "Nothing is kept against this record: its method asks for no document.";

export function attachTargets(owners: readonly TargetOwner[]): (TargetRecord & { nothingKept: string | null })[] {
  return owners.map((o) => {
    const fitting = ATTACHMENT_PURPOSES.filter((p) => purposeFits(p, o.facts));
    const kept = o.facts.kind === "exercise" ? fitting.filter((p) => exercisePurposes(o.exerciseFlags ?? null).includes(p)) : fitting;
    const purposes = kept.map((value) => {
      const st = ownerState(value, o.facts);
      return { value, label: PURPOSE_LABEL[value], open: st.state === "OPEN", reason: st.state === "OPEN" ? null : EXIT_TEXT[st.exit] };
    });
    return { id: o.id, label: o.label, purposes, nothingKept: purposes.length === 0 ? NOTHING_KEPT : null };
  });
}

/// The version to attach: the newest one that is not withdrawn. Null where every version is withdrawn: nothing can be attached.
export function attachableVersion(versions: readonly { id: string; versionNo: number; withdrawnAt: Date | null }[]): string | null {
  return [...versions].filter((v) => v.withdrawnAt == null).sort((a, b) => b.versionNo - a.versionNo)[0]?.id ?? null;
}
