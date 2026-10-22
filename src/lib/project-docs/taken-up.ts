/**
 * Where a version of one of the six kinds is recorded once taken up (PW-9, PW-24): the case tab that holds the act it calls for. The link beside "Taken up" is
 * built from it by `caseHref`. Null: no staff screen records that kind yet, and "Taken up" then shows no link and no "recorded in" words (PW-24; plan §11
 * item 3): a delay notice until the Time screen exists (backlog), defects rectified (received only, "Noted"), and the statutory declaration. Pure.
 */

import type { DocKind } from "./types";

export interface TakenUpWhere {
  stage: "project";
  tab: "site" | "payments";
  section: string;
}

const WHERE: Readonly<Record<DocKind, TakenUpWhere | null>> = {
  // Site › Possession and progress: the programme card (FR-SUP-006's scrutiny and approval stay the WorkProgramme acts).
  WORK_PROGRAMME: { stage: "project", tab: "site", section: "start" },
  // Payments › Valuations: the officer keys the claim day there (claimReceivedOn) and certifies the claim.
  INTERIM_CLAIM: { stage: "project", tab: "payments", section: "valuations" },
  MATERIALS_ON_SITE: { stage: "project", tab: "payments", section: "valuations" },
  DELAY_NOTICE: null,
  DEFECTS_RECTIFIED: null,
  STATUTORY_DECLARATION: null,
};

export const takenUpWhere = (kind: DocKind): TakenUpWhere | null => WHERE[kind];
