"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { moreItemClass } from "@/components/ui/more-item-class";
import { actorField } from "@/lib/auth/actor-field";
import { KEYED_FINAL_OPTIONS } from "@/lib/closeout/final-words";

import { addFinalDeduction, closeContract, confirmFinalPayments, linkDeclaration, raiseFinalAccount, recordPackEntry, removeFinalDeduction } from "./final-actions";

/**
 * The drawers of the final account and the close (Phase 2 close-out stage C; plan closeout-plan.md §3.2, §4.6, §4.7). Each posts to its act, which
 * judges it again; a drawer's blocker is the rule's refusal in words. Every known set of values is a dropdown.
 */

export type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const trig = (label: string, menu: boolean, main = false) => ({ label, className: menu ? moreItemClass() : buttonClass(main ? "primary" : "secondary", "sm") });
const by = (slot: string, people: Option[]): Field => actorField(slot, { name: "personId", people });

export function RaiseFinalDrawer({ id, people, blocker }: { id: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise the final account"
      description="Figures come from the issued certificates. Deductions are added while it is a draft."
      fields={[hidden("id"), by("FinalAccount.person", people)]}
      values={{ id }}
      action={raiseFinalAccount}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={trig("Raise the final account", false, true)}
    />
  );
}

export function AddDeductionDrawer({ id, blocker, main }: { id: string; blocker: string | null; main: boolean }) {
  return (
    <RecordEditor
      title="Add a deduction"
      description="A rounding lies between −1.00 and 1.00. At most three other deductions."
      fields={[hidden("id"), { kind: "select", name: "kind", label: "Deduction", required: true, placeholder: "Choose", options: [...KEYED_FINAL_OPTIONS] }, { kind: "text", name: "label", label: "Description", hint: "Needed for another deduction." }, { kind: "text", name: "amount", label: "Amount (RM)", required: true }]}
      values={{ id }}
      action={addFinalDeduction}
      submitLabel="Add"
      submitBlock={blocker}
      trigger={trig("Add a deduction", !main, main)}
    />
  );
}

export function RemoveDeductionDrawer({ id, lines, blocker }: { id: string; lines: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Remove a deduction"
      fields={[hidden("id"), { kind: "select", name: "lineId", label: "Deduction", required: true, placeholder: "Choose", options: lines }]}
      values={{ id }}
      action={removeFinalDeduction}
      submitLabel="Remove"
      danger
      submitBlock={blocker}
      trigger={trig("Remove a deduction", true)}
    />
  );
}

export function PackEntryDrawer({ id, requirements, documents, people, blocker, main }: { id: string; requirements: Option[]; documents: Option[]; people: Option[]; blocker: string | null; main: boolean }) {
  return (
    <RecordEditor
      title="Add to the pack"
      description="Choose the contract's document, or say why it does not apply."
      fields={[
        hidden("id"),
        { kind: "select", name: "requirementId", label: "Document needed", required: true, placeholder: "Choose", options: requirements },
        { kind: "select", name: "projectDocumentId", label: "The contract's document", placeholder: documents.length ? "Choose" : "None on this contract", options: documents },
        { kind: "textarea", name: "notApplicableReason", label: "Or: why it does not apply" },
        by("FinalPackEntry.person", people),
      ]}
      values={{ id }}
      action={recordPackEntry}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={trig("Add to the pack", !main, main)}
    />
  );
}

export function DeclarationDrawer({ id, documents, blocker, main }: { id: string; documents: Option[]; blocker: string | null; main: boolean }) {
  return (
    <RecordEditor
      title="Link the statutory declaration"
      description="The contractor's declaration, sent under Documents and taken up."
      fields={[hidden("id"), { kind: "select", name: "documentId", label: "Statutory declaration", required: true, placeholder: documents.length ? "Choose" : "None taken up", options: documents }]}
      values={{ id }}
      action={linkDeclaration}
      submitLabel="Link"
      submitBlock={blocker}
      trigger={trig("Link the declaration", !main, main)}
    />
  );
}

export function ConfirmFinanceDrawer({ id, people, blocker, main }: { id: string; people: Option[]; blocker: string | null; main: boolean }) {
  return (
    <RecordEditor
      title="Confirm Finance's payments"
      description="What Finance paid on the interim and advance certificates, from its own records."
      fields={[hidden("id"), { kind: "text", name: "total", label: "Total paid (RM)", required: true }, by("FinalAccount.financeConfirmedBy", people)]}
      values={{ id }}
      action={confirmFinalPayments}
      submitLabel="Confirm"
      submitBlock={blocker}
      trigger={trig("Confirm payments", !main, main)}
    />
  );
}

export function CloseContractDrawer({ id, people, blocker }: { id: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Close the contract"
      description="Finance is asked to close the commitment and capitalise the asset."
      fields={[hidden("id"), by("ContractClosure.person", people)]}
      values={{ id }}
      action={closeContract}
      submitLabel="Close"
      submitBlock={blocker}
      trigger={trig("Close the contract", false, true)}
    />
  );
}
