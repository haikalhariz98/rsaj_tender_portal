import { SULIT_FIELDS, SULIT_SCOPES, type SulitScope } from "@/lib/sulit-fields";

import { holds, type PermissionState } from "./permissions";
import { ROUTED_NAMED_WORDS } from "./routed-people";
import type { Words } from "./words";

/**
 * Who may read a SULIT value (ADR 0034 D14, sign-in programme Phase 3a). Pure: the facts are read by `sulit-store.ts` and handed in.
 *
 * One rule, `sulitAccess(actor, ctx, field)`, and it grants when the actor is not an administrator and one of two things is true:
 *
 * 1. the actor is NAMED ON THE RECORD the value belongs to (each scope has its own resolver, below);
 * 2. the actor holds `sulit.read.organisation` and the record is not a restricted exercise.
 *
 * Two scopes keep no list of who is named on them as a whole (a contract, a supplier), so for those the permission is the only way in, and it is undecided until
 * the organisation decides: refused, and said to be undecided rather than withheld. A requisition names its requester and the people who decide its route, and the people who decide
 * a contract matter's route read that matter's amount and nothing else of the contract (ruling of 2026-10-08, the amendment of the ruling on log line 1526).
 *
 * - An administrator is always refused, even one who is somehow named: administration is kept apart from transactions (D9).
 * - A restricted exercise (FR-MTD-007) admits only the people named on it. The organisation-wide permission never opens it.
 * - A loader run (the demo loaders, `actor.system`) is not a person and reads no SULIT value through the screens: refused.
 * - The sealed company estimate is not decided here. It stays sealed whoever is signed in (ADR 0012) and, once disclosed, is read only by
 *   those in its custody (`estimateFigureAccess`, FR-EST-008).
 *
 * Every state carries the reason in words, in both languages, so that "withheld" never reads as one thing: not named, undecided, withheld
 * from the role, an administrator, a restricted exercise, sealed, or a custody the organisation has not set. No code reaches a screen.
 */

// ------------------------------------------------------------------ the decision

/// Why a value was shown. Stored on the access event, so it is a closed list the table's CHECK holds (`SULIT_GRANT_BASES`).
/// SECRETARIAT_OFFICE and INTERNAL_AUDIT_OFFICE (ruling of 2026-10-08 on log lines 1735 and 1736): the reader holds the office the organisation names as the Secretariat, or as Internal Audit, for evaluations.
export const SULIT_GRANT_BASES = ["NAMED_ON_RECORD", "ORGANISATION_PERMISSION", "IN_CUSTODY", "SECRETARIAT_OFFICE", "INTERNAL_AUDIT_OFFICE"] as const;
export type SulitGrantBasis = (typeof SULIT_GRANT_BASES)[number];

/// Why a value was withheld.
export const SULIT_REFUSAL_BASES = [
  /// An administrator account is never entitled to a SULIT value.
  "ADMINISTRATOR",
  /// A loader run is not a person.
  "NOT_A_PERSON",
  /// The exercise is restricted and the actor is not named on it.
  "RESTRICTED_NOT_NAMED",
  /// Not named, and the organisation has not decided who holds `sulit.read.organisation`.
  "NOT_NAMED_PERMISSION_UNDECIDED",
  /// Not named, and the organisation has withheld the permission from a role the person holds.
  "NOT_NAMED_PERMISSION_WITHHELD",
  /// Not named, and the permission is granted to a role the person holds only for a department.
  "NOT_NAMED_PERMISSION_SCOPED",
  /// Not named, and the person holds no role the permission is granted to.
  "NOT_NAMED_PERMISSION_NOT_HELD",
  /// The field is not on the registry, or not for the kind of record in hand: nothing is shown on a guess.
  "FIELD_NOT_FOR_THIS_RECORD",
  /// The company estimate, before it is disclosed at the opening.
  "SEALED",
  /// The company estimate is disclosed, and the organisation has not set who holds its copies.
  "CUSTODY_NOT_SET",
  /// The company estimate is disclosed, and the person is not in its custody.
  "NOT_IN_CUSTODY",
  /// The company estimate is disclosed, and the organisation's day is not known (no time zone is set), so the offices in force are not known.
  "CUSTODY_DAY_UNKNOWN",
  /// The access could not be written to the log, so nothing is shown (NFR-AUD-004): never stored, since the write is what failed.
  "NOT_LOGGED",
] as const;
export type SulitRefusalBasis = (typeof SULIT_REFUSAL_BASES)[number];

