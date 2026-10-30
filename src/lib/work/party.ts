/**
 * Parties (3b; ADR 0049 D2): a person, or the contractor as the company. Parties are objects, so `===` on two of them compares identity, never who they
 * are: compare with `sameParty`. The row helpers read the stored columns (`raisedByPersonId` / `raisedBySupplierAccountId`, `assigneePersonId` /
 * `assignedToContractor`) into parties; the account id is a record, never a party (WS-9). Pure.
 */

import type { Party } from "./types";

export const CONTRACTOR: Party = { kind: "CONTRACTOR" };
export const person = (id: string): Party => ({ kind: "PERSON", id });

export const sameParty = (a: Party | null, b: Party | null): boolean =>
  a === null || b === null ? a === b : a.kind === "CONTRACTOR" ? b.kind === "CONTRACTOR" : b.kind === "PERSON" && a.id === b.id;

/// The person a party is, or null for the contractor or nobody.
export const personIdOf = (p: Party | null): string | null => (p?.kind === "PERSON" ? p.id : null);
export const isContractor = (p: Party | null): boolean => p?.kind === "CONTRACTOR";

/// The raiser of a stored row: exactly one of the two columns is set (CHECK `WorkItem_one_raiser`).
export const raiserOf = (r: { raisedByPersonId: string | null }): Party => (r.raisedByPersonId === null ? CONTRACTOR : person(r.raisedByPersonId));
/// The assignee of a stored row: at most one form is set (CHECK `WorkItem_one_assignee`); `assigneeSupplierAccountId` is never written (WS-9).
export const assigneeOf = (r: { assigneePersonId: string | null; assignedToContractor: boolean }): Party | null =>
  r.assignedToContractor ? CONTRACTOR : r.assigneePersonId === null ? null : person(r.assigneePersonId);
