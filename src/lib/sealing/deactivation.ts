/**
 * Marking a share-holder as having left (ADR 0036 D11, ruling 20t; build plan step 17). Pure.
 *
 * An opening officer of an online exercise holds a share of its key that nobody else can stand in for once the closing has passed (ruling 11), and a signature that finalising needs (20t). A person
 * marked as left cannot take part, so what this says is which exercises that would leave unopenable, or unfinalisable, and that they must be re-tendered. The way out is the existing cancellation,
 * with its authority: the block is stated and clearable, never silent (ruling 13).
 *
 * Between the unseal and finalising the act needs a second approver (D11, 20t). Marking a person as left already goes through the two-person path whenever it is reached from the screen; the gate
 * below refuses it where it is reached any other way (`mode` is null), so the rule does not rest on the screen alone.
 */

export type ExposureKind =
  /// The unseal is done and finalising is not: the officer cannot sign, the opening can never be finalised, and the substitution is refused after the closing.
  | "UNFINALISABLE"
  /// The closing has passed and the bids are not opened: without this officer they can never be opened.
  | "UNOPENABLE"
  /// The main opening is finalised but a late bid still waits for its supplementary opening (20ce a), which needs every named officer: without this officer it can never be opened.
  | "LATE_BID_WAITING"
  /// The closing has not passed: the officer can still be replaced, share and all, before it. After it, the exercise must be re-tendered.
  | "SUBSTITUTE_BEFORE_CLOSING";

export interface HeldOpening { unsealed: boolean; finalised: boolean; kind: "MAIN" | "SUPPLEMENTARY" }
export interface HeldExercise { exerciseId: string; reference: string; title: string; closing: Date | null; openings: readonly HeldOpening[]; /** A late bid not yet opened and not turned away: a supplementary opening is still owed. */ lateBidWaiting: boolean }
export interface HolderExposure { exerciseId: string; reference: string; title: string; kind: ExposureKind }

/**
 * The exposure of one named officer on one exercise, or null where leaving changes nothing: the main opening is finalised, no sitting is part-way and no late bid waits for a supplementary opening. A finalised main opening
 * with a late bid still to open is exposed (20ce a): the supplementary opening needs every named officer.
 */
export function exposureOf(e: HeldExercise, now: Date): HolderExposure | null {
  const base = { exerciseId: e.exerciseId, reference: e.reference, title: e.title };
  if (e.openings.some((o) => o.unsealed && !o.finalised)) return { ...base, kind: "UNFINALISABLE" };
  if (e.openings.some((o) => o.kind === "MAIN" && o.finalised)) return e.lateBidWaiting ? { ...base, kind: "LATE_BID_WAITING" } : null;
  if (e.closing !== null && e.closing.getTime() <= now.getTime()) return { ...base, kind: "UNOPENABLE" };
  return { ...base, kind: "SUBSTITUTE_BEFORE_CLOSING" };
}

export function exposuresOf(held: readonly HeldExercise[], now: Date): HolderExposure[] {
  return held.flatMap((e) => exposureOf(e, now) ?? []);
}

export const EXPOSURE_WORDS: Readonly<Record<ExposureKind, (e: { reference: string; title: string }) => string>> = {
  UNFINALISABLE: (e) =>
    `${e.reference} (${e.title}): the bids are already opened and not yet finalised. Without this officer's signature it can never be finalised, and nobody can take their place now, so it must be re-tendered. The way out is to cancel it, with its authority.`,
  UNOPENABLE: (e) =>
    `${e.reference} (${e.title}): the closing has passed and the bids are not opened. Every named officer is needed to open them and nobody can take this officer's place now, so it must be re-tendered. The way out is to cancel it, with its authority.`,
  LATE_BID_WAITING: (e) =>
    `${e.reference} (${e.title}): the main opening is finalised, but a late bid is still waiting for its supplementary opening. Every named officer is needed to open it and nobody can take this officer's place now, so without them it can never be opened and the exercise must be re-tendered. The way out is to cancel it, with its authority.`,
  SUBSTITUTE_BEFORE_CLOSING: (e) =>
    `${e.reference} (${e.title}): this officer can still be replaced, with their share handed over, until the closing. If they are not replaced first, the bids can never be opened and the exercise must be re-tendered.`,
};

