import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

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
      description="The step goes one level up, to the office the acting office escalates to, and the reason goes on the trail. It never passes down. Nobody is notified: the step appears under the new office on Awaiting decision."
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
        {
          kind: "select",
          name: "declaredByPersonId",
          label: "Declared by",
          required: true,
          placeholder: "Choose",
          options: people,
          hint: "Someone who could decide the step. Recorded on their behalf, not signed; they cannot decide it afterwards.",
        },
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
