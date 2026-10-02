/**
 * Custody of the physical originals (FR-CON-013): the Contract Document, each performance bond and each
 * insurance policy, with a location and a custodian, and an append-only log of check-outs and check-ins.
 */

import type { CustodyDirection, CustodyItemKind, Finding } from "./types";

export interface MovementFacts {
  direction: CustodyDirection;
  personId: string;
  personName: string;
  on: string;
}

export type CustodyState = { state: "IN" } | { state: "OUT"; holderId: string; holderName: string; since: string };

/// Where an original is: the last movement says. Movements are read in the order recorded.
export function custodyState(movements: readonly MovementFacts[]): CustodyState {
  const last = movements[movements.length - 1];
  return last?.direction === "OUT" ? { state: "OUT", holderId: last.personId, holderName: last.personName, since: last.on } : { state: "IN" };
}

export type MovementFault = "ALREADY_OUT" | "NOT_OUT" | "FUTURE_DATE" | "BEFORE_LAST_MOVEMENT";

/// A check-out only of an original in custody, a check-in only of one out; never before the last movement or in the future.
export function movementFaults(movements: readonly MovementFacts[], direction: CustodyDirection, on: string, today: string): Finding<MovementFault>[] {
  const out: Finding<MovementFault>[] = [];
  const s = custodyState(movements);
  if (direction === "OUT" && s.state === "OUT") out.push({ code: "ALREADY_OUT", level: "block", data: { holder: s.holderName } });
  if (direction === "IN" && s.state === "IN") out.push({ code: "NOT_OUT", level: "block" });
  if (on > today) out.push({ code: "FUTURE_DATE", level: "block" });
  const lastOn = movements[movements.length - 1]?.on;
  if (lastOn && on < lastOn) out.push({ code: "BEFORE_LAST_MOVEMENT", level: "block", data: { last: lastOn } });
  return out;
}

export type RegisterFault = "LOCATION_REQUIRED" | "ALREADY_REGISTERED" | "NOT_ON_CONTRACT" | "NOT_EXECUTED";

/// Registering an original: the contract's own once executed; a bond or policy on this contract's register, once each.
export function registerFaults(i: { kind: CustodyItemKind; executed: boolean; location: string; onContract: boolean; registered: boolean }): Finding<RegisterFault>[] {
  const out: Finding<RegisterFault>[] = [];
  if (i.kind === "CONTRACT" && !i.executed) out.push({ code: "NOT_EXECUTED", level: "block" });
  if (!i.location.trim()) out.push({ code: "LOCATION_REQUIRED", level: "block" });
  if (!i.onContract) out.push({ code: "NOT_ON_CONTRACT", level: "block" });
  if (i.registered) out.push({ code: "ALREADY_REGISTERED", level: "block" });
  return out;
}
