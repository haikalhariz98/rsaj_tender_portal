import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { rejectPortalApplicationAction } from "../../portal-actions";

/**
 * Reject a whole online application (ADR 0041 D7): the reasons as they will be given to the applicant, kept word for word. No supplier is created; reapplying is a new application.
 * Nothing is sent from here. `blocker` says why it cannot be done now (a route is waiting), beside the button.
 */
export function RejectOnlineApplicationDrawer({ id, reference, blocker }: { id: string; reference: string; blocker: string | null }) {
  const fields: Field[] = [{ kind: "hidden", name: "portalApplicationId" }, actorField("PortalApplication.decidedBy", { name: "personId", paper: false, label: "Rejected by" })];
  return (
    <RecordEditor
      title={`Reject online application ${reference}`}
      description="Kept as written. Not sent to the applicant."
      fields={fields}
      values={{ portalApplicationId: id }}
      destructive={{ reasonLabel: "The reasons, as written" }}
      action={rejectPortalApplicationAction}
      submitLabel="Reject"
      cancelLabel="Keep it waiting"
      submitBlock={blocker}
      trigger={{ label: "Reject", className: buttonClass("secondary", "md"), ariaLabel: `Reject online application ${reference}` }}
    />
  );
}
