import { RecordEditor } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { saveBidSealingPolicy } from "./actions";

/**
 * Configuration > Bid sealing drawer. Nothing is defaulted: the switch ships unset, and a reference or an attestation left empty is "not recorded". The two attestations
 * are facts about the deployment that the portal cannot check, so the form says so (ADR 0036 D1, ruling 20v).
 */
export function EditBidSealingPolicy({ values }: { values: Record<string, string> }) {
  return (
    <RecordEditor
      title="Edit the bid sealing policy"
      description="Online sealed bids stay off until set. Each condition is rechecked at decision."
      columns={1}
      fields={[
        { kind: "hidden", name: "attestedByPersonId" },
        {
          kind: "select",
          name: "onlineSubmission",
          label: "Online submission of bids",
          placeholder: "Not set",
          options: [
            { value: "DEMONSTRATION", label: "Demonstration: bids taken online are not for real tenders" },
            { value: "LIVE", label: "Live: bids taken online are real" },
            { value: "unset", label: "Not set: no exercise can be published for online bids" },
          ],
          hint: "Live needs attestations, scanner and pepper.",
        },
        { kind: "text", name: "cryptoReviewReference", label: "The outside cryptography review (reference)", hint: "Leave empty if it is not recorded." },
        { kind: "text", name: "procedureAmendmentReference", label: "The amendment of the bid procedure (reference)", hint: "The amendment allowing online bids." },
        { kind: "text", name: "customerAcceptanceReference", label: "The organisation's written acceptance of the limits (reference)", hint: "Attested: names visible to database access." },
        { kind: "note", text: "Accepted: who bid is not hidden from a person who can query the database, and the company estimate is held unencrypted in the database and its backups until the opening, so backups must be encrypted and their custody recorded." },
        { kind: "textarea", name: "publicRoleAttestation", label: "The public copy's database role, attested", hint: "Attested, not checked. State what and by whom." },
        { kind: "textarea", name: "hardeningAttestation", label: "The deployment's hardening, attested", hint: "Attested, not checked by the portal." },
        // A must-have (ruling 20ai): the widened attested wording stays whole, as a note rather than a hint.
        { kind: "note", text: "Hardening attested: no core dumps or swap, HTTPS only, no logging of request bodies, and an edge header and body read timeout, with a maximum body size no larger than the largest part rule." },
        {
          kind: "select",
          name: "provenance",
          label: "Basis",
          placeholder: "Not set",
          options: [
            { value: "STATED", label: "Stated: written in a governing document" },
            { value: "OBSERVED", label: "Observed: seen in practice" },
            { value: "ASSUMED", label: "Assumed: a working default, needs sign-off" },
          ],
        },
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={values}
      reason={{ label: "Why the policy is changed" }}
      action={saveBidSealingPolicy}
      submitLabel="Propose"
      trigger={{ label: "Edit the policy", className: buttonClass("primary", "sm") }}
      size="lg"
    />
  );
}
