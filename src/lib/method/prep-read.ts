/**
 * What the preparation sections of Scope and estimate read beyond what the exercise page already holds (Sourcing Requirements v2: SR-05,
 * ruling 8, and O1, ruling 10): the tender conditions for Details & compliance, and the proposed and approved dates with the organisation's
 * usual closing time for Key dates & person in charge. Reads only, and only while the section is the one being looked at, so no other
 * section or tab pays for it. These used to ride with the Overview.
 */

import { db } from "@/lib/db";
import { conditionsTab, type ConditionsTab } from "@/lib/tender-docs/read-conditions";
import { windowEditFault } from "@/lib/window/edit";
import { loadWindowPolicy } from "@/lib/window/repo";

import { keyDatesView, type KeyDatesView } from "./key-dates";
import type { ExerciseStatus, PackKind } from "./types";

/// Null where the exercise has no pack to state conditions for (an appointment with no tenderers).
export async function loadConditionsRead(organisationId: string, exerciseId: string, noPack: boolean): Promise<ConditionsTab | null> {
  return noPack ? null : conditionsTab(organisationId, exerciseId);
}

export async function loadKeyDatesRead(
  ex: { id: string; status: ExerciseStatus; tenderingStartOn: Date | null; proposedStartOn: Date | null; proposedClosingAt: Date | null },
  closing: Date | null,
  org: { id: string; timeZone: string | null },
  /// The pack the exercise assembles, and whether it is the no-pack path (no tender documents, so no window).
  pack: { kind: PackKind | null; noPack: boolean },
): Promise<KeyDatesView> {
  const [packs, policy, window] = await Promise.all([
    db.tenderPack.findMany({ where: { exerciseId: ex.id, status: { not: "VOID" } }, orderBy: { versionNo: "desc" }, select: { versionNo: true, status: true, proposedStartOn: true, proposedClosingAt: true } }),
    loadWindowPolicy(org.id),
    db.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { events: { orderBy: { startsAt: "asc" }, select: { id: true, kind: true, startsAt: true, place: true, mandatory: true, cancelledAt: true } } } }),
  ]);
  return keyDatesView({
    tenderingStartOn: ex.tenderingStartOn,
    closing,
    proposed: { startOn: ex.proposedStartOn, closingAt: ex.proposedClosingAt },
    packs,
    noPack: pack.noPack,
    canSchedule: windowEditFault(ex.status, pack.kind) === null,
    defaultClosingTime: policy.defaultClosingTime,
    closingTimeProvenance: policy.closingTimeProvenance,
    events: window?.events ?? [],
    timeZone: org.timeZone,
  });
}
