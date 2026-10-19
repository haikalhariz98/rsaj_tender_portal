import { RecordEditor, type Field } from "@/components/record-editor";
import { Blocked } from "@/components/ui/blocked";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { checkUnlock, rekeyExercise, setOfficerShare } from "./key-actions";
import { releaseShareForSubstitution } from "./substitution-actions";

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
      description="Needed to open the bids. Not your sign-in password. Cannot be recovered."
      more="Every named officer is needed to open the bids. If one forgets, the key is made again before any bid is submitted, and the exercise is re-tendered after one. Nobody can reset it."
      fields={[
        hidden("exerciseId"),
        { kind: "text", name: "passphrase", label: "Unseal passphrase", required: true, secret: true, hint: minLength ? `At least ${minLength} characters` : undefined },
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

/// A named officer checks, before the opening, that their passphrase still unlocks their key (ADR 0036 D4). Nothing is opened and no share is released; a wrong entry is counted on the key's own lockout.
export function CheckUnlockDrawer({ exerciseId }: { exerciseId: string }) {
  return (
    <RecordEditor
      title="Check that I can still unlock my key"
      description="Opens nothing. Wrong entries are counted and lock your key. Check once."
      more="If you have forgotten it, say so now: it cannot be recovered, and the key must then be made again."
      fields={[hidden("exerciseId"), { kind: "text", name: "passphrase", label: "Unseal passphrase", required: true, secret: true }, actorField("OfficerExerciseKey.person", { name: "personId" })]}
      values={{ exerciseId }}
      action={checkUnlock}
      submitLabel="Check my passphrase"
      trigger={{ label: "Check I can still unlock", className: secondary }}
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
      description="Destroys the old key and shares. Refused once a bid exists."
      more="A backup taken before now still holds the old key and could be opened with the officers' passphrases. Unsubmitted supplier uploads are discarded and recorded. Suppliers are not yet told why. The change is recorded with its reason."
      fields={[hidden("exerciseId"), { kind: "textarea", name: "reason", label: "Why the key is changed", required: true }, actorField("PublishedKeyChange.by", { name: "personId" })]}
      values={{ exerciseId }}
      action={rekeyExercise}
      submitLabel="Change the key"
      trigger={{ label: "Change the key", className: secondary }}
      size="md"
    />
  );
}

/// The departing officer of a substitution releases their share to the incoming officer (ADR 0036 D11, ruling 11). Both the sign-in password and the unseal passphrase are asked, and nothing is remembered.
export function ReleaseShareDrawer({ exerciseId, to, allowed }: { exerciseId: string; to: string; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Release my share" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Release your share to ${to}`}
      description={`Hands your share to ${to}. If not done before closing, the exercise must be re-tendered.`}
      more="You were replaced as an opening officer. Your live copy is then destroyed. A backup taken before now still holds it, and could be opened with your passphrase and every other officer's. Nobody else can do this for you."
      fields={[hidden("exerciseId"), { kind: "text", name: "passphrase", label: "Unseal passphrase", required: true, secret: true }, actorField("ShareRelease.releasedBy", { name: "personId" })]}
      values={{ exerciseId }}
      action={releaseShareForSubstitution}
      submitLabel="Release my share"
      trigger={{ label: "Release my share", className: primary }}
      size="md"
    />
  );
}
