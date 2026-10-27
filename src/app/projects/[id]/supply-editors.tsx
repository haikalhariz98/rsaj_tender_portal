"use client";

import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { correctSupplyPayment, recordSupplyPayment } from "./supply-actions";

type Option = { value: string; label: string };

/// Finance's payment of a verified supply claim, recorded by hand (WV-13). The person is the signed-in officer unless the slot allows recording for someone else.
export function RecordSupplyPaymentDrawer({ id, documentId, invoiceNo, people, today, blocker }: { id: string; documentId: string; invoiceNo: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title={`Record payment of ${invoiceNo}`}
      description="Finance's payment, once. Nothing is checked against the invoice."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "documentId" },
        { kind: "date", name: "paidOn", label: "Paid on", required: true },
        { kind: "text", name: "batchNo", label: "Batch number", required: true },
        { kind: "money", name: "amount", label: "Amount paid", required: true },
        actorField("SupplyInvoicePayment.person", { name: "personId", people }),
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id, documentId, paidOn: today }}
      action={recordSupplyPayment}
      submitLabel="Record payment"
      submitBlock={blocker}
      trigger={{ label: "Record payment", className: buttonClass("secondary", "sm") }}
    />
  );
}

/// Phase 0.3 item 12: the day, batch and amount as they should read, with why. Kept beside the payment as a correction, never an edit of it.
export function CorrectSupplyPaymentDrawer({ id, documentId, invoiceNo, paidOn, batchNo, amount, blocker }: { id: string; documentId: string; invoiceNo: string; paidOn: string; batchNo: string; amount: string; blocker: string | null }) {
  return (
    <RecordEditor
      title={`Correct payment of ${invoiceNo}`}
      description="Kept as a correction beside the payment, never an edit."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "documentId" },
        { kind: "date", name: "paidOn", label: "Paid on", required: true },
        { kind: "text", name: "batchNo", label: "Batch number", required: true },
        { kind: "money", name: "amount", label: "Amount paid", required: true },
      ]}
      values={{ id, documentId, paidOn, batchNo, amount }}
      action={correctSupplyPayment}
      reason={{ label: "Why is it corrected?" }}
      submitLabel="Save the correction"
      submitBlock={blocker}
      trigger={{ label: "Correct payment", className: buttonClass("ghost", "sm") }}
    />
  );
}
