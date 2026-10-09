import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { confirmBackdatingAction } from "../actions";

/// The confirmation of a back-dating is a signature of the person named: the password is asked again, every time.
export function ConfirmBackdating({ attributionId, signerName, whatWords, effectiveOn }: { attributionId: string; signerName: string; whatWords: string; effectiveOn: string }) {
  return (
    <RecordEditor
      title="Confirm the back-dating"
      description={`You confirm that you authorised ${signerName} to date “${whatWords}” ${effectiveOn}. This is your signature: it is recorded with your name, the time, and the act it confirms.`}
      fields={[{ kind: "hidden", name: "attributionId" }, actorField("BackdateConfirmation.confirmedBy", { name: "personId" })]}
      values={{ attributionId }}
      action={confirmBackdatingAction}
      submitLabel="Confirm"
      trigger={{ label: "Confirm the back-dating", className: buttonClass("primary", "md") }}
      size="md"
    />
  );
}
