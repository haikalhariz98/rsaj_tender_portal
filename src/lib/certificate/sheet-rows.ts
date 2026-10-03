/**
 * A certificate's stored routes and routing checks as the routing sheet reads them (the organisation's day each
 * happened). Pure: moved out of repo.ts (which re-exports them) so the sheet and the pin context can be drawn from a
 * row without loading the database client.
 */

import { storedDay } from "@/lib/dates";

import type { RecordedCheck, RouteRow } from "./routing-sheet";

/// A stored approval route, with its steps, as read from the database.
export type RouteRowIn = { id: string; status: string; openedAt: Date; createdAt: Date; steps: readonly { sequence: number; roleLabel: string; actingRoleLabel: string | null; act: string; committeeCode: string | null; decision: string; decidedByName: string | null; decidedOn: Date | null; receivedOn: Date | null }[] };

/// The routes as the sheet reads them (the organisation's day each opened).
export const routesOf = (instances: readonly RouteRowIn[]): RouteRow[] =>
  instances.map((i) => ({
    id: i.id,
    status: i.status,
    openedOn: storedDay(i.openedAt),
    createdAt: i.createdAt,
    steps: i.steps.map((s) => ({ sequence: s.sequence, roleLabel: s.roleLabel, actingRoleLabel: s.actingRoleLabel, act: s.act, committeeCode: s.committeeCode, decision: s.decision, decidedByName: s.decidedByName, decidedOn: s.decidedOn ? storedDay(s.decidedOn) : null, receivedOn: s.receivedOn ? storedDay(s.receivedOn) : null })),
  }));

/// A stored routing check, as read from the database.
export type CheckRowIn = { iteration: number; defOrder: number; personName: string; on: Date; note: string };

export const checksOf = (rows: readonly CheckRowIn[]): RecordedCheck[] => rows.map((c) => ({ iteration: c.iteration, defOrder: c.defOrder, personName: c.personName, on: storedDay(c.on), note: c.note }));
