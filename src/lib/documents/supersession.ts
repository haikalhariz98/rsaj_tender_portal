/**
 * A check recorded with a record is a statement about the day it was recorded. "Supporting
 * evidence is not attached" was true then; if a live attachment of that kind has arrived
 * since, the finding is not wrong, but it is no longer the state of things, and showing it
 * as a warning with an instruction to attach one tells the reader to do what is done.
 *
 * `supersession` pairs each recorded finding with what has satisfied it since: the live
 * attachments (not detached, version not withdrawn: `isLive`) of the purpose the finding is
 * about that were attached AFTER the checks were recorded. An attachment that was already
 * there when they were recorded satisfies nothing "since then", so the finding stands.
 * Findings about anything else, and findings nothing has satisfied, are never superseded.
 */

import { formatOrgDay } from "@/lib/format";

import { isLive } from "./evidence";
import type { AttachmentPurpose } from "./types";

/// The recorded findings a live attachment can satisfy, and the purpose that satisfies each.
export const SATISFIED_BY: Readonly<Record<string, { purpose: AttachmentPurpose; subject: string }>> = {
  EVIDENCE_NOT_ATTACHED: { purpose: "DOSSIER_EVIDENCE", subject: "Supporting evidence" },
  SCOPE_DOCUMENT_NOT_ATTACHED: { purpose: "COORDINATION_SCOPE", subject: "The scope document from the coordination meeting" },
};

export interface AttachmentSince {
  purpose: AttachmentPurpose;
  /// Absent where the caller did not read it: such an attachment can claim nothing "since then".
  attachedAt?: Date;
  detachedAt: Date | null;
  version: { versionNo: number; withdrawnAt: Date | null; title: string };
}

export interface Resolution {
  /// What was not attached, as a sentence's subject.
  subject: string;
  /// The live attachments that arrived after the checks were recorded, oldest first.
  since: { title: string; versionNo: number; attachedAt: Date }[];
}

export interface JudgedFinding<F> {
  finding: F;
  /// Null: the finding stands as recorded.
  superseded: Resolution | null;
}

export function supersession<F extends { code: string }>(findings: readonly F[], attachments: readonly AttachmentSince[], recordedAt: Date): JudgedFinding<F>[] {
  return findings.map((finding) => {
    const rule = SATISFIED_BY[finding.code];
    if (!rule) return { finding, superseded: null };
    const since = attachments
      .flatMap((a) => (a.purpose === rule.purpose && isLive(a) && a.attachedAt && a.attachedAt.getTime() > recordedAt.getTime() ? [{ title: a.version.title, versionNo: a.version.versionNo, attachedAt: a.attachedAt }] : []))
      .sort((a, b) => a.attachedAt.getTime() - b.attachedAt.getTime());
    return { finding, superseded: since.length ? { subject: rule.subject, since } : null };
  });
}

/// "When the checks were recorded, X was not attached. Since then: T, version 2, attached 10 Sep 2026."
export function resolutionText(r: Resolution, timeZone: string | null): string {
  const since = r.since.map((s) => `${s.title}, version ${s.versionNo}, attached ${formatOrgDay(s.attachedAt, timeZone)}`).join("; ");
  return `When the checks were recorded, ${r.subject[0].toLowerCase()}${r.subject.slice(1)} was not attached. Since then: ${since}.`;
}