/// The refusal that is never written, because the write is what failed.
export const NEVER_STORED_BASES: readonly SulitRefusalBasis[] = ["NOT_LOGGED"];

export type SulitDecision = { state: "GRANTED"; basis: SulitGrantBasis } | { state: "WITHHELD"; basis: SulitRefusalBasis };

/// A SULIT value as a loader hands it on: the value, or the reason there is none. The value is absent from a withheld one, so a
/// screen that forgets to ask cannot print it, and a server action cannot return it.
export type Sulit<T> = { state: "GRANTED"; value: T; basis: SulitGrantBasis } | { state: "WITHHELD"; basis: SulitRefusalBasis; scope: SulitScope | "estimate"; words: Words };

// ------------------------------------------------------------------ who is named

/// The people a sourcing exercise names, read as ids. An exercise's roster is the list people were put on for it.
export interface ExerciseNamedFacts {
  /// "Name a participant": the list FR-MTD-007 restricts to.
  participantIds: readonly string[];
  personInChargeId: string | null;
  proposalReviewerId: string | null;
  evaluationTeamIds: readonly string[];
  openingPanelIds: readonly string[];
  /// Named by what the exercise's routes and sittings say, worked out when read and never kept as a list (product owner, 2026-10-08, ruling on log line 1711; ADR 0034 D14):
  /// those able to decide a step that is pending on a route of the exercise now, those who decided a step of one, and the roster of each committee a matter of the exercise is
  /// tabled to, from the tabling. They name a person on the EXERCISE, not on its evaluation (`namedOnEvaluation` is unchanged), and they do not count towards the rule that a
  /// restricted exercise keeps someone named who can name others (`namedAfterRemovingParticipant`): a holder passes with the step, and that rule is about the stored list.
  stepHolderIds: readonly string[];
  stepDeciderIds: readonly string[];
  committeeMemberIds: readonly string[];
}

/// Who a requisition, or one matter of a contract, names by what its approval route says (ruling of 2026-10-08, the amendment of the 2026-10-06 ruling on log line 1526). Worked out when
/// read, never kept as a list. The requester is the officer the requisition was raised for.
export interface RoutedNamedFacts {
  requesterId: string | null;
  stepHolderIds: readonly string[];
  stepDeciderIds: readonly string[];
}

/// The fields of a CONTRACT matter's route that its deciders read: the amount of the matter they decide, and nothing else of the contract (its priced working, variance, estimate rates and
/// identity-card number stay with the permission). `matterAmountScope` says which matters carry such an amount.
export const ROUTED_CONTRACT_FIELDS: readonly string[] = SULIT_FIELDS.filter((f) => f.routedAmount).map((f) => f.field);

export type NamedAs = "PARTICIPANT" | "PERSON_IN_CHARGE" | "PROPOSAL_REVIEWER" | "EVALUATION_TEAM" | "OPENING_PANEL" | "STEP_HOLDER" | "STEP_DECIDER" | "COMMITTEE_MEMBER" | "REQUESTER";

const NAMED_AS_WORDS: Readonly<Record<NamedAs, Words>> = {
  PARTICIPANT: { en: "a named participant", ms: "peserta yang dinamakan" },
  PERSON_IN_CHARGE: { en: "the person in charge", ms: "pegawai bertanggungjawab" },
  PROPOSAL_REVIEWER: { en: "the proposal's reviewer", ms: "penyemak cadangan" },
  EVALUATION_TEAM: { en: "on the evaluation team", ms: "dalam pasukan penilaian" },
  OPENING_PANEL: { en: "on the opening panel", ms: "dalam panel pembukaan" },
  // The product owner's words (2026-10-08, ruling on log line 1711), read after "you are": "someone who holds a step on its route".
  STEP_HOLDER: { en: `someone who ${ROUTED_NAMED_WORDS.STEP_HOLDER.en}`, ms: `seseorang yang ${ROUTED_NAMED_WORDS.STEP_HOLDER.ms}` },
  STEP_DECIDER: { en: `someone who ${ROUTED_NAMED_WORDS.STEP_DECIDER.en}`, ms: `seseorang yang ${ROUTED_NAMED_WORDS.STEP_DECIDER.ms}` },
  COMMITTEE_MEMBER: { en: `a ${ROUTED_NAMED_WORDS.COMMITTEE_MEMBER.en}`, ms: `seorang ${ROUTED_NAMED_WORDS.COMMITTEE_MEMBER.ms}` },
  REQUESTER: { en: "the officer it was raised for", ms: "pegawai yang untuknya ia dibangkitkan" },
};
export const namedAsWords = (n: NamedAs): Words => NAMED_AS_WORDS[n];

