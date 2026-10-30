/**
 * My work (3b-ii; 0008 §5.6; WB-10): the items on one staff member across every contract, in six groups. Pure; `loadMyWork` reads the rows with `myWorkWhere`,
 * `myWorkGroup` is the same rule in memory (the db test checks the two agree).
 *
 * - On me: open and assigned to me, or raised by me and In review (To check, the only items waiting on me that I am not assigned to). Formal acts are not here.
 * - Groups, first match wins: To check; Late (due before today); Today; This week (today + 1 to today + 6); Later; No date.
 * - With no time zone there is no today: every dated item is one group, "Open", and the screen says "Needs the organisation's time zone." (WS-19).
 */

import { actStatusFault } from "@/lib/contract/act-status";
import { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contract/types";
import { dayPlus } from "@/lib/dates";

import { parseItemRef } from "./number";
import { OPEN_STATUSES } from "./move";
import { personIdOf } from "./party";
import type { Day, MyWorkGroup, Party, WorkStatus } from "./types";

/// A group, or "OPEN" for dated items when no today can be judged.
export type MyWorkSection = MyWorkGroup | "OPEN";

/// In the screen's order. "OPEN" stands where the dated groups would.
export const MY_WORK_SECTIONS: readonly MyWorkSection[] = ["TO_CHECK", "LATE", "TODAY", "THIS_WEEK", "LATER", "OPEN", "NO_DATE"];

export const MY_WORK_WORDS: Readonly<Record<MyWorkSection, string>> = {
  TO_CHECK: "To check",
  LATE: "Late",
  TODAY: "Today",
  THIS_WEEK: "This week",
  LATER: "Later",
  OPEN: "Open",
  NO_DATE: "No date",
};
export const MY_WORK_EMPTY_WORDS = "Nothing on you.";

export interface MyWorkFacts {
  status: WorkStatus;
  raisedBy: Party;
  assignee: Party | null;
  dueOn: Day | null;
}

/// The group an item sits in for this reader, or null when it is not on them.
export function myWorkGroup(item: MyWorkFacts, me: { personId: string }, today: Day | null): MyWorkSection | null {
  const assigned = personIdOf(item.assignee) === me.personId && OPEN_STATUSES.includes(item.status);
  const toCheck = personIdOf(item.raisedBy) === me.personId && item.status === "IN_REVIEW";
  if (toCheck) return "TO_CHECK";
  if (!assigned) return null;
  if (item.dueOn === null) return "NO_DATE";
  if (today === null) return "OPEN";
  if (item.dueOn < today) return "LATE";
  if (item.dueOn === today) return "TODAY";
  return item.dueOn <= dayPlus(today, 6) ? "THIS_WEEK" : "LATER";
}

/// WR-5: the contract statuses in which Work is open, read from the WORK_ITEM row of the act x status table (never a list written here), so a table change moves My work with it.
export const WORK_OPEN_CONTRACT_STATUSES: readonly ContractStatus[] = CONTRACT_STATUSES.filter((s) => actStatusFault("WORK_ITEM", s) === null);

/// What is on me, apart from where its contract stands: assigned to me and open, or raised by me and In review.
export const onMeWhere = (me: { personId: string }): { OR: Record<string, unknown>[] } => ({
  OR: [{ assigneePersonId: me.personId, status: { in: [...OPEN_STATUSES] } }, { raisedByPersonId: me.personId, status: "IN_REVIEW" }],
});

/// The same rule as a Prisma `WorkItemWhereInput`, as plain data; the loader adds the organisation. Items on a contract where Work is shut are not on the to-do list (they stay on the contract's Work tab, read only).
export const myWorkWhere = (me: { personId: string }): { AND: Record<string, unknown>[] } => ({
  AND: [onMeWhere(me), { contract: { status: { in: [...WORK_OPEN_CONTRACT_STATUSES] } } }],
});

/// My work's address: `/my-work?contract={id}&item=RFI-12`. The contract is in it because two contracts can each hold an RFI 1.
export interface MyWorkAddress {
  contract: string | null;
  item: string | null;
}
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";

/// An item without its contract, or a word that is not a reference, names nothing.
export function parseMyWorkAddress(sp: Params): MyWorkAddress {
  const contract = one(sp.contract);
  const item = one(sp.item);
  const ok = contract !== "" && contract.length <= 100 && parseItemRef(item) !== null;
  return { contract: ok ? contract : null, item: ok ? item : null };
}

export const myWorkHref = (a: { contract: string; item: string } | null): string =>
  a ? `/my-work?${new URLSearchParams({ contract: a.contract, item: a.item }).toString()}` : "/my-work";
