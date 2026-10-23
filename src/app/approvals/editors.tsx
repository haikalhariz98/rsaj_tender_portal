import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { escalateStep } from "./actions";

/**
 * Escalate a pending person step (FR-APR-009, FR-APR-010): for want of anyone able to
 * act, or on a declared conflict. The step's own office is kept; the office above acts
 * for it, with the reason on the trail.
 */
export function EscalateDrawer({
  stepId,
  office,
  mandatory,
  people,
}: {
  stepId: string;
  /// The office acting for the step now.
  office: string;
  /// A mandatory step is not moved for want of a holder until the organisation rules (CO-6).
  mandatory: boolean;
  people: { value: string; label: string }[];
}) {
  return (
    <RecordEditor
      title={`Escalate the ${office}'s step`}
      description="One level up. Told in the portal. Reason is recorded."
      fields={[
        { kind: "hidden", name: "stepId" },
        {
          kind: "select",
          name: "kind",
          label: "Why",
          required: true,
          placeholder: "Choose",
          options: [
            {
              value: "NO_AVAILABLE_HOLDER",
              label: mandatory ? "Nobody able to act (not for a mandatory step)" : "Nobody able to act",
              disabled: mandatory,
            },
            { value: "CONFLICT_DECLARED", label: "Conflict of interest declared" },
          ],
        },
        actorField("ApprovalStep.declaredBy", { name: "declaredByPersonId", people, hint: "You cannot decide this step afterwards." }),
        { kind: "textarea", name: "reason", label: "Reason", hint: "The conflict, or why nobody can act." },
      ]}
      showWhen={{ declaredByPersonId: { name: "kind", in: ["CONFLICT_DECLARED"] } }}
      values={{ stepId }}
      action={escalateStep}
      submitLabel="Escalate"
      trigger={{ label: "Escalate", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}
