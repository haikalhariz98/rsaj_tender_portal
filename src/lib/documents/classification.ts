/**
 * Changing a classification (NFR-SEC-002, OD-2), on a document and on a document class.
 *
 * A document takes its class's classification when it is created. An unset one is set
 * once, with a reason. Raising it is audited with a reason. A set classification is never
 * unset.
 *
 * BD-DS-11 as ruled (2026-10-01): every lowering — SULIT to Internal or Public, Internal
 * to Public — is refused to one person: one person alone may not release a document to a
 * wider readership. The refusal names the ways out: upload it again under the right class,
 * then withdraw the old version; or (Phase 5a, ADR 0034 D15) propose the lowering, which a
 * second person decides (`viaSecondPerson`: the same rules, but for the refusal of a lowering).
 *
 * Security audit C-4: a document filed while its class was unset (snapshot null) is not
 * set below its class's classification as it stands now, by the same rule and with the
 * same way out — otherwise a document of a class since made SULIT could be set to Public.
 *
 * The same holds for the class itself (Configuration › Documents): once its
 * classification is set it never goes back to "Not set", and lowering it is refused.
 */

import type { Finding, SecurityClass } from "./types";
import { SECURITY_CLASSES } from "./types";

const RANK: Readonly<Record<SecurityClass, number>> = { PUBLIC: 0, INTERNAL: 1, SULIT: 2 };

/// Whether `next` is lower than `current`. Nothing is lower than an unset classification.
export const lowers = (current: SecurityClass | null, next: SecurityClass) => current != null && RANK[next] < RANK[current];

/// Whether a change of a document's classification is a lowering: from a set one to a lower, or, for a document with none, to below its class's.
export const isLowering = (current: SecurityClass | null, next: SecurityClass | null, classClassification?: SecurityClass | null): boolean =>
  next != null && ((current != null && lowers(current, next)) || (current == null && classClassification != null && lowers(classClassification, next)));

export interface ReclassifyOptions {
  /// The change is a lowering that a second person decides (Phase 5a): the refusal of one person's lowering is not asked, and only a lowering is judged here.
  viaSecondPerson?: boolean;
}

export type ReclassifyFault =
  | "NOT_A_LOWERING"
  | "UNCHANGED"
  | "REASON_REQUIRED"
  | "CANNOT_UNSET"
  | "DOWNGRADE_FROM_SULIT"
  | "DOWNGRADE_FROM_INTERNAL"
  | "BELOW_CLASS_CLASSIFICATION";

/**
 * Whether a document's classification may change from `current` to `next`.
 * `classClassification`: its class's classification as it stands now, read under the
 * document's lock. Given, it bounds an unset document from below (C-4); not given, that
 * rule is not looked at — the action always gives it.
 */
export function reclassifyFault(current: SecurityClass | null, next: SecurityClass | null, reason: string, classClassification?: SecurityClass | null, opts: ReclassifyOptions = {}): Finding<ReclassifyFault>[] {
  if (next == null) return [{ code: "CANNOT_UNSET", level: "block" }];
  if (current === next) return [{ code: "UNCHANGED", level: "block" }];
  const out: Finding<ReclassifyFault>[] = [];
  if (opts.viaSecondPerson) {
    if (!isLowering(current, next, classClassification)) out.push({ code: "NOT_A_LOWERING", level: "block" });
    if (!reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
    return out;
  }
  if (current === "SULIT" && lowers(current, next)) out.push({ code: "DOWNGRADE_FROM_SULIT", level: "block", data: { from: current, to: next } });
  if (current === "INTERNAL" && lowers(current, next)) out.push({ code: "DOWNGRADE_FROM_INTERNAL", level: "block", data: { from: current, to: next } });
  if (current == null && classClassification != null && lowers(classClassification, next)) {
    out.push({ code: "BELOW_CLASS_CLASSIFICATION", level: "block", data: { classification: classClassification, to: next } });
  }
  if (!reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}

/// What kind of change it is, for the audit row and the confirmation text.
export function reclassifyKind(current: SecurityClass | null, next: SecurityClass): "SET" | "RAISED" | "LOWERED" {
  if (current == null) return "SET";
  return RANK[next] > RANK[current] ? "RAISED" : "LOWERED";
}

export type ClassClassificationFault = "CLASS_CLASSIFICATION_UNSET" | "CLASS_DOWNGRADE" | "NOT_A_LOWERING";

/**
 * Whether a document class's classification may change from `current` to `next`, on
 * an edit of the class. Unchanged is no change (the editor posts it back on every save).
 * A new class may start at anything, unset included.
 */
export function classClassificationFault(current: SecurityClass | null, next: SecurityClass | null, opts: ReclassifyOptions = {}): Finding<ClassClassificationFault>[] {
  // A lowering that a second person decides (Phase 5a): only a set classification lowered to a lower one is judged this way.
  if (opts.viaSecondPerson) return current != null && next != null && lowers(current, next) ? [] : [{ code: "NOT_A_LOWERING", level: "block" }];
  if (current == null || current === next) return [];
  if (next == null) return [{ code: "CLASS_CLASSIFICATION_UNSET", level: "block", data: { from: current } }];
  if (lowers(current, next)) return [{ code: "CLASS_DOWNGRADE", level: "block", data: { from: current, to: next } }];
  return [];
}

/// One choice a screen offers: allowed, or shown with the reason it is not.
export interface ClassificationChoice {
  /// Null is "Not set".
  value: SecurityClass | null;
  allowed: boolean;
  /// The finding that refuses it, where it is refused. Rendered by `classificationChoiceText`.
  refusal: Finding | null;
}

/**
 * The choices a document's classification form offers, each judged by `reclassifyFault`
 * itself (with a reason assumed given), so a disabled choice and a refused post say the
 * same thing. The current value is listed as not a change.
 */
export function documentClassificationChoices(current: SecurityClass | null, classClassification: SecurityClass | null): ClassificationChoice[] {
  return [null, ...SECURITY_CLASSES].map((value) => {
    const refusal = reclassifyFault(current, value, "given", classClassification)[0] ?? null;
    return { value, allowed: refusal == null, refusal };
  });
}

/// The choices a class's classification offers on its editor, judged by `classClassificationFault`.
export function classClassificationChoices(current: SecurityClass | null): ClassificationChoice[] {
  return [null, ...SECURITY_CLASSES].map((value) => {
    const refusal = classClassificationFault(current, value)[0] ?? null;
    return { value, allowed: refusal == null, refusal };
  });
}
