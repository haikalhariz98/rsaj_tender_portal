import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { ON_BEHALF_HINT } from "@/lib/documents/labels";

import { discardPortalApplication } from "../../actions";

/**
 * Set an online application aside. The reason is the officer's own words and is kept on the audit row;
 * the applicant's details are erased with it, so the reason must not repeat them.
 */
export function DiscardOnlineApplicationDrawer({ id, reference, people }: { id: string; reference: string; people: { value: string; label: string }[] }) {
  const fields: Field[] = [
    { kind: "hidden", name: "portalApplicationId" },
    { kind: "select", name: "recordedByPersonId", label: "Set aside by", required: true, placeholder: "Choose", options: people, hint: ON_BEHALF_HINT },
    { kind: "note", text: "The applicant's details are erased when it is set aside. Do not repeat them in the reason: the reason stays on the record." },
  ];
  return (
    <RecordEditor
      title={`Set aside online application ${reference}`}
      description="Use this for an application that is not a real company, a copy of one already sent, or one the office will not take. It is not shown to the applicant, who is not told."
      fields={fields}
      values={{ portalApplicationId: id }}
      destructive={{ reasonLabel: "Why it is set aside" }}
      action={discardPortalApplication}
      submitLabel="Set it aside"
      cancelLabel="Keep it waiting"
      trigger={{ label: "Set aside", className: buttonClass("secondary", "md"), ariaLabel: `Set aside online application ${reference}` }}
    />
  );
}
