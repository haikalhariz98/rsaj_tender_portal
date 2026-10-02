/**
 * The tender box's custody acts (6.6 §0.1). The box, its lock and its key remain the control; the
 * portal records that the box was locked at the closing, by a named officer, and does not claim to
 * enforce it. Locking is recorded at or after the closing, never before, stamped by the server.
 * 6.7 refuses to open without a LOCKED event at or after the closing. Pure.
 */

import { isPublishedStatus, type BoxEventKind, type ExerciseForBids, type Finding } from "./types";

export type BoxFault = "TIME_ZONE_UNSET" | "CLOSING_NOT_SET" | "NOT_PUBLISHED" | "CANCELLED" | "BEFORE_CLOSING" | "ALREADY_LOCKED" | "OPENED" | "PERSON_REQUIRED";

export interface BoxEventFacts {
  kind: BoxEventKind;
  occurredAt: Date;
  personName: string;
}

export function lockFaults(i: { exercise: ExerciseForBids; now: Date; events: readonly BoxEventFacts[]; personActive: boolean }): Finding<BoxFault>[] {
  const out: Finding<BoxFault>[] = [];
  const f = (code: BoxFault) => out.push({ code, level: "block" });
  const x = i.exercise;
  if (x.status === "CANCELLED") return [{ code: "CANCELLED", level: "block" }];
  if (!isPublishedStatus(x.status)) f("NOT_PUBLISHED");
  if (!x.timeZone) f("TIME_ZONE_UNSET");
  if (!x.closing) f("CLOSING_NOT_SET");
  else if (i.now.getTime() < x.closing.getTime()) f("BEFORE_CLOSING");
  const latest = latestEvent(i.events);
  if (latest?.kind === "LOCKED") f("ALREADY_LOCKED");
  if (latest?.kind === "UNLOCKED_FOR_OPENING" || x.openingStarted) f("OPENED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

const latestEvent = (events: readonly BoxEventFacts[]) => [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1) ?? null;

/// The box now: locked (when and by whom), opened for opening, or not locked yet.
export function boxState(events: readonly BoxEventFacts[]): { state: "NOT_LOCKED" } | { state: "LOCKED" | "OPENED"; at: Date; by: string } {
  const latest = latestEvent(events);
  if (!latest) return { state: "NOT_LOCKED" };
  return { state: latest.kind === "LOCKED" ? "LOCKED" : "OPENED", at: latest.occurredAt, by: latest.personName };
}

/// Whether the box was locked at or after the closing (the fact 6.7's opening needs).
export function lockedAtOrAfterClosing(events: readonly BoxEventFacts[], closing: Date | null): boolean {
  return closing != null && events.some((e) => e.kind === "LOCKED" && e.occurredAt.getTime() >= closing.getTime());
}
