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
export type AdministratorAct = "HOLDER_CHECKED" | "SIGNATURE" | "UNSEAL";

export type AdministrationQuestion =
  /// `holdings` counts what the Person holds that has not ended.
  | { kind: "MAKE_ADMINISTRATOR"; holdings: Holdings }
  /// `personIsAdministrator` is true for a Person whose account is flagged as an administrator's, WHATEVER its status: a disabled
  /// administrator account can be enabled again, so a Person who has one is not given an office meanwhile (an open item for the product owner).
  | { kind: "GIVE_HOLDING"; holding: HoldingKind; personIsAdministrator: boolean }
  | { kind: "ACT"; act: AdministratorAct; actorIsAdministrator: boolean };

const HOLDING_WORDS: Record<HoldingKind, { en: string; ms: string }> = {
  OFFICE: { en: "an office", ms: "jawatan" },
  SEAT: { en: "a committee seat", ms: "kerusi jawatankuasa" },
  DELEGATION: { en: "a delegation", ms: "pewakilan" },
};

const ACT_WORDS: Record<AdministratorAct, { en: string; ms: string }> = {
  HOLDER_CHECKED: { en: "an act that only the holder of an office may do", ms: "tindakan yang hanya boleh dibuat pemegang jawatan" },
  SIGNATURE: { en: "a signature", ms: "tandatangan" },
  UNSEAL: { en: "an unsealing", ms: "pembukaan meterai" },
};

/// What a Person holds, in words: "2 offices, 1 committee seat".
export function holdingsInWords(h: Holdings): { en: string; ms: string } | null {
  const en = [
    h.offices > 0 && `${h.offices} ${h.offices === 1 ? "office" : "offices"}`,
    h.seats > 0 && `${h.seats} committee ${h.seats === 1 ? "seat" : "seats"}`,
    h.delegations > 0 && `${h.delegations} ${h.delegations === 1 ? "delegation" : "delegations"}`,
  ].filter(Boolean);
  if (en.length === 0) return null;
  const ms = [h.offices > 0 && `${h.offices} jawatan`, h.seats > 0 && `${h.seats} kerusi jawatankuasa`, h.delegations > 0 && `${h.delegations} pewakilan`].filter(Boolean);
  return { en: en.join(", "), ms: ms.join(", ") };
}

export function administrationConflict(q: AdministrationQuestion): Fault | null {
  switch (q.kind) {
    case "MAKE_ADMINISTRATOR": {
      const held = holdingsInWords(q.holdings);
      if (!held) return null;
      return {
        code: "ADMINISTRATOR_HOLDS_NOTHING",
        en: `This person holds ${held.en}. An administrator holds no office, seat or delegation, so that administration stays apart from transactions. Give the administrator a person of their own.`,
        ms: `Orang ini memegang ${held.ms}. Pentadbir tidak memegang sebarang jawatan, kerusi atau pewakilan, supaya pentadbiran kekal berasingan daripada urus niaga. Berikan pentadbir seorang individu tersendiri.`,
      };
    }
    case "GIVE_HOLDING": {
      if (!q.personIsAdministrator) return null;
      const w = HOLDING_WORDS[q.holding];
      return {
        code: "ADMINISTRATOR_CANNOT_HOLD",
        en: `This person has an administrator's sign-in account, and an administrator holds no office, seat or delegation, so ${w.en} cannot be given to them: administration is kept apart from transactions. Give the role to someone who is not an administrator.`,
        ms: `Orang ini mempunyai akaun log masuk pentadbir, dan pentadbir tidak memegang sebarang jawatan, kerusi atau pewakilan, jadi ${w.ms} tidak boleh diberikan kepada mereka: pentadbiran diasingkan daripada urus niaga. Berikan peranan itu kepada seseorang yang bukan pentadbir.`,
      };
    }
    case "ACT": {
      if (!q.actorIsAdministrator) return null;
      const w = ACT_WORDS[q.act];
      return {
        code: "ADMINISTRATOR_CANNOT_ACT",
        en: `You are signed in as an administrator, and administration is kept apart from transactions, so you cannot do ${w.en}. Sign in as the person who holds the office.`,
        ms: `Anda log masuk sebagai pentadbir, dan pentadbiran diasingkan daripada urus niaga, jadi anda tidak boleh membuat ${w.ms}. Log masuk sebagai orang yang memegang jawatan itu.`,
      };
    }
  }
}