/// The lines the screen shows beside the act, one per exposed exercise, in the order given.
export const exposureLines = (xs: readonly HolderExposure[]): string[] => xs.map((x) => EXPOSURE_WORDS[x.kind](x));

export const SECOND_APPROVER_WORDS =
  "This person is a named opening officer of an exercise whose bids are opened and not yet finalised, or whose late bid still waits to be opened. Marking them as left needs a second approver: it is proposed, and a different person decides it. It cannot be done by one person alone.";

/**
 * Whether the act may run now. `mode` is how the two-person machinery is running it: a proposal's rehearsal, a second person's decision (the change is applied), or null for a run that is neither.
 * An exposure of kind UNFINALISABLE (the window between the unseal and finalising, 20t) or LATE_BID_WAITING (20ce a, a supplementary opening owed) is allowed only in the first two.
 */
export function deactivationGate(i: { exposures: readonly HolderExposure[]; mode: "REHEARSAL" | "APPLY" | "IMMEDIATE" | null }): { allowed: true } | { allowed: false; message: string } {
  // IMMEDIATE is one person alone, which this rule refuses whatever the switch says: it is about bids that could never be opened.
  if ((i.mode === null || i.mode === "IMMEDIATE") && i.exposures.some((x) => x.kind === "UNFINALISABLE" || x.kind === "LATE_BID_WAITING")) return { allowed: false, message: SECOND_APPROVER_WORDS };
  return { allowed: true };
}

/// The line for an exercise the reader may not see (FR-MTD-007): that the person is a named officer of some exercise is said, which one is not.
export const HIDDEN_EXPOSURE_LINE = "An exercise you may not see: this person is a named opening officer of it, and leaving may make its bids unopenable or unfinalisable. Ask someone who may see it before going on.";

/// What switching off a named officer's sign-in leaves: short lines for the Accounts drawer, one per exercise. Switching off is undone by putting the account back, so these say what is needed, not that the exercise is lost.
const DISABLE_WORDS: Readonly<Record<ExposureKind, (e: { reference: string; title: string }) => string>> = {
  UNFINALISABLE: (e) => `${e.reference} (${e.title}): opened, not finalised. Their signature is needed.`,
  LATE_BID_WAITING: (e) => `${e.reference} (${e.title}): a late bid waits to be opened. Every named officer is needed.`,
  UNOPENABLE: (e) => `${e.reference} (${e.title}): closed, not opened. Every named officer is needed to open it.`,
  SUBSTITUTE_BEFORE_CLOSING: (e) => `${e.reference} (${e.title}): replace them before the closing.`,
};

export const DISABLE_BLOCKED_LINE = "One administrator cannot disable this account. Mark the person as left under Users.";
export const HIDDEN_DISABLE_LINE = "An exercise you may not see needs this officer.";
export const hiddenDisableLines = (n: number): string => (n === 1 ? HIDDEN_DISABLE_LINE : `${n} exercises you may not see need this officer.`);

/// The lines the Accounts disable drawer shows (one per exercise the reader may see, then one for all they may not), and whether the disable would be refused (`deactivationGate`, the rule `disableAccount` applies, never restated). An exercise the reader may not see is not named (FR-MTD-007).
export function disableExposure(exposures: readonly HolderExposure[], hidden: ReadonlySet<string>): { lines: string[]; blocked: boolean } {
  if (exposures.length === 0) return { lines: [], blocked: false };
  const blocked = !deactivationGate({ exposures, mode: null }).allowed;
  const seen = exposures.filter((x) => !hidden.has(x.exerciseId)).map((x) => DISABLE_WORDS[x.kind](x));
  const nHidden = exposures.length - seen.length;
  // One line for all hidden exercises: the lines are rendered as keyed siblings, so repeats would collide.
  const lines = nHidden > 0 ? [...seen, hiddenDisableLines(nHidden)] : seen;
  return { lines: blocked ? [...lines, DISABLE_BLOCKED_LINE] : lines, blocked };
}
