import type { AccountStatus } from "@/generated/prisma/client";
import { diffFields, type FieldChange } from "@/lib/audit/diff";

import { lastAdministrator } from "./administration-rules";
import { editKindsReadBy } from "./configuration-edit";
import { administrationConflict, type Holdings } from "./administration-conflict";
import { isGrantable, isPermissionKey } from "./permissions";
import { rangeFaultWords, SETTING_LABELS, policyFaultWords } from "./policy";
import type { Fault, PermissionKey, SecurityPolicyKey, SecurityPolicyValues } from "./types";

/**
 * A change to high-risk configuration that a second person decides (ADR 0034 D15, Phase 2a; the lifecycle and the screens are Phase 2c). Pure.
 *
 * One record per change (`ConfigurationChange`): what is proposed (`payload`), what the proposer saw (`before`), and a status. A change is applied only by
 * a different Person from the proposer, who holds the kind's permission and gives their password. Applying re-reads the live values: if they are no longer
 * what `before` says, the change is STALE and nothing is applied. This module holds what has no database in it, for each kind:
 *
 * - `parseChange`: the payload, narrowed field by field, with an unknown field refused, in the shape of `src/app/api/authority/resolve/route.ts`;
 * - `snapshot`: the `before` snapshot, from the live state;
 * - `isStale`: whether the live state still reads as `before`;
 * - `planChange`: the rules of the kind, run on the live state, and the audit changes that applying would record;
 * - `decisionFaults`: who may decide it.
 *
 * Kinds in Phase 2c: SECURITY_POLICY, PERMISSION_GRANT, ADMINISTRATOR_GRANT, ADMINISTRATOR_REVOKE and ACCOUNT_CODE. Phase 5 adds kinds, each with its own enum migration.
 */

export type ChangeKind = "SECURITY_POLICY" | "PERMISSION_GRANT" | "ADMINISTRATOR_GRANT" | "ADMINISTRATOR_REVOKE" | "ACCOUNT_CODE";
export const CHANGE_KINDS: readonly ChangeKind[] = ["SECURITY_POLICY", "PERMISSION_GRANT", "ADMINISTRATOR_GRANT", "ADMINISTRATOR_REVOKE", "ACCOUNT_CODE"];

export type PermissionChoice = "GRANTED" | "WITHHELD" | "UNDECIDED";

export interface PolicyPayload {
  changes: Partial<SecurityPolicyValues>;
}
export interface PermissionPayload {
  permissionKey: PermissionKey;
  roleCode: string;
  decision: PermissionChoice;
}
export interface AccountPayload {
  accountId: string;
}
export interface CodePayload {
  accountId: string;
  purpose: "ACTIVATION" | "RESET";
}

export type ParsedChange =
  | { kind: "SECURITY_POLICY"; payload: PolicyPayload }
  | { kind: "PERMISSION_GRANT"; payload: PermissionPayload }
  | { kind: "ADMINISTRATOR_GRANT"; payload: AccountPayload }
  | { kind: "ADMINISTRATOR_REVOKE"; payload: AccountPayload }
  | { kind: "ACCOUNT_CODE"; payload: CodePayload };

/// A fault at a field of the payload, in both languages. `field` is the payload key, or "*" for the whole.
export interface FieldFault {
  field: string;
  code: string;
  en: string;
}

const bad = (field: string, code: string, en: string): FieldFault => ({ field, code, en });

/// What each kind is, in words, for the queue.
export const KIND_WORDS: Record<ChangeKind, { en: string;  }> = {
  SECURITY_POLICY: { en: "Change the sign-in settings" },
  PERMISSION_GRANT: { en: "Change which roles hold a permission" },
  ADMINISTRATOR_GRANT: { en: "Make a person an administrator" },
  ADMINISTRATOR_REVOKE: { en: "Take administration from a person" },
  ACCOUNT_CODE: { en: "Issue a code for an administrator's or office holder's account" },
};

/// The product permission that decides each kind.
export const KIND_PERMISSION: Record<ChangeKind, PermissionKey> = {
  SECURITY_POLICY: "security.policy",
  PERMISSION_GRANT: "permissions.grant",
  ADMINISTRATOR_GRANT: "accounts.manage",
  ADMINISTRATOR_REVOKE: "accounts.manage",
  ACCOUNT_CODE: "accounts.manage",
};

