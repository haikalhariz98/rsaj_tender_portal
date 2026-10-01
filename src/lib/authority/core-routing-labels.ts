/**
 * How core routing reads (FR-APR-004), in English and Malay. Origins, choices and faults
 * are codes; they reach a screen only through here, and always name offices and rules,
 * never their codes.
 */

import { chainWasGenerated, type CoreChainFault, type CoreLevelFault } from "./core-routing";
import type { ChainOrigin, CoreLevel } from "./types";

export type Words = { en: string; ms: string };
export type Lang = "en" | "ms";

/// A step's origin on a generated chain (ruling C1: "Strengthened" only above the core act).
export const CHAIN_ORIGIN_LABEL: Record<ChainOrigin, Words> = {
  CORE: { en: "From core routing", ms: "Daripada laluan teras" },
  CORE_STRENGTHENED: { en: "Strengthened by this rule", ms: "Diperkukuh oleh peraturan ini" },
  CORE_ACT_SET: { en: "Act set by this rule", ms: "Tindakan ditetapkan oleh peraturan ini" },
  RULE: { en: "Added by this rule", ms: "Ditambah oleh peraturan ini" },
};

export const NOT_RECORDED: Words = { en: "Not recorded", ms: "Tidak direkodkan" };
export const NOT_SET: Words = { en: "Not set", ms: "Belum ditetapkan" };
export const APPROVES_ALONE: Words = { en: "Approves alone", ms: "Meluluskan sendiri" };

export function originLabel(origin: string | null | undefined, lang: Lang = "en"): string {
  const w = origin ? CHAIN_ORIGIN_LABEL[origin as ChainOrigin] : undefined;
  return (w ?? NOT_RECORDED)[lang];
}

/// The rule editor's three-way choice, as the select's values carry it.
export type ChainChoice = "" | "yes" | "no";
export const CHAIN_CHOICE_LABEL: Record<"NOT_SET" | "GENERATED" | "AS_ENTERED", Words> = {
  NOT_SET: NOT_SET,
  GENERATED: { en: "Generated from core routing", ms: "Dijana daripada laluan teras" },
  AS_ENTERED: { en: "As entered on this rule", ms: "Seperti yang dimasukkan pada peraturan ini" },
};

export function chainChoiceLabel(flag: boolean | null | undefined, lang: Lang = "en"): string {
  return CHAIN_CHOICE_LABEL[flag == null ? "NOT_SET" : flag ? "GENERATED" : "AS_ENTERED"][lang];
}

/// An office's name, never its code.
export const NO_LONGER_CONFIGURED: Words = { en: "an office no longer configured", ms: "jawatan yang tidak lagi dikonfigurasi" };

/**
 * The warning on a route whose rule takes its chain from the core routing but cannot
 * (§5 of the design note). A missing row is a warning — the chain as entered stands,
 * unchecked; anything else is an error on a draft, refused on save and at issue.
 */
export function coreFaultWarning(fault: CoreChainFault, rule: Words, office: Words): Words {
  switch (fault) {
    case "CORE_ROW_MISSING":
      return {
        en: `Chain as entered, not checked against core routing: this issue records no core routing for ${office.en}. Record it on the issue in the approval matrix.`,
        ms: `Rantaian seperti yang dimasukkan, tidak disemak terhadap laluan teras: isu ini tidak merekodkan laluan teras bagi ${office.ms}. Rekodkan pada isu dalam matriks kelulusan.`,
      };
    case "WEAKENS":
    case "ORDER_DIFFERS":
      return {
        en: `“${rule.en}” must take its chain from the core routing, but it gives ${office.en} a lesser act or a different place than the core routing does. Correct the rule or the core routing before relying on this route.`,
        ms: `“${rule.ms}” mesti mengambil rantaiannya daripada laluan teras, tetapi ia memberi ${office.ms} tindakan yang lebih rendah atau kedudukan yang berbeza daripada laluan teras. Betulkan peraturan atau laluan teras sebelum bergantung pada laluan ini.`,
      };
    case "APPROVER_BENEATH":
      return {
        en: `“${rule.en}” must take its chain from the core routing, but it names ${office.en}, its approver, beneath the approval as well. Correct the rule before relying on this route.`,
        ms: `“${rule.ms}” mesti mengambil rantaiannya daripada laluan teras, tetapi ia menamakan ${office.ms}, pelulusnya, di bawah kelulusan juga. Betulkan peraturan sebelum bergantung pada laluan ini.`,
      };
    case "APPROVE_BENEATH":
      return {
        en: `“${rule.en}” must take its chain from the core routing, but it gives ${office.en} an approval beneath the approver. Correct the rule before relying on this route.`,
        ms: `“${rule.ms}” mesti mengambil rantaiannya daripada laluan teras, tetapi ia memberi ${office.ms} kelulusan di bawah pelulus. Betulkan peraturan sebelum bergantung pada laluan ini.`,
      };
    case "DUPLICATE_OFFICE":
      return {
        en: `“${rule.en}” must take its chain from the core routing, but it names ${office.en} twice. Correct the rule before relying on this route.`,
        ms: `“${rule.ms}” mesti mengambil rantaiannya daripada laluan teras, tetapi ia menamakan ${office.ms} dua kali. Betulkan peraturan sebelum bergantung pada laluan ini.`,
      };
  }
}

export function notDecidedWarning(rule: Words): Words {
  return {
    en: `Chain as entered, not checked against core routing: nobody has decided whether “${rule.en}” takes its chain from the core routing. Decide it on the rule in the approval matrix.`,
    ms: `Rantaian seperti yang dimasukkan, tidak disemak terhadap laluan teras: belum diputuskan sama ada “${rule.ms}” mengambil rantaiannya daripada laluan teras. Putuskan pada peraturan dalam matriks kelulusan.`,
  };
}

