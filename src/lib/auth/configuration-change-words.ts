import { KIND_WORDS, parseChange, type ChangeKind } from "./configuration-change";
import { PERMISSIONS } from "./permissions";
import { SETTING_LABELS } from "./policy";
import type { SecurityPolicyKey } from "./types";

/**
 * A two-person change in words (ADR 0034 D15, Phase 2c). Pure. The queue shows each change as what it would do: which setting, which role, which person,
 * from what to what. The payload and the snapshot are configuration keys and ids; none of them reaches a screen. The names a key or an id stands for
 * are looked up by the caller and handed in, so this module reads no database.
 *
 * English only: the screens render English, and the Malay of the fixed wording sits beside it in `configuration-change.ts` (kinds, statuses, faults).
 */

export interface ChangeNames {
  /// The person whose sign-in account a change is about.
  accountPerson: string | null;
  /// The role a permission change is about.
  roleName: string | null;
}

export interface ChangeLine {
  label: string;
  /// Null where there was nothing before (a code is new).
  before: string | null;
  after: string;
}

export interface ChangeSummary {
  /// What the change is: "Change the sign-in settings".
  title: string;
  /// Whom or what it is about, where it is about one: the person, the role. Null for the organisation's settings.
  subject: string | null;
  lines: ChangeLine[];
}

const UNITS: Partial<Record<SecurityPolicyKey, readonly [string, string]>> = {
  staffIdleMinutes: ["minute", "minutes"],
  staffAbsoluteMinutes: ["minute", "minutes"],
  supplierIdleMinutes: ["minute", "minutes"],
  supplierAbsoluteMinutes: ["minute", "minutes"],
  lockoutMinutes: ["minute", "minutes"],
  addressThrottleMinutes: ["minute", "minutes"],
  resetCodeValidityMinutes: ["minute", "minutes"],
  maxConcurrentSessions: ["session", "sessions"],
  maxFailedAttempts: ["attempt", "attempts"],
  addressThrottleAttempts: ["attempt", "attempts"],
  passwordMinLength: ["character", "characters"],
  signInDetailRetentionDays: ["day", "days"],
  sealingPassphraseMinLength: ["character", "characters"],
};

const CHOICES: Partial<Record<SecurityPolicyKey, Readonly<Record<string, string>>>> = {
  concurrentSessionAction: { REVOKE_OLDEST: "End the oldest session", REFUSE_NEW: "Refuse the new sign-in" },
  paperSignatureRecording: { ALLOWED: "Allowed", REFUSED: "Refused" },
};

/// The choices a setting offers where it is a choice (not a number), as a select lists them: value and words. Undefined for a number.
export function settingChoices(key: SecurityPolicyKey): { value: string; label: string }[] | undefined {
  if (key === "twoPersonChanges") return [{ value: "ON", label: "On" }, { value: "OFF", label: "Off" }];
  const c = CHOICES[key];
  return c ? Object.entries(c).map(([value, label]) => ({ value, label })) : undefined;
}

/// One setting's value as a reader says it: with its unit, a choice in words, and "Not set" for a setting nobody has chosen.
export function settingValueWords(key: SecurityPolicyKey, value: unknown): string {
  if (value == null) return "Not set";
  if (key === "twoPersonChanges") return value === true ? "On" : value === false ? "Off" : "Not set";
  const choice = CHOICES[key];
  if (choice) return typeof value === "string" ? (choice[value] ?? "A choice no longer offered") : "Not set";
  if (typeof value !== "number") return "Not set";
  const unit = UNITS[key];
  return unit ? `${value} ${value === 1 ? unit[0] : unit[1]}` : String(value);
}

export const DECISION_WORDS: Readonly<Record<string, string>> = { GRANTED: "Granted", WITHHELD: "Withheld", UNDECIDED: "Undecided" };

const adminWords = (isAdministrator: unknown): string | null => (isAdministrator === true ? "An administrator" : isAdministrator === false ? "Not an administrator" : null);

/// What a stored change would do, in words. A payload that cannot be read says so, and shows nothing it holds.
export function describeChange(kind: ChangeKind, payload: unknown, before: Record<string, unknown>, names: ChangeNames): ChangeSummary {
  const title = KIND_WORDS[kind].en;
  const parsed = parseChange(kind, payload);
  if (!parsed.ok) return { title, subject: null, lines: [{ label: "This change", before: null, after: "Cannot be read: it no longer fits what a change of this kind carries." }] };
  const change = parsed.change;
  switch (change.kind) {
    case "SECURITY_POLICY":
      return {
        title,
        subject: null,
        lines: (Object.keys(change.payload.changes) as SecurityPolicyKey[]).map((key) => ({
          label: SETTING_LABELS[key].en,
          before: settingValueWords(key, before[key]),
          after: settingValueWords(key, change.payload.changes[key]),
        })),
      };
    case "PERMISSION_GRANT":
      return {
        title,
        subject: names.roleName ?? "A role no longer configured",
        lines: [{ label: PERMISSIONS[change.payload.permissionKey].label.en, before: DECISION_WORDS[String(before.decision)] ?? "Undecided", after: DECISION_WORDS[change.payload.decision] }],
      };
    case "ADMINISTRATOR_GRANT":
    case "ADMINISTRATOR_REVOKE":
      return {
        title,
        subject: names.accountPerson ?? "An account no longer on file",
        lines: [{ label: "Administrator rights", before: adminWords(before.isAdministrator), after: change.kind === "ADMINISTRATOR_GRANT" ? "An administrator" : "Not an administrator" }],
      };
    case "ACCOUNT_CODE":
      return {
        title,
        subject: names.accountPerson ?? "An account no longer on file",
        lines: [{ label: "One-time code", before: null, after: change.payload.purpose === "ACTIVATION" ? "An activation code, handed over by the second person" : "A reset code, handed over by the second person" }],
      };
  }
}

/// One line of a change as it reads: "Label: before → after", or "Label: after" where there was nothing before.
export const lineText = (l: ChangeLine): string => (l.before == null ? `${l.label}: ${l.after}` : `${l.label}: ${l.before} → ${l.after}`);

/// A change's first line and the rest, for a stacked cell in a list.
export function whatChanges(lines: readonly ChangeLine[]): { title: string; sub?: string } {
  const [first, ...rest] = lines.map(lineText);
  return { title: first ?? "Nothing to show", ...(rest.length > 0 ? { sub: rest.join(" · ") } : {}) };
}