/**
 * The kinds of change a person may read in the queue (review of Phase 2c): those whose permission they hold. A change names who is being made or unmade an
 * administrator, whose account is getting a code, the settings that keep password guessing out, and the reason, which for a code records how identity was checked,
 * so it is read by those who decide that kind, as the screens of the same settings are (and as History keeps these trails to administrators). A person always
 * reads the changes they proposed themselves. A holder of the permission to read the audit trail reads every change, reasons included (they are audit evidence), and decides none: deciding
 * is by the kind's own permission (Phase 3b, the product owner's ruling of 2026-10-07).
 */
export const kindsReadBy = (permissions: ReadonlySet<PermissionKey>): ChangeKind[] => CHANGE_KINDS.filter((k) => permissions.has("audit.read") || permissions.has(KIND_PERMISSION[k]));

/// Whether a person may read the queue at all: they hold the permission of at least one kind.
export const mayReadQueue = (permissions: ReadonlySet<PermissionKey>): boolean => kindsReadBy(permissions).length > 0 || editKindsReadBy(permissions).length > 0;

// --------------------------------------------------------------------------------------------- parsing

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/// Unknown fields are refused, in one place per payload.
function unknownFields(raw: Record<string, unknown>, allowed: readonly string[]): FieldFault[] {
  return Object.keys(raw)
    .filter((k) => !allowed.includes(k))
    .map((k) => bad(k, "UNKNOWN_FIELD", "This is not something a change of this kind carries."));
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" && v.length <= 200 ? v.trim() : null);

const POLICY_ENUMS: Partial<Record<SecurityPolicyKey, readonly string[]>> = {
  concurrentSessionAction: ["REVOKE_OLDEST", "REFUSE_NEW"],
  paperSignatureRecording: ["ALLOWED", "REFUSED"],
};

export function parseChange(kind: ChangeKind, raw: unknown): { ok: true; change: ParsedChange } | { ok: false; faults: FieldFault[] } {
  if (!isObject(raw)) return { ok: false, faults: [bad("*", "NOT_AN_OBJECT", "A change is an object.")] };
  const faults: FieldFault[] = [];

  switch (kind) {
    case "SECURITY_POLICY": {
      faults.push(...unknownFields(raw, ["changes"]));
      const changes = raw.changes;
      if (!isObject(changes) || Object.keys(changes).length === 0) {
        faults.push(bad("changes", "NO_CHANGES", "Name at least one setting to change."));
        return { ok: false, faults };
      }
      const out: Partial<Record<SecurityPolicyKey, unknown>> = {};
      for (const [key, value] of Object.entries(changes)) {
        if (!(key in SETTING_LABELS)) {
          faults.push(bad(key, "UNKNOWN_SETTING", "That is not a sign-in setting."));
          continue;
        }
        const k = key as SecurityPolicyKey;
        const allowed = POLICY_ENUMS[k];
        if (k === "twoPersonChanges") {
          // The form posts On or Off; a stored payload holds the boolean.
          if (value === "ON" || value === true) out[k] = true;
          else if (value === "OFF" || value === false) out[k] = false;
          else faults.push(bad(key, "BAD_CHOICE", "Choose one of the options offered."));
        } else if (allowed) {
          if (typeof value !== "string" || !allowed.includes(value)) faults.push(bad(key, "BAD_CHOICE", "Choose one of the options offered."));
          else out[k] = value;
        } else if (typeof value !== "number") {
          faults.push(bad(key, "NOT_A_NUMBER", "Enter a whole number. A setting is changed to a value, never cleared."));
        } else {
          const why = rangeFaultWords(k, value);
          if (why) faults.push(bad(key, "OUT_OF_RANGE", why.en));
          else out[k] = value;
        }
      }
      if (faults.length > 0) return { ok: false, faults };
      return { ok: true, change: { kind, payload: { changes: out as Partial<SecurityPolicyValues> } } };
    }
    case "PERMISSION_GRANT": {
      faults.push(...unknownFields(raw, ["permissionKey", "roleCode", "decision"]));
      const key = text(raw.permissionKey);
      const role = text(raw.roleCode);
      if (!key || !isPermissionKey(key)) faults.push(bad("permissionKey", "UNKNOWN_PERMISSION", "That is not a product permission."));
      else if (!isGrantable(key)) faults.push(bad("permissionKey", "NOT_GRANTABLE", "This permission is held only through the administrator flag and is never granted to a role."));
      if (!role) faults.push(bad("roleCode", "ROLE_REQUIRED", "Name the role."));
      if (raw.decision !== "GRANTED" && raw.decision !== "WITHHELD" && raw.decision !== "UNDECIDED") faults.push(bad("decision", "BAD_DECISION", "Choose granted, withheld or undecided."));
      if (faults.length > 0) return { ok: false, faults };
      return { ok: true, change: { kind, payload: { permissionKey: key as PermissionKey, roleCode: role!, decision: raw.decision as PermissionChoice } } };
    }
    case "ADMINISTRATOR_GRANT":
    case "ADMINISTRATOR_REVOKE": {
      faults.push(...unknownFields(raw, ["accountId"]));
      const accountId = text(raw.accountId);
      if (!accountId) faults.push(bad("accountId", "ACCOUNT_REQUIRED", "Name the account."));
      if (faults.length > 0) return { ok: false, faults };
      return { ok: true, change: { kind, payload: { accountId: accountId! } } };
    }
    case "ACCOUNT_CODE": {
      faults.push(...unknownFields(raw, ["accountId", "purpose"]));
      const accountId = text(raw.accountId);
      if (!accountId) faults.push(bad("accountId", "ACCOUNT_REQUIRED", "Name the account."));
      if (raw.purpose !== "ACTIVATION" && raw.purpose !== "RESET") faults.push(bad("purpose", "BAD_PURPOSE", "Choose an activation code or a reset code."));
      if (faults.length > 0) return { ok: false, faults };
      return { ok: true, change: { kind, payload: { accountId: accountId!, purpose: raw.purpose as "ACTIVATION" | "RESET" } } };
    }
  }
}

// --------------------------------------------------------------------------------------------- the live state

export interface AccountFacts {
  isAdministrator: boolean;
  status: AccountStatus;
  personActive: boolean;
}

/// What a change reads from the database to be judged: the same facts at proposal (to make `before`) and at decision (to compare with it and to apply).
export type LiveState =
  | { kind: "SECURITY_POLICY"; policy: SecurityPolicyValues | null }
  | { kind: "PERMISSION_GRANT"; decision: PermissionChoice; roleExists: boolean }
  | { kind: "ADMINISTRATOR_GRANT"; account: AccountFacts | null; holdings: Holdings }
  | { kind: "ADMINISTRATOR_REVOKE"; account: AccountFacts | null; activeAdministrators: number }
  /// `heldOffice`: the person holds, or has ever held, an office, a seat or a delegation (`holdingHistoryOf`), ended or not.
  | { kind: "ACCOUNT_CODE"; account: AccountFacts | null; heldOffice: boolean };

/// The `before` snapshot: what the change depends on, as plain JSON, so it can be stored and compared. Only what the change touches or hangs on.
export function snapshot(change: ParsedChange, live: LiveState): Record<string, unknown> {
  switch (change.kind) {
    case "SECURITY_POLICY": {
      const keys = Object.keys(change.payload.changes) as SecurityPolicyKey[];
      return Object.fromEntries(keys.map((k) => [k, live.kind === "SECURITY_POLICY" ? (live.policy?.[k] ?? null) : null]));
    }
    case "PERMISSION_GRANT":
      return { decision: live.kind === "PERMISSION_GRANT" ? live.decision : "UNDECIDED" };
    case "ADMINISTRATOR_GRANT":
    case "ADMINISTRATOR_REVOKE": {
      const account = live.kind === change.kind ? live.account : null;
      return { exists: account != null, isAdministrator: account?.isAdministrator ?? null, status: account?.status ?? null };
    }
    case "ACCOUNT_CODE": {
      const l = live.kind === "ACCOUNT_CODE" ? live : null;
      // The administrator flag is part of what the proposer saw: a grant or a revoke made in between makes the change stale.
      return { exists: l?.account != null, status: l?.account?.status ?? null, isAdministrator: l?.account?.isAdministrator ?? null, heldOffice: l?.heldOffice ?? null };
    }
  }
}

/// Key-order-independent equality of two JSON snapshots.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/// STALE: the live state no longer reads as the proposer saw it. Nothing is applied, and the change says so.
export const isStale = (before: Record<string, unknown>, now: Record<string, unknown>): boolean => !sameJson(before, now);

export const STALE_WORDS = {
  en: "What this change was based on has changed since it was proposed, so nothing was applied. Propose it again against the current values.",
};

// --------------------------------------------------------------------------------------------- applying

export type Plan = { ok: true; after: Record<string, unknown>; changes: FieldChange[] } | { ok: false; faults: Fault[] };

const f = (code: string, en: string): Fault => ({ code, en });

/// The rules of the kind, run on the live state. `ok` says what applying would write and record; it writes nothing itself.
export function planChange(change: ParsedChange, live: LiveState): Plan {
  if (change.kind !== live.kind) return { ok: false, faults: [f("WRONG_STATE", "The state read does not belong to this kind of change.")] };
  switch (change.kind) {
    case "SECURITY_POLICY": {
      const current = (live as Extract<LiveState, { kind: "SECURITY_POLICY" }>).policy;
      if (!current) return { ok: false, faults: [f("NO_POLICY", "The organisation has no sign-in settings yet. The first are set by the bootstrap command.")] };
      const merged = { ...current, ...change.payload.changes };
      const why = policyFaultWords(merged);
      if (why) return { ok: false, faults: [f("POLICY_FAULT", why.en)] };
      const before = Object.fromEntries(Object.keys(change.payload.changes).map((k) => [k, current[k as SecurityPolicyKey]]));
      const changes = diffFields(before, change.payload.changes);
      if (changes.length === 0) return { ok: false, faults: [f("NO_CHANGE", "Every setting named already stands as this proposes.")] };
      return { ok: true, after: { ...change.payload.changes }, changes };
    }
    case "PERMISSION_GRANT": {
      const l = live as Extract<LiveState, { kind: "PERMISSION_GRANT" }>;
      if (!l.roleExists) return { ok: false, faults: [f("NO_SUCH_ROLE", "That role no longer exists.")] };
      const after = { decision: change.payload.decision };
      const changes = diffFields({ decision: l.decision }, after);
      if (changes.length === 0) return { ok: false, faults: [f("NO_CHANGE", "The role already stands as this proposes.")] };
      return { ok: true, after, changes };
    }
    case "ADMINISTRATOR_GRANT": {
      const l = live as Extract<LiveState, { kind: "ADMINISTRATOR_GRANT" }>;
      if (!l.account) return { ok: false, faults: [f("NO_SUCH_ACCOUNT", "That account no longer exists.")] };
      const out: Fault[] = [];
      if (l.account.isAdministrator) out.push(f("ALREADY_ADMINISTRATOR", "That account is already an administrator's."));
      if (l.account.status !== "ACTIVE") out.push(f("NOT_ACTIVE", "Only an active account is made an administrator's."));
      if (!l.account.personActive) out.push(f("PERSON_INACTIVE", "That person is no longer active."));
      const conflict = administrationConflict({ kind: "MAKE_ADMINISTRATOR", holdings: l.holdings });
      if (conflict) out.push(conflict);
      if (out.length > 0) return { ok: false, faults: out };
      return { ok: true, after: { isAdministrator: true }, changes: diffFields({ isAdministrator: false }, { isAdministrator: true }) };
    }
    case "ADMINISTRATOR_REVOKE": {
      const l = live as Extract<LiveState, { kind: "ADMINISTRATOR_REVOKE" }>;
      if (!l.account) return { ok: false, faults: [f("NO_SUCH_ACCOUNT", "That account no longer exists.")] };
      if (!l.account.isAdministrator) return { ok: false, faults: [f("NOT_ADMINISTRATOR", "That account is not an administrator's.")] };
      if (l.account.status === "ACTIVE" && l.activeAdministrators <= 1) return { ok: false, faults: [lastAdministrator()] };
      return { ok: true, after: { isAdministrator: false }, changes: diffFields({ isAdministrator: true }, { isAdministrator: false }) };
    }
    case "ACCOUNT_CODE": {
      const l = live as Extract<LiveState, { kind: "ACCOUNT_CODE" }>;
      if (!l.account) return { ok: false, faults: [f("NO_SUCH_ACCOUNT", "That account no longer exists.")] };
      const out: Fault[] = [];
      if (!l.account.personActive) out.push(f("PERSON_INACTIVE", "That person is no longer active."));
      else if (!l.heldOffice && !l.account.isAdministrator) {
        out.push(
          f(
            "NO_SECOND_PERSON_NEEDED",
            "That account is not an administrator's, and that person has never held an office, seat or delegation, so a second person is not needed: an administrator issues the code directly from the People list.",
          ),
        );
      } else if (change.payload.purpose === "ACTIVATION" && l.account.status !== "PENDING_ACTIVATION") out.push(f("NOT_AWAITING_ACTIVATION", "An activation code is for an account that has not been activated."));
      else if (change.payload.purpose === "RESET" && l.account.status !== "ACTIVE") out.push(f("NOT_ACTIVE", "A reset code is for an active account."));
      if (out.length > 0) return { ok: false, faults: out };
      return { ok: true, after: { codePurpose: change.payload.purpose }, changes: diffFields(null, { codePurpose: change.payload.purpose }) };
    }
  }
}

// --------------------------------------------------------------------------------------------- the life of a change

export type ChangeStatus = "PROPOSED" | "APPLIED" | "DECLINED" | "WITHDRAWN" | "STALE";
export const CHANGE_STATUSES: readonly ChangeStatus[] = ["PROPOSED", "APPLIED", "DECLINED", "WITHDRAWN", "STALE"];

/**
 * The whole life of a change, in one place (the rule of this product: a state machine is declared, never inferred from scattered `if`s). A change is proposed
 * once and decided once: every decided state is final, and the database says the same (migration 20261007160000, trigger `ConfigurationChange_guard`).
 *
 * - `APPLY`: a different Person from the proposer, holding the kind's permission, who gave their password, when what the proposer saw still stands.
 * - `DECLINE`: the same Person and permission and password, who will not have it.
 * - `WITHDRAW`: the proposer alone, with their password: it is their own change taken back.
 * - `STALE`: what the change was based on has moved, found by the second person's decision, which writes it and applies nothing.
 */
export type ChangeDecision = "APPLY" | "DECLINE" | "WITHDRAW" | "STALE";

export const CHANGE_MACHINE: Readonly<Record<ChangeStatus, Partial<Record<ChangeDecision, ChangeStatus>>>> = {
  PROPOSED: { APPLY: "APPLIED", DECLINE: "DECLINED", WITHDRAW: "WITHDRAWN", STALE: "STALE" },
  APPLIED: {},
  DECLINED: {},
  WITHDRAWN: {},
  STALE: {},
};

/// Where a decision takes a change, or null where the machine has no such transition (every decision of a change already decided).
export const nextStatus = (from: ChangeStatus, decision: ChangeDecision): ChangeStatus | null => CHANGE_MACHINE[from][decision] ?? null;

/// A decided change reads in words, never as the status.
export const STATUS_WORDS: Record<ChangeStatus, { en: string;  }> = {
  PROPOSED: { en: "Waiting for a second person" },
  APPLIED: { en: "Applied" },
  DECLINED: { en: "Declined" },
  WITHDRAWN: { en: "Withdrawn" },
  STALE: { en: "Out of date, not applied" },
};

/// Who may propose: someone holding the permission that decides this kind. A person without it could never see their own proposal decided by anyone like them.
export function proposalFaults(kind: ChangeKind, proposer: { permissions: ReadonlySet<PermissionKey> }): Fault[] {
  return proposer.permissions.has(KIND_PERMISSION[kind])
    ? []
    : [f("NOT_PERMITTED", "You do not hold the permission that proposes this kind of change.")];
}

/**
 * A code for an account is never proposed or issued by the person whose account it is, and a reset is never decided by them: nobody resets their own account.
 * Run on both people who act on an `ACCOUNT_CODE` change, compared by Person.
 */
export function accountCodeTargetFaults(i: { targetPersonId: string; proposerPersonId: string | null; deciderPersonId: string | null }): Fault[] {
  const out: Fault[] = [];
  if (i.proposerPersonId != null && i.targetPersonId === i.proposerPersonId) {
    out.push(f("OWN_ACCOUNT", "You cannot propose a code for your own account. Ask another administrator."));
  }
  if (i.deciderPersonId != null && i.targetPersonId === i.deciderPersonId) {
    out.push(f("OWN_ACCOUNT", "You cannot issue a code for your own account. Ask another administrator."));
  }
  return out;
}

// --------------------------------------------------------------------------------------------- deciding

export interface Decider {
  personId: string;
  permissions: ReadonlySet<PermissionKey>;
}

/// Who may decide a proposed change: a different Person from the proposer (compared by Person), holding the kind's permission, while it is still proposed.
export function decisionFaults(change: { kind: ChangeKind; status: string; proposedByPersonId: string }, decider: Decider): Fault[] {
  const out: Fault[] = [];
  if (change.status !== "PROPOSED") out.push(f("NOT_PROPOSED", "This change has already been decided or withdrawn."));
  if (decider.personId === change.proposedByPersonId) {
    out.push(f("PROPOSER_IS_DECIDER", "You proposed this change, so you cannot decide it. A second person decides it."));
  }
  if (!decider.permissions.has(KIND_PERMISSION[change.kind])) {
    out.push(f("NOT_PERMITTED", "You do not hold the permission that decides this kind of change."));
  }
  return out;
}

/// Where nobody but the proposer could decide it: the act is refused and the screen says a second person is needed. Nothing fakes an approval.
export function secondPersonFault(eligibleDeciderPersonIds: readonly string[], proposerPersonId: string): Fault | null {
  return eligibleDeciderPersonIds.some((p) => p !== proposerPersonId)
    ? null
    : f(
        "SECOND_PERSON_NEEDED",
        "A second person is needed. Nobody else can decide this kind of change, and the person who proposes a change never decides it. Another administrator, or a holder of the permission, must exist first.",
      );
}
