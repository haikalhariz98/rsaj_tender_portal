"use client";

import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { recordSupplyPayment } from "./supply-actions";

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
