import { actFieldNames } from "./act-field-names";
import type { ActSlot } from "./act-slots";
import type { Fault } from "./types";

/**
 * What a form says about who did an act, judged (ADR 0034 D12, Phase 2b, closes F1). Pure: the form is read by `src/app/_auth/act.ts`, the only place
 * an actor's person is read from a request, and this decides what it means.
 *
 * The actor is always the signed-in person, from the session. A person the form names is only ever the *attested* person of an act recorded on their
 * behalf from a paper record (`onBehalf`), and only for a slot that may be (`ActSlot.onBehalf`). A form that names a person without saying so is not
 * believed: the act is the signed-in person's own, and the name is ignored.
 *
 * A loader run (a demo loader: no person is signed in) attests the person its data names, for every slot, recorded by the system by label.
 *
 * Dating: the server stamps the time of an act (`at`). A signature-class act, signed, is dated today; to date it earlier is a recorded exception with its
 * reason and the person who authorised it (NFR-AUD-005 and 006). An ordinary act's day is a fact the officer reports (a check done last week, entered
 * now), and it is theirs to date. An act recorded from paper is dated the day the paper says, which is the point of the paper.
 */

export interface ActForm {
  /// The form said this act is recorded from paper for someone else.
  onBehalf: boolean;
  /// The person the form names for the slot: the attested person where `onBehalf`, and ignored otherwise.
  attestedPersonId: string | null;
  paperReference: string;
  reason: string;
  /// The password typed for a signature.
  password: string;
  /// The day the form dates the act (YYYY-MM-DD), where the act is dated.
  claimedDay: string | null;
  /// The form said this signed act is dated earlier than today.
  backdate: boolean;
  backdateReason: string;
  backdateAuthorisedByPersonId: string | null;
}

export interface ActIntent {
  mode: "SIGNED" | "RECORDED_ON_BEHALF";
  /// The person the act is attributed to: the actor for a signed act, the attested person for one recorded on someone's behalf.
  subjectPersonId: string;
  paperReference: string;
  reason: string;
  /// The password must be asked for this act (a signature-class act, signed).
  passwordRequired: boolean;
  /// The day the act is dated: today for a signed act, unless it is back-dated; the paper's day for one recorded from paper. Null where the act is not dated.
  day: string | null;
  /// Stored on the attribution where the day is the paper's, or the act is back-dated.
  effectiveOn: string | null;
  backdate: { reason: string; authorisedByPersonId: string } | null;
}

export type ActInterpretation = { ok: true; intent: ActIntent } | { ok: false; faults: ActFault[] };

/// A fault with the form field it belongs on, where there is one.
export interface ActFault extends Fault {
  field?: "onBehalf" | "person" | "paperReference" | "reason" | "password" | "date" | "backdateReason" | "backdateAuthorisedBy";
}

const f = (code: string, en: string, ms: string, field?: ActFault["field"]): ActFault => ({ code, en, ms, field });