/// Every way a person is named on a sourcing exercise: the resolver for the `exercise` scope, and the list a restricted exercise admits.
/// Those able to decide a pending step of a route of the exercise, those who decided one, and the members of the committee a matter of it is tabled to are named too, from the
/// routes, the sittings and the roster (ruling of 2026-10-08 on log line 1711, which settled what Phase 3a had left open).
export function namedOnExercise(f: ExerciseNamedFacts, personId: string): NamedAs[] {
  const out: NamedAs[] = [];
  if (f.participantIds.includes(personId)) out.push("PARTICIPANT");
  if (f.personInChargeId === personId) out.push("PERSON_IN_CHARGE");
  if (f.proposalReviewerId === personId) out.push("PROPOSAL_REVIEWER");
  if (f.evaluationTeamIds.includes(personId)) out.push("EVALUATION_TEAM");
  if (f.openingPanelIds.includes(personId)) out.push("OPENING_PANEL");
  if (f.stepHolderIds.includes(personId)) out.push("STEP_HOLDER");
  if (f.stepDeciderIds.includes(personId)) out.push("STEP_DECIDER");
  if (f.committeeMemberIds.includes(personId)) out.push("COMMITTEE_MEMBER");
  return out;
}

/// Everyone an exercise names, by any of the STORED ways, once `personId` is taken off its participants: the rule that a restricted exercise keeps at least one person
/// who can see it and name others (`removeParticipant`). The person may still be named another way (the person in charge), and then stays. The names worked out from the
/// routes and the sittings are left out on purpose: they pass with the step, and are not a person the exercise keeps.
export function namedAfterRemovingParticipant(f: ExerciseNamedFacts, personId: string): string[] {
  const rest = f.participantIds.filter((id) => id !== personId);
  return [...new Set([...rest, f.personInChargeId, f.proposalReviewerId, ...f.evaluationTeamIds, ...f.openingPanelIds].filter((x): x is string => !!x))];
}

/**
 * Whether the actor may name these people on an exercise (FR-MTD-007, Phase 3a review). Being named is what opens an exercise's classified figures, so naming is
 * itself an authorised act, never a self-service one: the actor must already be named on the exercise, or hold the permission to name people on exercises
 * (which the organisation has to decide: undecided refuses). Nobody names themselves into an exercise they are not on, whatever they hold. An administrator
 * account names no one else (administration is kept apart from transactions). A loader run is the operator's own process.
 *
 * `selfAllowed` is for a slot the actor takes by doing the act (the proposal's reviewer), where the slot is always theirs: the rule is then only "named, or holds it".
 */
export type NamingFault = "ADMINISTRATOR" | "SELF" | "NOT_NAMED";
export function namingFault(i: { actor: SulitActor; actorNamed: boolean; holdsPermission: boolean; targets: readonly string[]; selfAllowed?: boolean }): NamingFault | null {
  if (i.actor.system) return null;
  const self = i.actor.personId;
  const others = i.targets.filter((t) => t !== self);
  if (i.actor.isAdministrator) return others.length > 0 ? "ADMINISTRATOR" : i.selfAllowed ? null : "SELF";
  if (!self) return "NOT_NAMED";
  if (i.actorNamed) return null;
  if (!i.selfAllowed && i.targets.includes(self)) return "SELF";
  return i.holdsPermission ? null : "NOT_NAMED";
}

/// Everyone an exercise names once its person in charge is changed to `personId` (or cleared): the rule that a restricted exercise keeps at least one person who can see it.
export function namedAfterChangingPersonInCharge(f: ExerciseNamedFacts, personId: string | null): string[] {
  return [...new Set([...f.participantIds, personId, f.proposalReviewerId, ...f.evaluationTeamIds, ...f.openingPanelIds].filter((x): x is string => !!x))];
}

