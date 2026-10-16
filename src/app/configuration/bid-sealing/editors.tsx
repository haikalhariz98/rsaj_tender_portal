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
      description="Online sealed bids are off until this is set. Live bids need every condition below to be recorded, and each is checked again when a second person decides the change."
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
          hint: "A demonstration exercise never becomes a live one. Live needs every reference and attestation below, a malware scanner and the sealing pepper.",
        },
        { kind: "text", name: "cryptoReviewReference", label: "The outside cryptography review (reference)", hint: "Leave empty if it is not recorded." },
        { kind: "text", name: "procedureAmendmentReference", label: "The amendment of the bid procedure (reference)", hint: "The amendment that allows bids to be received online." },
        { kind: "text", name: "customerAcceptanceReference", label: "The organisation's written acceptance of the limits (reference)", hint: "Naming that who bid is not hidden from a person who can query the database, and that the company estimate figure is held unencrypted in the database and its backups until the opening, so backups must be encrypted and their custody recorded." },
        { kind: "textarea", name: "publicRoleAttestation", label: "The public copy's database role, attested", hint: "Attested, not checked by the portal. State what was checked and by whom. You are recorded as the person who attests." },
        { kind: "textarea", name: "hardeningAttestation", label: "The deployment's hardening, attested", hint: "Attested, not checked by the portal: no core dumps or swap, HTTPS only, no logging of request bodies, and an edge header and body read timeout, with a maximum body size no larger than the largest part rule. You are recorded as the person who attests." },
        {
          kind: "select",
          name: "provenance",
          label: "Where this comes from",
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
