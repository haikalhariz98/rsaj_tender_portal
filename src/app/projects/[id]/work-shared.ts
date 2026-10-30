import type { DrawerSize } from "@/components/ui/drawer";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import type { Words } from "@/lib/contract/labels";
import { fieldFaultText, IMPACT_WORDS, PRIORITY_WORDS, READ_ONLY_WORDS, RESULT_WORDS, SEVERITY_WORDS, STATUS_WORDS, TYPE_WORDS, whoCanWords, type WhoNames } from "@/lib/work/labels";
import { mayEdit } from "@/lib/work/fields";
import { isOpen } from "@/lib/work/move";
import type { WorkActor, WorkItemFacts } from "@/lib/work/types";

/// What the Work tab says when the contract is not open to work: a terminated or closed contract is read only; one not yet executed says what it waits for (the act table's words).
export function closedWords(status: ContractStatus): string {
  const fault = actStatusFault("WORK_ITEM", status);
  return !fault ? "" : fault.code === "CONTRACT_TERMINATED" || fault.code === "CONTRACT_CLOSED" ? READ_ONLY_WORDS.en : actStatusText(fault);
}

/// Why a reader cannot change a field of an item, or undefined when they can: the contract is shut, the item is closed, or they are not its raiser, assignee or lead (W-3).
export function editWhy(i: { open: boolean; contractStatus: ContractStatus }, item: WorkItemFacts, actor: WorkActor, who: WhoNames): string | undefined {
  if (!i.open) return closedWords(i.contractStatus);
  if (!isOpen(item.status)) return fieldFaultText({ code: "CLOSED_ITEM" });
  return mayEdit(item, actor) ? undefined : whoCanWords("EDIT", who).en;
}

// ------------------------------------------------------------------ the dropdowns' options, in the order their words are declared

const optionsOf = (words: Readonly<Record<string, Words>>) => Object.entries(words).map(([value, w]) => ({ value, label: w.en }));
export const TYPE_OPTIONS = optionsOf(TYPE_WORDS);
export const PRIORITY_OPTIONS = optionsOf(PRIORITY_WORDS);
export const IMPACT_OPTIONS = optionsOf(IMPACT_WORDS);
export const RESULT_OPTIONS = optionsOf(RESULT_WORDS);
export const SEVERITY_OPTIONS = optionsOf(SEVERITY_WORDS);
export const STATUS_OPTIONS = optionsOf(STATUS_WORDS);
/// The types a quick-add row can raise from a title alone (the others need a due date or a severity).
export const QUICK_TYPES = TYPE_OPTIONS.filter((t) => ["TASK", "ACTION", "INSPECTION", "DEFECT"].includes(t.value));

/// The item panel's width, and the padding that keeps the list clear of it from `xl` up (the panel is fixed to the right edge). One size, so the panel, its skeleton and the
/// list's padding cannot disagree; `work-shared.test.ts` holds the padding to the size's width.
export const WORK_PANEL_SIZE: DrawerSize = "md";
export const WORK_PANEL_PAD = "xl:pr-[34rem]";

/// WB-2: the confirm before a share or a contractor assignment posts. The same words wherever it is asked.
/// `noAccount`: the contractor has no active portal account, so it would not be told and could not reply; the box says so before the officer presses Share.
export const shareConfirmWords = (contractor: string, noAccount = false) => ({
  question: `Share with ${contractor}?`,
  words: `${contractor} will see this item, its replies and files added from now. This can't be undone.${noAccount ? ` ${contractor} has no active portal account: it won't be told or able to reply.` : ""}`,
});