/// The resolver for the `evaluation` scope: the evaluation is read by its own team, and by those who run or are named on the exercise,
/// not by the opening panel or the proposal's reviewer, whose part ends before the scores exist.
export function namedOnEvaluation(f: ExerciseNamedFacts, personId: string): NamedAs[] {
  const out: NamedAs[] = [];
  if (f.evaluationTeamIds.includes(personId)) out.push("EVALUATION_TEAM");
  if (f.participantIds.includes(personId)) out.push("PARTICIPANT");
  if (f.personInChargeId === personId) out.push("PERSON_IN_CHARGE");
  return out;
}

/// The resolver for a requisition, or for one matter of a contract that carries an approval route: the officer it was raised for, whoever is able to decide a step that is pending on its
/// route, and whoever decided one.
export function namedOnRouted(f: RoutedNamedFacts, personId: string): NamedAs[] {
  const out: NamedAs[] = [];
  if (f.requesterId === personId) out.push("REQUESTER");
  if (f.stepHolderIds.includes(personId)) out.push("STEP_HOLDER");
  if (f.stepDeciderIds.includes(personId)) out.push("STEP_DECIDER");
  return out;
}

/// The resolver for a scope. An exercise and its evaluation list who is named. A requisition names its requester and the people of its route; a contract names NOBODY as a whole (who else
/// is named on a contract is open under ADR 0034 OQ-2), but the people who decide a matter's route read that matter's amount and nothing else of the contract (`ROUTED_CONTRACT_FIELDS`),
/// so for a contract-scope matter `routed` counts only where every field asked is one of them. The supplier scope names nobody: only the organisation-wide permission opens it.
export function namedOn(scope: SulitScope, f: ExerciseNamedFacts | null, personId: string | null, routed: RoutedNamedFacts | null = null, fields: readonly string[] = []): NamedAs[] {
  if (!personId) return [];
  if (scope === "exercise") return f ? namedOnExercise(f, personId) : [];
  if (scope === "evaluation") return f ? namedOnEvaluation(f, personId) : [];
  if (scope === "requisition") return routed ? namedOnRouted(routed, personId) : [];
  if (scope === "contract") return routed && fields.length > 0 && fields.every((x) => ROUTED_CONTRACT_FIELDS.includes(x)) ? namedOnRouted(routed, personId) : [];
  return [];
}

// ------------------------------------------------------------------ the rule

export interface SulitActor {
  /// Null for a loader run.
  personId: string | null;
  isAdministrator: boolean;
  /// A loader run (`StaffActor.system`).
  system: boolean;
}

export interface SulitContext {
  scope: SulitScope;
  /// The exercise is restricted (FR-MTD-007). Always false for a scope that is not an exercise's.
  restricted: boolean;
  /// The actor is named on the record under this scope (`namedOn` found a way).
  named: boolean;
  /// The state of `sulit.read.organisation` for the actor.
  organisationPermission: PermissionState;
  /// The actor reads the EVALUATION as the Secretariat or as Internal Audit, by an office the organisation set (ruling of 2026-10-08 on log line 1735). Read only for the evaluation
  /// scope, and never for a restricted exercise: FR-MTD-007's named list prevails there. Not given: no such office is held, or none is set.
  evaluationOffice?: EvaluationOfficeBasis | null;
}

export type EvaluationOfficeBasis = Extract<SulitGrantBasis, "SECRETARIAT_OFFICE" | "INTERNAL_AUDIT_OFFICE">;

const fieldOf = (name: string) => SULIT_FIELDS.find((f) => f.field === name);

/// Whether a registered field belongs to a kind of record: its own scope, or one it is also carried on.
export function fieldIsFor(name: string, scope: SulitScope): boolean {
  const f = fieldOf(name);
  return !!f && (f.scope === scope || !!f.alsoIn?.includes(scope));
}

