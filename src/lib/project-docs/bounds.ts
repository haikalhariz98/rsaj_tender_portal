/**
 * The Project workspace's upload bounds (PW-15, PW-32; plan §3.1). Technical constants, not customer policy, as `SUBMISSIONS_PER_WINDOW` is (precedent O-10):
 * they protect the database, where every byte is kept for good (ADR 0011 D1, D3), from a script. Each file is still capped by the customer's `maxBytes` and
 * the deployment's `DOCUMENT_MAX_BYTES`. Not shown until hit (PW-32): a refusal names the limit and when to try again; no meter, counter or standing text.
 *
 * And the checks on the staged files an act pins to a version (ADR 0042 D8). Pure.
 */

import { STAGED_FOR_PROJECT_DOCUMENT } from "@/lib/documents/staged-for";

import type { Actor, Finding } from "./types";

/// The most files in one version. A drawing set or a claim with its back-up fits; more is a script, or a set to split into documents.
export const PROJECT_FILES_PER_VERSION = 20;
/// The rolling window a portal account's staged files are counted in: the same rhythm as `SUBMISSION_WINDOW_MINUTES`.
export const PROJECT_UPLOAD_WINDOW_MINUTES = 60;
/// The most files one portal account may stage in the window: three full versions an hour, far above a contractor's working pace.
export const PROJECT_FILES_PER_WINDOW = 60;
/// The most bytes one portal account may stage in the window: 256 MiB, so about 6 GB a day at most, even scripted.
export const PROJECT_BYTES_PER_WINDOW = 256n * 1024n * 1024n;

/// How a portal upload's body is read (the same rhythm as the bid part's and the registration's, which `limitBodyPaced` holds): the whole body within the deadline, and no slower
/// than the minimum rate once the grace has passed. Technical constants, not customer policy: they stop a slow body from holding an upload slot.
export const PROJECT_BODY_DEADLINE_SECONDS = 300;
export const PROJECT_BODY_MIN_BYTES_PER_SECOND = 16 * 1024;
export const PROJECT_BODY_GRACE_SECONDS = 10;

const WINDOW_MS = PROJECT_UPLOAD_WINDOW_MINUTES * 60_000;
const MIB = 1024n * 1024n;

export type WindowFault = "TOO_MANY_FILES_IN_WINDOW" | "TOO_MANY_BYTES_IN_WINDOW";

/**
 * Whether one more file of `incomingBytes` may be staged by a portal account, given what it staged before (every stored version it recorded, attached or not:
 * staging is where a flood lands, PW-32). The window is rolling and half-open: a file staged exactly `PROJECT_UPLOAD_WINDOW_MINUTES` ago has left it.
 *
 * Each refusal says when to try again, in whole minutes from `now` (at least 1): when enough of the oldest counted files have left the window for this one to
 * fit. `retryInMinutes` is null only where waiting cannot help: one file larger than the whole byte bound (the per-file caps stop that first).
 * Both faults are returned when both bind.
 */
export function windowFaults(i: { staged: readonly { at: Date; bytes: bigint }[]; incomingBytes: bigint; now: Date }): Finding<WindowFault>[] {
  const from = i.now.getTime() - WINDOW_MS;
  // A row stamped after `now` (another server's clock) still counts: the bound errs towards refusing.
  const inWindow = i.staged.filter((s) => s.at.getTime() > from).sort((a, b) => a.at.getTime() - b.at.getTime());
  const minutesUntil = (at: Date) => Math.max(1, Math.ceil((at.getTime() + WINDOW_MS - i.now.getTime()) / 60_000));
  const out: Finding<WindowFault>[] = [];

  if (inWindow.length >= PROJECT_FILES_PER_WINDOW) {
    // The file whose leaving brings the count down to one under the bound.
    const leaving = inWindow[inWindow.length - PROJECT_FILES_PER_WINDOW];
    out.push({ code: "TOO_MANY_FILES_IN_WINDOW", level: "block", data: { limit: PROJECT_FILES_PER_WINDOW, minutes: PROJECT_UPLOAD_WINDOW_MINUTES, retryInMinutes: minutesUntil(leaving.at) } });
  }

  let total = inWindow.reduce((sum, s) => sum + s.bytes, 0n);
  if (total + i.incomingBytes > PROJECT_BYTES_PER_WINDOW) {
    let retryInMinutes: number | null = null;
    if (i.incomingBytes <= PROJECT_BYTES_PER_WINDOW) {
      for (const s of inWindow) {
        total -= s.bytes;
        if (total + i.incomingBytes <= PROJECT_BYTES_PER_WINDOW) {
          retryInMinutes = minutesUntil(s.at);
          break;
        }
      }
    }
    out.push({ code: "TOO_MANY_BYTES_IN_WINDOW", level: "block", data: { limitMiB: Number(PROJECT_BYTES_PER_WINDOW / MIB), minutes: PROJECT_UPLOAD_WINDOW_MINUTES, retryInMinutes } });
  }
  return out;
}

export type StagedFault = "NOT_STAGED_FOR_PROJECT" | "NOT_YOURS" | "ALREADY_ATTACHED" | "WITHDRAWN" | "WRONG_CLASS" | "DUPLICATE";

/// A staged store version as the act reads it before pinning it. `recordedBy*` are the store version's; `attachments` counts the records already holding it.
export interface StagedFile {
  versionId: string;
  stagedFor: string | null;
  recordedByPersonId: string | null;
  recordedBySupplierAccountId: string | null;
  attachments: number;
  withdrawn: boolean;
  documentClassId: string;
}

/**
 * Each staged file the act would pin (ADR 0042 D8): staged for a project document (or, for a work item's files, `stagedFor` = work-item), by the same actor (a staff person, or the same portal account), not yet
 * attached, not withdrawn, of the configured project class, and not named twice. Every fault of every file; `data.file` is its place in the list, from 1.
 */
export function stagedFileFaults(files: readonly StagedFile[], actor: Actor, projectClassId: string, stagedFor: string = STAGED_FOR_PROJECT_DOCUMENT): Finding<StagedFault>[] {
  const out: Finding<StagedFault>[] = [];
  const seen = new Set<string>();
  files.forEach((f, n) => {
    const add = (code: StagedFault) => out.push({ code, level: "block", data: { file: n + 1 } });
    if (seen.has(f.versionId)) add("DUPLICATE");
    seen.add(f.versionId);
    if (f.stagedFor !== stagedFor) add("NOT_STAGED_FOR_PROJECT");
    const mine = actor.side === "ORGANISATION" ? f.recordedByPersonId === actor.personId && f.recordedBySupplierAccountId === null : f.recordedBySupplierAccountId === actor.accountId && f.recordedByPersonId === null;
    if (!mine) add("NOT_YOURS");
    if (f.attachments > 0) add("ALREADY_ATTACHED");
    if (f.withdrawn) add("WITHDRAWN");
    if (f.documentClassId !== projectClassId) add("WRONG_CLASS");
  });
  return out;
}
