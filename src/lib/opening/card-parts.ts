import { currentPartIndex, startsOpen } from "@/lib/disclosure/open";

/**
 * The parts of one opening's card, in the order the sitting works through them, each folded to one line (note 0005 R13, R14).
 * Pure: the screen describes the opening and this answers what each part is called, what its summary line says, which marks
 * must repeat on that line, and whether it starts open. A part that holds a warn opens wherever it sits in the order, and the
 * first unfinished part opens as work in progress. A finished part shows its outcome only.
 *
 * "Finished" per part (a judgement call, logged 2026-10-20):
 * - panel: every seat the sitting needs has authorised;
 * - box: a lock time is recorded (a supplementary opening has no box part);
 * - envelopes: at least one, and every one opened;
 * - offers: at least one read, and the envelopes done;
 * - checklist: at least one cell, every cell answered, and no item whose return rule is not set;
 * - schedule: the page count is recorded, someone has signed, and nobody is left to sign;
 * - finalising: the opening is finalised (the part is then not shown at all).
 */
export type PartId = "panel" | "box" | "envelopes" | "offers" | "checklist" | "schedule" | "finalising";

/// A mark that repeats on a closed part's line. SULIT is the price mark; the rest are the chips 0005 R13 names.
export type PartChip = { kind: "sulit" } | { kind: "badge"; text: "Not set" | "Not checked" | "Assumed" | "Not recorded"; tone: "warn" | "neutral" };

export interface OpeningPartsInput {
  kind: "MAIN" | "SUPPLEMENTARY";
  finalised: boolean;
  panel: readonly { present: boolean; authorised: boolean }[];
  /// Authorisations the sitting needs.
  authorisationsRequired: number;
  panelSizeSet: boolean;
  independenceNotSet: boolean;
  independenceAssumed: boolean;
  /// Any of the opening's three written rules reads "not set" or "not stated".
  rulesNotSet: boolean;
  /// The viewer has an authorisation of their own to give now.
  authoriseNow: boolean;
  boxLockedAt: string | null;
  /// A withdrawal waits on a match or a finding the viewer may record.
  withdrawalActNow: boolean;
  envelopes: readonly { opened: boolean }[];
  offers: number;
  /// Checklist cells in all, and how many are still unanswered.
  checklistCells: number;
  unanswered: number;
  notJudged: number;
  notReturned: number;
  pages: number | null;
  signatures: number;
  /// Officers who still have to sign.
  signaturesLeft: number;
  /// The viewer must sign now.
  signNow: boolean;
  outstanding: number;
}

export interface OpeningPart {
  id: PartId;
  title: string;
  summary: string;
  chips: PartChip[];
  finished: boolean;
  warn: boolean;
  open: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const NOT_SET: PartChip = { kind: "badge", text: "Not set", tone: "warn" };

export function openingParts(i: OpeningPartsInput, target?: string | null): OpeningPart[] {
  const authorised = i.panel.filter((p) => p.authorised).length;
  const present = i.panel.filter((p) => p.present).length;
  const opened = i.envelopes.filter((e) => e.opened).length;
  const envelopesDone = i.envelopes.length > 0 && opened === i.envelopes.length;

  type Draft = Omit<OpeningPart, "open"> & { actNow?: boolean };
  const drafts: Draft[] = [];

  drafts.push({
    id: "panel",
    title: "The panel",
    summary: `${present} of ${i.panel.length} present · ${authorised} authorised`,
    chips: [
      ...(!i.panelSizeSet || i.independenceNotSet || i.rulesNotSet ? [NOT_SET] : []),
      ...(i.independenceAssumed ? [{ kind: "badge", text: "Assumed", tone: "neutral" } as const] : []),
    ],
    finished: authorised >= i.authorisationsRequired,
    warn: i.independenceNotSet,
    actNow: i.authoriseNow,
  });

  if (i.kind === "MAIN") {
    drafts.push({
      id: "box",
      title: "The tender box",
      summary: i.boxLockedAt ? `Locked ${i.boxLockedAt}` : "",
      chips: i.boxLockedAt ? [] : [{ kind: "badge", text: "Not recorded", tone: "warn" }],
      finished: i.boxLockedAt != null,
      warn: false,
      actNow: i.withdrawalActNow,
    });
  }

  drafts.push({
    id: "envelopes",
    title: i.kind === "MAIN" ? "Envelopes in time" : "The admitted envelope",
    summary: `${opened} of ${i.envelopes.length} opened`,
    chips: [],
    finished: envelopesDone,
    warn: false,
  });

  drafts.push({
    id: "offers",
    title: "Offers read, in opening order",
    summary: `${i.offers} read`,
    chips: i.offers > 0 ? [{ kind: "sulit" }] : [],
    finished: i.offers > 0 && envelopesDone,
    warn: false,
  });

  drafts.push({
    id: "checklist",
    title: "Checklist",
    summary: i.notJudged > 0 ? `${i.notJudged} not judged` : i.checklistCells === 0 ? "No offer to check yet" : `${i.checklistCells - i.unanswered} of ${i.checklistCells} answered`,
    chips: i.notReturned > 0 ? [{ kind: "badge", text: "Not checked", tone: "warn" }] : [],
    finished: i.checklistCells > 0 && i.unanswered === 0 && i.notJudged === 0,
    warn: i.notJudged > 0,
  });

  drafts.push({
    id: "schedule",
    title: "The signed schedule",
    summary: i.pages == null ? "" : `${plural(i.pages, "page", "pages")} · ${plural(i.signatures, "signature", "signatures")}`,
    chips: i.pages == null ? [{ kind: "badge", text: "Not recorded", tone: "warn" }] : [],
    finished: i.pages != null && i.signatures > 0 && i.signaturesLeft === 0,
    warn: false,
    actNow: i.signNow,
  });

  if (!i.finalised) {
    drafts.push({
      id: "finalising",
      title: "Finalising",
      summary: i.outstanding === 0 ? "Nothing outstanding" : `${i.outstanding} outstanding`,
      chips: [],
      finished: false,
      // Every fault that blocks finalising stays visible (0005 R15): the part opens whenever one is listed.
      warn: i.outstanding > 0,
    });
  }

  // The current part is the first unfinished one. Finalising is never "current" on its own account: it opens for its faults.
  const current = currentPartIndex(drafts.map((d) => d.finished || d.id === "finalising"));
  return drafts.map(({ actNow, ...d }, idx) => ({
    ...d,
    open: startsOpen({ finding: d.warn, actNow, inProgress: idx === current }, { id: d.id, target }),
  }));
}

/// The one line a finalised opening's card reads.
export function finalisedSummary(finalisedAt: string, offers: number): string {
  return `Finalised ${finalisedAt} · ${plural(offers, "offer", "offers")}`;
}
