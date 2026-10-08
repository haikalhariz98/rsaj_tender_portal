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
      description="The step goes one level up, to the office the acting office escalates to, and the reason goes on the trail. It never passes down. The people who hold the new office are told in the portal (email is not connected), and the step appears in their My steps. Where reporting lines are recorded, the notice names the immediate superior."
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
              label: mandatory ? "Nobody able to act holds the office — not for a mandatory step until the organisation rules" : "Nobody able to act holds the office",
              disabled: mandatory,
            },
            { value: "CONFLICT_DECLARED", label: "A conflict of interest is declared, and the declarer recuses" },
          ],
        },
        actorField("ApprovalStep.declaredBy", { name: "declaredByPersonId", people, hint: "You declare it, as the person who has the conflict and could decide the step. You cannot decide it afterwards." }),
        { kind: "textarea", name: "reason", label: "Reason", hint: "What the conflict is, or why nobody can act." },
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
