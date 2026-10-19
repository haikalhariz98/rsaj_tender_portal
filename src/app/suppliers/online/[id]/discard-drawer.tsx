import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { discardPortalApplication } from "../../actions";

/**
 * Set an online application aside. The reason is the officer's own words and is kept on the audit row;
 * the applicant's details are erased with it, so the reason must not repeat them.
 */
export function DiscardOnlineApplicationDrawer({ id, reference, people }: { id: string; reference: string; people: { value: string; label: string }[] }) {
  const fields: Field[] = [
    { kind: "hidden", name: "portalApplicationId" },
    actorField("PortalApplication.decidedBy", { name: "recordedByPersonId", label: "Set aside by", people }),
    { kind: "note", text: "The applicant's details are erased when it is set aside. Do not repeat them in the reason: the reason stays on the record." },
  ];
  return (
    <RecordEditor
      title={`Set aside online application ${reference}`}
      description="For a non-company, a duplicate or one not taken. The applicant is not told."
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