export const AS_ENTERED_INFO: Words = {
  en: "Chain as entered on the rule: recorded as not taken from the core routing.",
  ms: "Rantaian seperti yang dimasukkan pada peraturan: direkodkan sebagai tidak diambil daripada laluan teras.",
};

/// Refused on saving a rule that takes its chain from the core routing (departure 1).
export function ruleSaveRefusal(fault: Exclude<CoreChainFault, "CORE_ROW_MISSING">, office: string): string {
  switch (fault) {
    case "WEAKENS":
      return `The core routing gives ${office} a stronger act than this rule does. A rule taking its chain from the core routing may strengthen a step, never weaken it: raise the act, or choose “As entered on this rule” with a reason.`;
    case "ORDER_DIFFERS":
      return `This rule names ${office} out of the order the core routing has it. Put the offices in the core routing's order, or choose “As entered on this rule” with a reason.`;
    case "APPROVER_BENEATH":
      return `${office} approves this rule, so it cannot also act beneath the approval. Take it out of the proposer or the recommenders.`;
    case "APPROVE_BENEATH":
      return `${office} is given an approval beneath the approver. Only the approver approves.`;
    case "DUPLICATE_OFFICE":
      return `This rule names ${office} twice. One office has one step in a chain.`;
  }
}

/// Refused at issue, per rule (6.9 note §6, ruling C6).
export function issueRefusal(fault: CoreChainFault, rule: string, office: string): string {
  if (fault === "CORE_ROW_MISSING")
    return `“${rule}” cannot be issued: it takes its chain from the core routing, and this issue records none for ${office}. Record the core routing for ${office}, or decide the rule's chain otherwise.`;
  return `“${rule}” cannot be issued: ${office} would be missing, act less than the core routing requires, or sit out of order. Correct the rule or the core routing.`;
}

export function coreLevelFaultText(fault: CoreLevelFault, office: string): string {
  switch (fault) {
    case "UNKNOWN_OFFICE":
      return "That is not an office. Add it under Users & roles first.";
    case "APPROVER_BENEATH":
      return `${office} is the approving office of this row, so it cannot also sit beneath it.`;
    case "APPROVE_BENEATH":
      return "An office beneath the approver proposes or recommends; only the approver approves.";
    case "MANDATORY_IN_CORE":
      return "The core routing holds proposing and recommending only. A mandatory recommendation belongs on the rule that needs it.";
    case "DUPLICATE_OFFICE":
      return `${office} is already in this row. One office has one step in a chain.`;
  }
}

/**
 * What a persisted route says about its chain (ruling C4): an earlier route "Not
 * recorded", an unset flag "not checked", "as entered" with the reason it was recorded
 * under, a flagged rule that fell back to its chain as entered because its approver had
 * no core row, or the core row it was generated from — all from the route's own snapshot.
 * "Taken from the core routing" is said only where a core row was recorded.
 */
export function routeCoreText(
  route: { coreSnapshotAt: Date | null; coreChainFlag: boolean | null; coreChainReason: string | null; coreRoutingSnapshot: unknown },
  officeName: (code: string) => Words,
): Words {
  if (!route.coreSnapshotAt) return { en: "Not recorded: this route opened before core routing was recorded on routes.", ms: "Tidak direkodkan: laluan ini dibuka sebelum laluan teras direkodkan pada laluan." };
  if (route.coreChainFlag == null)
    return { en: "Chain as entered on the rule, not checked against core routing: nobody had decided whether the rule takes its chain from it.", ms: "Rantaian seperti yang dimasukkan pada peraturan, tidak disemak terhadap laluan teras: belum diputuskan sama ada peraturan mengambil rantaiannya daripadanya." };
  if (route.coreChainFlag === false) {
    const why = route.coreChainReason?.trim();
    return {
      en: `Chain as entered on the rule, recorded as not taken from the core routing: ${why || "reason not recorded"}.`,
      ms: `Rantaian seperti yang dimasukkan pada peraturan, direkodkan sebagai tidak diambil daripada laluan teras: ${why || "sebab tidak direkodkan"}.`,
    };
  }
  // Flagged, but nothing generated: every route opener refuses a core chain fault, so
  // the one fallback a route can open under is a missing core row for its approver.
  if (!chainWasGenerated(route))
    return {
      en: "Chain as entered on the rule, not checked against core routing: the rule takes its chain from the core routing, but this issue recorded no core routing for its approving office when the route opened.",
      ms: "Rantaian seperti yang dimasukkan pada peraturan, tidak disemak terhadap laluan teras: peraturan mengambil rantaiannya daripada laluan teras, tetapi isu ini tidak merekodkan laluan teras bagi pejabat pelulusnya semasa laluan dibuka.",
    };
  const level = route.coreRoutingSnapshot as CoreLevel;
  const office = officeName(level.approverCode);
  const clause = level.clause ? ` (${level.clause})` : "";
  return { en: `Generated from the core routing for ${office.en}${clause}.`, ms: `Dijana daripada laluan teras bagi ${office.ms}${clause}.` };
}

/// Said beside one step of a persisted route: where a generated chain's step came from.
/// Nothing on a chain as entered (the route says so once), on the approver's step, or on
/// an earlier route (the route reads "Not recorded" once).
export function stepOriginText(route: { coreChainFlag: boolean | null }, step: { chainOrigin: string | null }, lang: Lang = "en"): string | null {
  if (route.coreChainFlag !== true || !step.chainOrigin) return null;
  return originLabel(step.chainOrigin, lang);
}
