/**
 * Work item numbers (WS-1, W-5; 0008 §4.4). Per contract and type, never reused: the act reads the highest number under the contract lock and writes the
 * next, and the unique key on (contract, type, number) is the backstop. The address form is `RFI-12`, from the short words in labels.ts. Pure.
 */

import { TYPE_SHORT } from "./labels";
import { WORK_ITEM_TYPES, type WorkItemType } from "./types";

/// The largest number a Postgres `Int` holds: a reference past it names no row.
const INT_MAX = 2_147_483_647;

/// The next number after the highest taken for (contract, type); 1 when none is.
export const nextNumber = (max: number | null): number => (max ?? 0) + 1;

/// "RFI-12": the address form of a reference.
export const itemRef = (type: WorkItemType, n: number): string => `${TYPE_SHORT[type]}-${n}`;

const TYPE_OF_SHORT: ReadonlyMap<string, WorkItemType> = new Map(WORK_ITEM_TYPES.map((t) => [TYPE_SHORT[t], t]));

/// An address's `item=` back to its type and number. Exact case, no leading zero, no zero: anything else names nothing (null).
export function parseItemRef(s: string): { type: WorkItemType; number: number } | null {
  const m = /^([A-Za-z]+)-([1-9]\d{0,9})$/.exec(s);
  if (!m) return null;
  const type = TYPE_OF_SHORT.get(m[1]);
  const number = Number(m[2]);
  return type && number <= INT_MAX ? { type, number } : null;
}