export function sulitAccess(actor: SulitActor, ctx: SulitContext, field: string): SulitDecision {
  // A value is shown only for a field the registry names, on the kind of record it names. Anything else is a bug that must not read as access.
  if (!fieldIsFor(field, ctx.scope)) return { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
  return decide(actor, ctx);
}

/// The rule for several fields of one record at once (a tab that shows a dozen figures asks once): the first field the record does not carry refuses,
/// otherwise the answer is the same for all of them.
export function sulitAccessAll(actor: SulitActor, ctx: SulitContext, fields: readonly string[]): SulitDecision {
  if (fields.length === 0 || fields.some((f) => !fieldIsFor(f, ctx.scope))) return { state: "WITHHELD", basis: "FIELD_NOT_FOR_THIS_RECORD" };
  return decide(actor, ctx);
}

/// The rule without a field: the same answer for every field of one record in one scope.
export function decide(actor: SulitActor, ctx: SulitContext): SulitDecision {
  if (actor.system || !actor.personId) return { state: "WITHHELD", basis: "NOT_A_PERSON" };
  if (actor.isAdministrator) return { state: "WITHHELD", basis: "ADMINISTRATOR" };
  if (ctx.named) return { state: "GRANTED", basis: "NAMED_ON_RECORD" };
  if (ctx.restricted) return { state: "WITHHELD", basis: "RESTRICTED_NOT_NAMED" };
  if (ctx.scope === "evaluation" && ctx.evaluationOffice) return { state: "GRANTED", basis: ctx.evaluationOffice };
  if (holds(ctx.organisationPermission)) return { state: "GRANTED", basis: "ORGANISATION_PERMISSION" };
  switch (ctx.organisationPermission.state) {
    case "UNDECIDED":
      return { state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_UNDECIDED" };
    case "WITHHELD":
      return { state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_WITHHELD" };
    case "SCOPED_ONLY":
      return { state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_SCOPED" };
    default:
      return { state: "WITHHELD", basis: "NOT_NAMED_PERMISSION_NOT_HELD" };
  }
}

// ------------------------------------------------------------------ a restricted exercise is hidden (FR-MTD-007)

/**
 * Whether an exercise may be seen at all. An unrestricted one may, by everyone who can reach the portal (its SULIT values are judged
 * apart). A restricted one only by the people named on it; an administrator never, and a loader run does (it is the operator's own
 * process, and nothing a request carries can make one). A person hidden from an exercise is told it no longer exists.
 */
export function exerciseVisible(actor: SulitActor, restricted: boolean, facts: ExerciseNamedFacts): boolean {
  if (!restricted) return true;
  if (actor.system) return true;
  if (actor.isAdministrator || !actor.personId) return false;
  return namedOnExercise(facts, actor.personId).length > 0;
}

// ------------------------------------------------------------------ the company estimate (FR-EST-008)

export type EstimateFigureFault = "SEALED" | "CUSTODY_NOT_SET" | "NOT_IN_CUSTODY" | "CUSTODY_DAY_UNKNOWN";

/// The company estimate's figure, once disclosed, to those in its custody: its preparer and the holders of the custodian and audit
/// offices (`custodyList`). Never before disclosure, and never to an administrator. `fault` is `viewFault`'s answer, from the caller.
export function estimateFigureAccess(actor: SulitActor, fault: EstimateFigureFault | null, evaluationReader: Extract<SulitGrantBasis, "NAMED_ON_RECORD" | "SECRETARIAT_OFFICE" | "INTERNAL_AUDIT_OFFICE"> | null = null): SulitDecision {
  if (actor.system || !actor.personId) return { state: "WITHHELD", basis: "NOT_A_PERSON" };
  if (actor.isAdministrator) return { state: "WITHHELD", basis: "ADMINISTRATOR" };
  if (!fault) return { state: "GRANTED", basis: "IN_CUSTODY" };
  // Product owner, 2026-10-08, ruling on log line 1736: once the opening has disclosed it the estimate is still SULIT, but it is also evaluation information (FR-EVL-014), and the
  // evaluators must read the comparison they report on. So, disclosed, a reader the evaluation is open to (its team, the people named on the exercise, the Secretariat and Internal
  // Audit offices once set) reads it as well as the custody list. Sealed stays sealed to everyone, first: no reader of the evaluation is let past it.
  if (fault !== "SEALED" && evaluationReader) return { state: "GRANTED", basis: evaluationReader };
  return { state: "WITHHELD", basis: fault };
}

// ------------------------------------------------------------------ words

const NOT_NAMED_REQUISITION: Words = { en: "You are not the officer it was raised for and you do not decide its route", ms: "Anda bukan pegawai yang untuknya ia dibangkitkan dan anda tidak memutuskan laluannya" };
const NOT_NAMED_EXERCISE: Words = { en: "You are not named on this exercise", ms: "Anda tidak dinamakan pada eksesais ini" };

/// What a withheld value says, in a sentence a person can act on. `scope` names the kind of record, so that "nobody is named on it" is
/// said of the three scopes that keep no list, and "you are not named" of the others.
export function refusalWords(basis: SulitRefusalBasis, scope: SulitScope | "estimate"): Words {
  const noList = scope === "contract" || scope === "supplier";
  const why = scope === "requisition" ? { ...NOT_NAMED_REQUISITION } : noList ? { en: "No list names who may read this", ms: "Tiada senarai yang menamakan siapa boleh membacanya" } : { ...NOT_NAMED_EXERCISE };
  switch (basis) {
    case "ADMINISTRATOR":
      return { en: "An administrator account never reads SULIT values: administration is kept apart from transactions.", ms: "Akaun pentadbir tidak pernah membaca nilai SULIT: pentadbiran diasingkan daripada urus niaga." };
    case "NOT_A_PERSON":
      return { en: "Only a signed-in person reads SULIT values.", ms: "Hanya orang yang log masuk membaca nilai SULIT." };
    case "RESTRICTED_NOT_NAMED":
      return { en: "This exercise is restricted to the people named on it, and you are not one of them. The organisation-wide permission does not open it.", ms: "Eksesais ini terhad kepada orang yang dinamakan padanya, dan anda bukan salah seorang. Kebenaran seluruh organisasi tidak membukanya." };
    case "NOT_NAMED_PERMISSION_UNDECIDED":
      return {
        en: `${why.en}, and the organisation has not yet decided which roles may read SULIT values across it.`,
        ms: `${why.ms}, dan organisasi belum memutuskan peranan mana boleh membaca nilai SULIT di seluruhnya.`,
      };
    case "NOT_NAMED_PERMISSION_WITHHELD":
      return {
        en: `${why.en}, and the organisation has withheld the right to read SULIT values across it from a role you hold.`,
        ms: `${why.ms}, dan organisasi telah menahan hak membaca nilai SULIT di seluruhnya daripada peranan yang anda pegang.`,
      };
    case "NOT_NAMED_PERMISSION_SCOPED":
      return {
        en: `${why.en}. The right to read SULIT values across the organisation is granted to a role you hold only for a department, and it is the organisation's.`,
        ms: `${why.ms}. Hak membaca nilai SULIT di seluruh organisasi diberikan kepada peranan yang anda pegang bagi sesuatu jabatan sahaja, dan hak itu milik organisasi.`,
      };
    case "NOT_NAMED_PERMISSION_NOT_HELD":
      return { en: `${why.en}, and you hold no role the right to read SULIT values across the organisation is granted to.`, ms: `${why.ms}, dan anda tidak memegang peranan yang diberikan hak membaca nilai SULIT di seluruh organisasi.` };
    case "FIELD_NOT_FOR_THIS_RECORD":
      return { en: "This value is not shown here.", ms: "Nilai ini tidak dipaparkan di sini." };
    case "SEALED":
      return { en: "The company estimate stays sealed until the opening discloses it. Nobody reads it before then.", ms: "Anggaran syarikat kekal dimeteraikan sehingga pembukaan mendedahkannya. Tiada sesiapa membacanya sebelum itu." };
    case "CUSTODY_NOT_SET":
      return {
        en: "The estimate is disclosed, but the organisation has not set which offices hold its copies and audit it, so only the people the evaluation is open to are yet entitled to read it here, and you are not among them.",
        ms: "Anggaran telah didedahkan, tetapi organisasi belum menetapkan jawatan mana memegang salinannya dan mengauditnya, jadi hanya mereka yang terbuka kepada penilaian berhak membacanya di sini, dan anda bukan antaranya.",
      };
    case "NOT_IN_CUSTODY":
      return { en: "The estimate is read only by its preparer, the offices that hold its copies and audit it, and the people the evaluation is open to, and you are not among them.", ms: "Anggaran hanya dibaca oleh penyediaannya, jawatan yang memegang salinan dan mengauditnya, dan mereka yang terbuka kepada penilaian, dan anda bukan antaranya." };
    case "CUSTODY_DAY_UNKNOWN":
      return { en: "The organisation's time zone is not set, so the offices in force today are not known and nobody can be shown to hold the estimate's copies.", ms: "Zon waktu organisasi belum ditetapkan, jadi jawatan yang berkuat kuasa hari ini tidak diketahui dan tiada sesiapa dapat ditunjukkan memegang salinan anggaran." };
    case "NOT_LOGGED":
      return { en: "The access could not be recorded, so the value is not shown.", ms: "Capaian tidak dapat direkodkan, jadi nilai tidak dipaparkan." };
  }
}

export const grantedWords = (basis: SulitGrantBasis, namedAs: readonly NamedAs[] = []): Words => {
  if (basis === "NAMED_ON_RECORD" && namedAs.length > 0) {
    return { en: `Shown because you are ${namedAs.map((n) => NAMED_AS_WORDS[n].en).join(" and ")}.`, ms: `Dipaparkan kerana anda ${namedAs.map((n) => NAMED_AS_WORDS[n].ms).join(" dan ")}.` };
  }
  if (basis === "NAMED_ON_RECORD") return { en: "Shown because you are named on this record.", ms: "Dipaparkan kerana anda dinamakan pada rekod ini." };
  if (basis === "ORGANISATION_PERMISSION") return { en: "Shown because your role may read SULIT values across the organisation.", ms: "Dipaparkan kerana peranan anda boleh membaca nilai SULIT di seluruh organisasi." };
  if (basis === "SECRETARIAT_OFFICE") return { en: "Shown because you hold the office the organisation names as the Secretariat for evaluations.", ms: "Dipaparkan kerana anda memegang jawatan yang ditetapkan organisasi sebagai Sekretariat bagi penilaian." };
  if (basis === "INTERNAL_AUDIT_OFFICE") return { en: "Shown because you hold the office the organisation names as Internal Audit for evaluations.", ms: "Dipaparkan kerana anda memegang jawatan yang ditetapkan organisasi sebagai Audit Dalam bagi penilaian." };
  return { en: "Shown because you hold the estimate's copy or audit it.", ms: "Dipaparkan kerana anda memegang salinan anggaran atau mengauditnya." };
};

// ------------------------------------------------------------------ the loader's type

export const sulitGranted = <T>(value: T, basis: SulitGrantBasis): Sulit<T> => ({ state: "GRANTED", value, basis });

export const sulitWithheld = <T = never>(basis: SulitRefusalBasis, scope: SulitScope | "estimate"): Sulit<T> => ({ state: "WITHHELD", basis, scope, words: refusalWords(basis, scope) });

/// A loader's answer from the rule's decision and the value, which is read only when granted (pass a thunk where reading costs).
export function applyDecision<T>(decision: SulitDecision, scope: SulitScope | "estimate", value: T | (() => T)): Sulit<T> {
  if (decision.state === "WITHHELD") return sulitWithheld<T>(decision.basis, scope);
  return sulitGranted(typeof value === "function" ? (value as () => T)() : value, decision.basis);
}

/// A value (or a thunk, read only where it is granted) held to a gate: the gate is a `Sulit<true>` asked once for a record, and everything on that record
/// that the gate covers is judged by it. A withheld gate carries no value, so what it holds back never leaves the loader.
export function through<T>(gate: Sulit<true>, value: T | (() => T)): Sulit<T> {
  if (gate.state === "WITHHELD") return gate;
  return sulitGranted(typeof value === "function" ? (value as () => T)() : value, gate.basis);
}

/// The value, or null where it is withheld.
export const sulitValue = <T>(s: Sulit<T>): T | null => (s.state === "GRANTED" ? s.value : null);

export const mapSulit = <T, U>(s: Sulit<T>, f: (v: T) => U): Sulit<U> => (s.state === "GRANTED" ? { state: "GRANTED", value: f(s.value), basis: s.basis } : s);

export const isSulitScope = (s: string): s is SulitScope => (SULIT_SCOPES as readonly string[]).includes(s);