export function interpretAct(input: {
  slot: Pick<ActSlot, "signatureClass" | "onBehalf">;
  /// The signed-in person, or null in a loader run.
  actorPersonId: string | null;
  /// The loader's label where no person is signed in.
  systemLabel?: string | null;
  /// The organisation's today (YYYY-MM-DD), or null while its time zone is unset.
  today: string | null;
  /// The act is dated by its form (it has a date field): recorded from paper, the paper's day is then required.
  dated?: boolean;
  form: ActForm;
}): ActInterpretation {
  const { slot, form, today } = input;
  const faults: ActFault[] = [];
  const claimed = form.claimedDay?.trim() || null;

  // A loader run: nobody is signed in, and the data names who did each act. Recorded by the system, which says what it is.
  if (input.actorPersonId == null) {
    if (!form.attestedPersonId) {
      return { ok: false, faults: [f("ATTESTED_REQUIRED", "Name the person the act is recorded for.", "Namakan orang yang untuknya tindakan ini direkodkan.", "person")] };
    }
    return {
      ok: true,
      intent: {
        mode: "RECORDED_ON_BEHALF",
        subjectPersonId: form.attestedPersonId,
        paperReference: form.paperReference.trim(),
        reason: form.reason.trim() || input.systemLabel?.trim() || "loader",
        passwordRequired: false,
        day: claimed,
        effectiveOn: claimed,
        backdate: null,
      },
    };
  }

  if (form.onBehalf) {
    if (!slot.onBehalf) {
      faults.push(
        f(
          "ON_BEHALF_NOT_ALLOWED",
          "This act is the signed-in person's own: it cannot be recorded for someone else.",
          "Tindakan ini milik orang yang log masuk: ia tidak boleh direkodkan bagi pihak orang lain.",
          "onBehalf",
        ),
      );
    }
    if (!form.attestedPersonId) {
      faults.push(f("ATTESTED_REQUIRED", "Name the person the act is recorded for.", "Namakan orang yang untuknya tindakan ini direkodkan.", "person"));
    } else if (form.attestedPersonId === input.actorPersonId) {
      faults.push(
        f(
          "ON_BEHALF_OF_SELF",
          "An act recorded on someone's behalf is recorded for another person. To act as yourself, sign it.",
          "Tindakan yang direkodkan bagi pihak seseorang direkodkan untuk orang lain. Untuk bertindak sebagai diri sendiri, tandatanganinya.",
          "person",
        ),
      );
    }
    if (form.paperReference.trim() === "" && form.reason.trim() === "") {
      faults.push(
        f(
          "PAPER_OR_REASON_REQUIRED",
          "Recording an act on someone's behalf needs the paper it came from or the reason it is recorded.",
          "Merekodkan tindakan bagi pihak seseorang memerlukan kertas asalnya atau sebab ia direkodkan.",
          "paperReference",
        ),
      );
    }
    if (input.dated && !claimed) {
      faults.push(f("DATE_REQUIRED", "Say the day the paper is dated.", "Nyatakan tarikh pada kertas itu.", "date"));
    } else if (claimed && today != null && claimed > today) {
      faults.push(f("DATE_IN_FUTURE", "An act cannot be dated after today.", "Tindakan tidak boleh ditarikhkan selepas hari ini.", "date"));
    }
    if (faults.length > 0) return { ok: false, faults };
    return {
      ok: true,
      intent: {
        mode: "RECORDED_ON_BEHALF",
        subjectPersonId: form.attestedPersonId!,
        paperReference: form.paperReference.trim(),
        reason: form.reason.trim(),
        passwordRequired: false,
        day: claimed,
        effectiveOn: claimed,
        backdate: null,
      },
    };
  }

  // The act is the signed-in person's own.
  if (slot.signatureClass && form.password === "") {
    faults.push(f("PASSWORD_REQUIRED", "This act is signed with your password. Enter it to sign.", "Tindakan ini ditandatangani dengan kata laluan anda. Masukkannya untuk menandatangani.", "password"));
  }
  let day: string | null = null;
  let backdate: ActIntent["backdate"] = null;
  let effectiveOn: string | null = null;
  if (claimed != null) {
    if (today == null) {
      faults.push(f("TODAY_UNKNOWN", "The organisation's time zone is not set, so today's date is not known and an act cannot be dated.", "Zon waktu organisasi belum ditetapkan, jadi tarikh hari ini tidak diketahui dan tindakan tidak boleh ditarikhkan.", "date"));
    } else if (claimed > today) {
      faults.push(f("DATE_IN_FUTURE", "An act cannot be dated after today.", "Tindakan tidak boleh ditarikhkan selepas hari ini.", "date"));
    } else if (claimed < today && !slot.signatureClass) {
      // The day of an ordinary act is a fact the officer reports (a check done last week, entered now): it is theirs to date, and the server's own stamp is `at`.
      day = claimed;
    } else if (claimed < today) {
      if (!form.backdate) {
        faults.push(
          f(
            "BACKDATE_NEEDED",
            "A signed act is dated today. To date it earlier, say that it is back-dated, why, and who authorised it.",
            "Tindakan yang ditandatangani bertarikh hari ini. Untuk mentarikhkannya lebih awal, nyatakan ia dibertarikh lalu, sebabnya dan siapa yang membenarkannya.",
            "date",
          ),
        );
      } else {
        if (form.backdateReason.trim() === "") faults.push(f("BACKDATE_REASON_REQUIRED", "Dating an act earlier than today needs the reason.", "Mentarikhkan tindakan lebih awal daripada hari ini memerlukan sebabnya.", "backdateReason"));
        if (!form.backdateAuthorisedByPersonId) {
          faults.push(f("BACKDATE_AUTHORISER_REQUIRED", "Dating an act earlier than today needs the officer who authorised it.", "Mentarikhkan tindakan lebih awal daripada hari ini memerlukan pegawai yang membenarkannya.", "backdateAuthorisedBy"));
        } else if (form.backdateAuthorisedByPersonId === input.actorPersonId) {
          faults.push(f("BACKDATE_SELF_AUTHORISED", "Dating an act earlier than today is authorised by someone other than the person who records it.", "Mentarikhkan tindakan lebih awal daripada hari ini dibenarkan oleh orang lain selain yang merekodkannya.", "backdateAuthorisedBy"));
        }
        if (faults.length === 0) {
          backdate = { reason: form.backdateReason.trim(), authorisedByPersonId: form.backdateAuthorisedByPersonId! };
          effectiveOn = claimed;
        }
      }
      day = claimed;
    } else {
      day = today;
    }
  } else {
    day = today;
  }
  if (faults.length > 0) return { ok: false, faults };
  return {
    ok: true,
    intent: {
      mode: "SIGNED",
      subjectPersonId: input.actorPersonId,
      paperReference: "",
      reason: "",
      passwordRequired: slot.signatureClass,
      day,
      effectiveOn,
      backdate,
    },
  };
}

/// The faults as a form shows them: one message, keyed by the field it names where it does, else a message of its own. English: the forms are English.
export function actFaultErrors(faults: readonly ActFault[], fields: { person: string; date?: string }): { errors: Record<string, string>; message?: string } {
  const f = actFieldNames(fields.person);
  const names: Record<NonNullable<ActFault["field"]>, string> = {
    onBehalf: f.onBehalf,
    person: fields.person,
    paperReference: f.paperReference,
    reason: f.reason,
    password: f.password,
    date: fields.date ?? "",
    backdateReason: f.backdateReason,
    backdateAuthorisedBy: f.backdateAuthorisedBy,
  };
  const errors: Record<string, string> = {};
  const loose: string[] = [];
  for (const x of faults) {
    const name = x.field ? names[x.field] : "";
    if (name) errors[name] = errors[name] ? `${errors[name]} ${x.en}` : x.en;
    else loose.push(x.en);
  }
  return { errors, message: loose.length > 0 ? loose.join(" ") : undefined };
}
