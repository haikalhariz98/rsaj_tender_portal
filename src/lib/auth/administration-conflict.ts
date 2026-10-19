import type { Fault } from "./types";

/**
 * Administration is kept apart from every transactional capability (NFR-SEC-004, ADR 0034 D9, Phase 2a). Pure: one rule, asked three ways.
 *
 * An administrator account may make accounts, issue codes and decide changes to configuration. It may not also be, or act as, someone
 * who holds authority, or one person could grant themselves a role, approve with it and reset the password of whoever else holds it.
 * An organisation that wants an IT administrator gives them a Person of their own that holds nothing.
 *
 * (Named `administration-conflict` because `administration.ts` is the account-administration I/O of Phase 1b; the programme's plan names
 * this module `administration.ts`.)
 *
 * The three questions, each answered with the fault found or null:
 * - MAKE_ADMINISTRATOR: the Person is being made an administrator while they hold an office, a committee seat or a delegation;
 * - GIVE_HOLDING: an office, a seat or a delegation is being given to a Person whose account is an administrator's;
 * - ACT: an administrator account attempts a holder-checked act, a signature or an unseal (checked again inside `requireStaff`).
 */

export interface Holdings {
  offices: number;
  seats: number;
  delegations: number;
}

export type HoldingKind = "OFFICE" | "SEAT" | "DELEGATION";
/// `TRANSACTION` is any other act in a procurement matter that writes an attribution (a score, a receipt, a tabling, a payment, a record of the site):
/// NFR-SEC-004 keeps an administrator apart from "every transactional, approval and certification capability", not only from the holder-checked ones
/// (the product owner's sweep, 2026-10-07, applied in Phase 3d by `beginAct`).
export type AdministratorAct = "HOLDER_CHECKED" | "SIGNATURE" | "UNSEAL" | "TRANSACTION";

export type AdministrationQuestion =
  /// `holdings` counts what the Person holds that has not ended.
  | { kind: "MAKE_ADMINISTRATOR"; holdings: Holdings }
  /// `personIsAdministrator` is true for a Person whose account is flagged as an administrator's, WHATEVER its status: a disabled
  /// administrator account can be enabled again, so a Person who has one is not given an office meanwhile (an open item for the product owner).
  | { kind: "GIVE_HOLDING"; holding: HoldingKind; personIsAdministrator: boolean }
  | { kind: "ACT"; act: AdministratorAct; actorIsAdministrator: boolean };

const HOLDING_WORDS: Record<HoldingKind, { en: string;  }> = {
  OFFICE: { en: "an office" },
  SEAT: { en: "a committee seat" },
  DELEGATION: { en: "a delegation" },
};

const ACT_WORDS: Record<AdministratorAct, { en: string;  }> = {
  HOLDER_CHECKED: { en: "an act that only the holder of an office may do" },
  SIGNATURE: { en: "a signature" },
  UNSEAL: { en: "an unsealing" },
  TRANSACTION: { en: "an act in a procurement matter" },
};

/// What a Person holds, in words: "2 offices, 1 committee seat".
export function holdingsInWords(h: Holdings): { en: string;  } | null {
  const en = [
    h.offices > 0 && `${h.offices} ${h.offices === 1 ? "office" : "offices"}`,
    h.seats > 0 && `${h.seats} committee ${h.seats === 1 ? "seat" : "seats"}`,
    h.delegations > 0 && `${h.delegations} ${h.delegations === 1 ? "delegation" : "delegations"}`,
  ].filter(Boolean);
  if (en.length === 0) return null;
  return { en: en.join(", ") };
}

/**
 * What an edit of an office, a seat or a delegation does to the holding, judged by the terms before and after (review of Phase 2a). Pure.
 *
 * The rule asks "may this Person be given a holding?", which an edit that only ENDS or SHORTENS one does not do: it gives nothing, and
 * refusing it would leave a holding that already breaks the rule (made before the rule, or by a Person later made an administrator) impossible to end.
 * So the question is asked of an edit only when it gives or extends the holding: a new one, another Person, another office or seat, an earlier start,
 * or a later or open end.
 */
export interface HoldingTerms {
  personId: string;
  /// What is held: the office and its scope, the seat, the delegated office with what is delegated. Another one is a new holding.
  what: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export function holdingGrows(before: HoldingTerms | null, after: HoldingTerms): boolean {
  if (!before) return true;
  if (before.personId !== after.personId || before.what !== after.what) return true;
  if (after.effectiveFrom.getTime() < before.effectiveFrom.getTime()) return true;
  if (after.effectiveTo === null) return before.effectiveTo !== null;
  return before.effectiveTo !== null && after.effectiveTo.getTime() > before.effectiveTo.getTime();
}

/// What is held, written so that two holdings are the same exactly when their `what` is equal.
export const officeWhat = (roleCode: string, scope: string | null): string => `office|${roleCode}|${scope ?? ""}`;
export const seatWhat = (committeeId: string, position: string, isAlternate: boolean): string => `seat|${committeeId}|${position}|${isAlternate ? "alternate" : "member"}`;
/// A delegation is the office it delegates and what of it: widening or changing what is delegated gives something, so it is another holding.
export const delegationWhat = (roleCode: string, capabilityCodes: readonly string[]): string => `delegation|${roleCode}|${[...capabilityCodes].sort().join(",")}`;

export interface DelegationHolding extends Omit<HoldingTerms, "personId"> {
  fromPersonId: string;
  toPersonId: string;
}

/// The Persons of a delegation an edit gives or extends something to: the grantor and the delegate, each judged on its own. A new delegation names both.
export function delegationPersonsToCheck(before: DelegationHolding | null, after: DelegationHolding): string[] {
  const side = (h: DelegationHolding, personId: string): HoldingTerms => ({ personId, what: h.what, effectiveFrom: h.effectiveFrom, effectiveTo: h.effectiveTo });
  const out: string[] = [];
  if (holdingGrows(before && side(before, before.fromPersonId), side(after, after.fromPersonId))) out.push(after.fromPersonId);
  if (holdingGrows(before && side(before, before.toPersonId), side(after, after.toPersonId))) out.push(after.toPersonId);
  return out;
}

export function administrationConflict(q: AdministrationQuestion): Fault | null {
  switch (q.kind) {
    case "MAKE_ADMINISTRATOR": {
      const held = holdingsInWords(q.holdings);
      if (!held) return null;
      return {
        code: "ADMINISTRATOR_HOLDS_NOTHING",
        en: `This person holds ${held.en}. An administrator holds no office, seat or delegation, so that administration stays apart from transactions. Give the administrator a person of their own.`,
      };
    }
    case "GIVE_HOLDING": {
      if (!q.personIsAdministrator) return null;
      const w = HOLDING_WORDS[q.holding];
      return {
        code: "ADMINISTRATOR_CANNOT_HOLD",
        en: `This person has an administrator's sign-in account, and an administrator holds no office, seat or delegation, so ${w.en} cannot be given to them: administration is kept apart from transactions. Give the role to someone who is not an administrator.`,
      };
    }
    case "ACT": {
      if (!q.actorIsAdministrator) return null;
      const w = ACT_WORDS[q.act];
      return {
        code: "ADMINISTRATOR_CANNOT_ACT",
        en: `You are signed in as an administrator, and administration is kept apart from transactions, so you cannot do ${w.en}. Sign in as the person who holds the office.`,
      };
    }
  }
}
