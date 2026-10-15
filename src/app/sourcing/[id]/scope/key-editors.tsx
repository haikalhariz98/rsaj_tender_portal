import { RecordEditor, type Field } from "@/components/record-editor";
import { Blocked } from "@/components/ui/blocked";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { rekeyExercise, setOfficerShare } from "./key-actions";

/**
 * The drawers of the key ceremony (ADR 0036 D3, D4, D11; build plan step 8). Fields are data; every rule sits in the actions and the pure checks behind them
 * (`shareFaults`, `rekeyRefusals`), and the control is disabled with that rule's reason where it already says no.
 */

type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");

/// An officer sets their own share. The passphrase is typed twice and is never the sign-in password; the sign-in password is asked as well.
export function SetShareDrawer({ exerciseId, allowed, minLength, again }: { exerciseId: string; allowed: Allowed; minLength: number | null; again: boolean }) {
  const label = again ? "Set my share again" : "Set my share";
  if (!allowed.allowed) return <Blocked label={label} reason={allowed.reason} />;
  return (
    <RecordEditor
      title={again ? "Set your share again" : "Set your share"}
      description={`Choose an unseal passphrase. It protects your part of this exercise's key, and it is asked each time you help open the bids. It must not be your sign-in password${minLength ? `, and it must be at least ${minLength} characters` : ""}. Nobody can reset it or recover it: every named officer is needed to open the bids, so a forgotten passphrase means the key is made again before any bid is submitted, and the exercise is re-tendered after one.`}
      fields={[
        hidden("exerciseId"),
        { kind: "text", name: "passphrase", label: "Unseal passphrase", required: true, secret: true },
        { kind: "text", name: "repeat", label: "The same passphrase again", required: true, secret: true },
        actorField("OfficerExerciseKey.person", { name: "personId" }),
      ]}
      values={{ exerciseId }}
      action={setOfficerShare}
      submitLabel="Set my share"
      trigger={{ label, className: again ? secondary : primary }}
      size="md"
    />
  );
}

/// A named officer changes the key of a published exercise, before any bid and before the closing, with a reason.
export function ChangeKeyDrawer({ exerciseId, allowed }: { exerciseId: string; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Change the key" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Change the exercise key"
      description="A new key is made across the officers' current shares. The old key and every share of it are destroyed, and any file a supplier has uploaded but not yet submitted is discarded and recorded (the supplier is not yet told why on its own page: that comes with the supplier screens). The change is recorded with its reason and listed here. It is refused once a bid exists or the closing has passed."
      fields={[hidden("exerciseId"), { kind: "textarea", name: "reason", label: "Why the key is changed", required: true }, actorField("PublishedKeyChange.by", { name: "personId" })]}
      values={{ exerciseId }}
      action={rekeyExercise}
      submitLabel="Change the key"
      trigger={{ label: "Change the key", className: secondary }}
      size="md"
    />
  );
}
