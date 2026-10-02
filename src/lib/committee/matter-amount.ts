/**
 * Whether a committee matter's amount is SULIT, by what the figure is (6.2 sent-back
 * condition 3, decisions log 8f842cd; NFR-SEC-002, NFR-AUD-004). Pure.
 *
 * Keyed on the matter's kind, three-state: SULIT, not SULIT, or not decided. A kind not yet
 * decided is read as SULIT until someone decides it, never quietly as open. A matter with no
 * kind (a manual matter) can hold any figure, so it is read as SULIT too. A screen that shows
 * amounts of kinds it cannot tell apart (a sitting, the dashboard queue) chips every one when
 * any of them may be SULIT. `matter-amount.test.ts` holds every screen that renders a matter's
 * amount to this.
 */

import { MATTER_KINDS, type MatterKind } from "./labels";

export interface MatterAmountRule {
  /// True SULIT; false not; null not decided (read as SULIT).
  sulit: boolean | null;
  /// Why, for the next reader of this table.
  why: string;
}

export const MATTER_AMOUNT_SULIT: Readonly<Record<MatterKind, MatterAmountRule>> = {
  REQUISITION: { sulit: true, why: "A gate matter's amount is the requisition's estimated value, the department estimate: citing it refuses any other (committee-step.ts OTHER_AMOUNT)." },
  EXERCISE: { sulit: false, why: "An appointment matter's amount is the awarded value, not the department estimate (ruled 8f842cd; whether it is SULIT is a question to RSAJ, carried to 6.7 C-4 / 6.8 E-3)." },
  LATE_TENDER: { sulit: null, why: "Not decided: no module tables it with an amount yet. A late tender's figure would be a price as read (6.7 OD-3)." },
  CONTRACT: { sulit: null, why: "Not decided: no module tables it with an amount yet." },
  VARIATION: { sulit: null, why: "Not decided: no module tables it with an amount yet." },
  SCOPE: { sulit: false, why: "A scope matter carries no amount (tableScope writes none)." },
  EVALUATION_STAGE: { sulit: false, why: "A two-stage tender's first-stage matter carries no amount (6.8 tableStageOneMatter writes none)." },
  SUPPLIER: { sulit: false, why: "A supplier matter is never tabled (6.15 NEVER_TABLED_MATTER_KINDS) and its route is routed on no value (OD-2 A)." },
  CERTIFICATE: { sulit: null, why: "Not decided: a certificate matter is never tabled yet (6.14 NEVER_TABLED_MATTER_KINDS); the figure its route is routed on is the owning 6.13 module's to classify." },
};

/// Whether an amount on a matter of this kind is shown with the SULIT chip. Not decided, or no kind, reads as SULIT.
export const matterAmountIsSulit = (kind: MatterKind | null): boolean => kind == null || MATTER_AMOUNT_SULIT[kind].sulit !== false;

/// Whether a screen showing amounts of these kinds chips them. "ANY" is a screen that shows every kind, a manual matter's included.
export const surfaceChipsAmounts = (kinds: "ANY" | readonly MatterKind[]): boolean => (kinds === "ANY" ? true : kinds.some(matterAmountIsSulit));

/// The kinds whose amounts are SULIT or not decided.
export const SULIT_AMOUNT_KINDS: readonly MatterKind[] = MATTER_KINDS.filter((k) => matterAmountIsSulit(k));
