/**
 * The window's bid-receipt answers (FR-BID-006, 009): the validity days the tender documents state,
 * with where the figure came from, and whether they permit alternatives. Prepared with the window's
 * other items and frozen once it is published (`windowEditFault`). One exit after publication: a
 * window published with the validity not set may have the days the documents stated recorded once,
 * with a reason — otherwise an award on it could never pass (a state must always have an exit). A
 * set value is never changed after publication. Pure.
 */

import type { PackKind } from "@/lib/method/types";
import { windowEditFault } from "@/lib/window/edit";

import { isPublishedStatus, type ExerciseStatus, type Finding } from "./types";

export type BidFieldsFault = "WINDOW_NOT_EDITABLE" | "VALIDITY_ALREADY_SET" | "REASON_REQUIRED" | "DAYS_REQUIRED" | "PROVENANCE_REQUIRED";

export function bidFieldsFaults(i: {
  status: ExerciseStatus;
  packKind: PackKind | null;
  current: { days: number | null; alternativesPermitted: boolean | null };
  next: { days: number | null; provenance: string | null; alternativesPermitted: boolean | null };
  reason: string;
}): Finding<BidFieldsFault>[] {
  const out: Finding<BidFieldsFault>[] = [];
  const f = (code: BidFieldsFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.next.days != null && !i.next.provenance) f("PROVENANCE_REQUIRED");
  const edit = windowEditFault(i.status, i.packKind);
  if (!edit) return out;
  // Published: only the validity left unset may be recorded, once, with a reason.
  if (edit.code === "WINDOW_PUBLISHED" && isPublishedStatus(i.status)) {
    if (i.current.days != null) f("VALIDITY_ALREADY_SET");
    if (i.next.days == null) f("DAYS_REQUIRED");
    if (i.next.alternativesPermitted !== i.current.alternativesPermitted) f("WINDOW_NOT_EDITABLE", { why: edit.code });
    if (!i.reason.trim()) f("REASON_REQUIRED");
    return out;
  }
  f("WINDOW_NOT_EDITABLE", { why: edit.code });
  return out;
}

/// The trail's field that names who recorded the validity after publication (BD-66-7 exit).
export const EXIT_RECORDED_BY_FIELD = "recordedBy";

export interface ValidityExit {
  at: Date;
  /// As the trail wrote it, "<name>, recorded on their behalf, not signed"; null where the entry names nobody.
  by: string | null;
  reason: string;
}

/**
 * When the bids' validity was recorded after publication (BD-66-7's exit; 6.6 review S-6): the
 * earliest trail entry on the window, at or after its publication, that moved the validity from
 * "Not set". Null where the validity was set before publication (or never). Pure: the caller loads
 * the window's entries.
 */
export function validityExitOf(entries: readonly { at: Date; reason: string; changes: unknown }[], publishedAt: Date | null): ValidityExit | null {
  if (!publishedAt) return null;
  const changesOf = (c: unknown) => (Array.isArray(c) ? (c as { field?: unknown; before?: unknown; after?: unknown }[]) : []);
  const exit = [...entries]
    .filter((e) => e.at.getTime() >= publishedAt.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .find((e) => changesOf(e.changes).some((c) => c.field === "bidValidity" && c.before === "Not set" && typeof c.after === "string" && c.after !== "Not set"));
  if (!exit) return null;
  const by = changesOf(exit.changes).find((c) => c.field === EXIT_RECORDED_BY_FIELD)?.after;
  return { at: exit.at, by: typeof by === "string" && by ? by : null, reason: exit.reason };
}
