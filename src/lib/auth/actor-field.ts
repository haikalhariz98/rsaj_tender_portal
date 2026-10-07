import { slotOf } from "./act-slots";

/**
 * The form field that says who is acting, for an act (ADR 0034 D12, Phase 2b). The label, whether the act is signed with the password and whether it may
 * be recorded from paper all come from the act's slot in the registry, so a screen cannot ask for more or less than the registry says.
 *
 *   actorField("ApprovalStep.decidedBy", { name: "personId", people, dateField: "decidedOn", backdate: people })
 *
 * The people it takes are the choices for the person an act is recorded for, and for the officer who authorises back-dating. They are offered only where the
 * slot allows them: a slot that is the actor's own gets no picker, whatever is passed.
 */

export interface PersonOption {
  value: string;
  label: string;
  /// Shown greyed with its reason in the label, as a select's disabled option is: someone who cannot do the act, and why.
  disabled?: boolean;
}

export interface ActorFieldSpec {
  /// The person's own field: where the attested person is posted.
  name: string;
  label: string;
  /// The act is signed with the password.
  signature?: boolean;
  /// The act may be recorded from paper for someone else, from these people.
  onBehalf?: PersonOption[];
  /// The signed act may be dated earlier than today, as a recorded exception authorised by one of these people.
  backdate?: PersonOption[];
  hint?: string;
  /// The form names the person the act is about (the originator of a variation, who reviewed it): a picker, with the signed-in person offered first. Chosen as
  /// another, the act is recorded for them from a paper record and the paper's reference or the reason is asked. `optional` lets it stay blank (no such act).
  named?: { options: PersonOption[]; optional: boolean };
  /// The act is for this person (a panel member's authorisation, one button each): signed by them where they are the one signed in, and otherwise recorded
  /// for them from paper, which is then the only way (the person is fixed, not chosen).
  forPerson?: { id: string; name: string };
}

export function actorField(
  slotKey: string,
  opts: {
    name: string;
    people?: PersonOption[];
    label?: string;
    hint?: string;
    /// The form dates the act: a signed act may then be back-dated as an exception.
    dated?: boolean;
    /// This act is the signed-in person's own although its slot may be recorded from paper elsewhere: offers no picker.
    paper?: boolean;
    forPerson?: { id: string; name: string };
    /// The form names the person the act is about: a picker (the act's `namesSubject`), blank allowed where `optional`.
    named?: { optional?: boolean };
  },
): { kind: "actor" } & ActorFieldSpec {
  const dot = slotKey.indexOf(".");
  const slot = slotOf(slotKey.slice(0, dot), slotKey.slice(dot + 1));
  if (!slot) throw new Error(`"${slotKey}" is not an act slot (src/lib/auth/act-slots.ts).`);
  return {
    kind: "actor",
    name: opts.name,
    label: opts.label ?? slot.label,
    ...(slot.signatureClass ? { signature: true } : {}),
    ...(slot.onBehalf && opts.people && opts.paper !== false ? { onBehalf: opts.people } : {}),
    ...(opts.forPerson ? { forPerson: opts.forPerson } : {}),
    ...(opts.named && slot.onBehalf ? { named: { options: opts.people ?? [], optional: opts.named.optional ?? false } } : {}),
    ...(opts.dated && opts.people && slot.signatureClass ? { backdate: opts.people.filter((p) => !p.disabled).map(({ value, label }) => ({ value, label })) } : {}),
    ...(opts.hint ? { hint: opts.hint } : {}),
  };
}
