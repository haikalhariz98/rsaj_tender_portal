import type { SecurityPolicyKey, SecurityPolicyValues } from "./types";

/**
 * Which `SecurityPolicy` settings an act needs, and which of them are unset (ADR 0034 D17).
 *
 * Every setting is the customer's and is null until they set it: nothing here has a default. An act whose setting is
 * unset is refused, and the refusal names the setting, in words.
 */

export interface SettingLabel {
  en: string;
  ms: string;
}

export const SETTING_LABELS: Record<SecurityPolicyKey, SettingLabel> = {
  staffIdleMinutes: { en: "Staff idle time before a session ends", ms: "Masa tidak aktif kakitangan sebelum sesi tamat" },
  staffAbsoluteMinutes: { en: "Longest a staff session may last", ms: "Tempoh terpanjang sesi kakitangan" },
  supplierIdleMinutes: { en: "Supplier idle time before a session ends", ms: "Masa tidak aktif pembekal sebelum sesi tamat" },
  supplierAbsoluteMinutes: { en: "Longest a supplier session may last", ms: "Tempoh terpanjang sesi pembekal" },
  maxConcurrentSessions: { en: "Sessions one account may have open at once", ms: "Bilangan sesi yang boleh dibuka serentak oleh satu akaun" },
  concurrentSessionAction: { en: "What happens at the limit of open sessions", ms: "Tindakan apabila had sesi terbuka dicapai" },
  maxFailedAttempts: { en: "Wrong passwords before an account is locked", ms: "Kata laluan salah sebelum akaun dikunci" },
  lockoutMinutes: { en: "How long a locked account stays locked", ms: "Tempoh akaun kekal dikunci" },
  addressThrottleAttempts: { en: "Failed sign-ins from one address before it is held back", ms: "Log masuk gagal dari satu alamat sebelum disekat" },
  addressThrottleMinutes: { en: "How far back failed sign-ins from one address are counted", ms: "Tempoh ke belakang log masuk gagal dari satu alamat dikira" },
  passwordMinLength: { en: "Shortest password", ms: "Kata laluan terpendek" },
  resetCodeValidityMinutes: { en: "How long a one-time code stays valid", ms: "Tempoh kod sekali guna kekal sah" },
  paperSignatureRecording: { en: "Whether a paper decision may be recorded for someone else", ms: "Sama ada keputusan atas kertas boleh direkodkan bagi pihak orang lain" },
  signInDetailRetentionDays: { en: "How long sign-in addresses are kept", ms: "Tempoh alamat log masuk disimpan" },
};

export type PolicyNeed = "SIGN_IN" | "SET_PASSWORD" | "ISSUE_CODE";

const NEEDS: Record<PolicyNeed, readonly SecurityPolicyKey[]> = {
  SIGN_IN: [
    "staffIdleMinutes",
    "staffAbsoluteMinutes",
    "maxConcurrentSessions",
    "concurrentSessionAction",
    "maxFailedAttempts",
    "lockoutMinutes",
    "addressThrottleAttempts",
    "addressThrottleMinutes",
  ],
  SET_PASSWORD: ["passwordMinLength"],
  ISSUE_CODE: ["resetCodeValidityMinutes"],
};

/// The settings an act needs that nobody has set, in a stable order. `policy` is null where the organisation has no policy row at all: then every one is unset.
export function unsetSettings(policy: SecurityPolicyValues | null, ...needs: PolicyNeed[]): SecurityPolicyKey[] {
  const keys = new Set<SecurityPolicyKey>();
  for (const need of needs) for (const key of NEEDS[need]) keys.add(key);
  return [...keys].filter((key) => policy == null || policy[key] == null);
}

export function settingLabels(keys: readonly SecurityPolicyKey[], language: "en" | "ms" = "en"): string[] {
  return keys.map((key) => SETTING_LABELS[key][language]);
}

/// A fault in a set of values, in both languages, or null. The database CHECKs hold the same rules; this says them in words before the write.
export function policyFaultWords(p: Pick<SecurityPolicyValues, "signInDetailRetentionDays" | "addressThrottleMinutes" | "passwordMinLength" | "staffIdleMinutes" | "staffAbsoluteMinutes">): SettingLabel | null {
  if (p.signInDetailRetentionDays != null && p.addressThrottleMinutes != null && p.signInDetailRetentionDays * 1440 < p.addressThrottleMinutes) {
    return {
      en: "Sign-in addresses must be kept at least as long as failed sign-ins from one address are counted, or the count would lose its own evidence.",
      ms: "Alamat log masuk mesti disimpan sekurang-kurangnya selama log masuk gagal daripada satu alamat dikira, atau pengiraan itu akan kehilangan buktinya sendiri.",
    };
  }
  if (p.passwordMinLength != null && (p.passwordMinLength < 8 || p.passwordMinLength > 256)) {
    return { en: "The shortest password is between 8 and 256 characters.", ms: "Kata laluan paling pendek ialah antara 8 dengan 256 aksara." };
  }
  if (p.staffIdleMinutes != null && p.staffAbsoluteMinutes != null && p.staffIdleMinutes > p.staffAbsoluteMinutes) {
    return { en: "A session cannot be allowed to idle for longer than it may last.", ms: "Sesi tidak boleh dibenarkan melahu lebih lama daripada tempoh sesi itu dibenarkan." };
  }
  return null;
}

/// The same, in English only, for the commands that print one language.
export const policyFault = (p: Parameters<typeof policyFaultWords>[0]): string | null => policyFaultWords(p)?.en ?? null;

/// What the sign-in screen says about the retention of sign-in addresses (O-1): in words, and never as a number nobody chose.
export function retentionStatement(days: number | null): string {
  return days == null ? "Retention period not set — sign-in addresses are kept" : `Sign-in addresses are kept for ${days} ${days === 1 ? "day" : "days"}`;
}

/// The settings sign-in needs, each known to be set. Null while any is unset: then sign-in refuses and `unsetSettings` says which.
export interface SignInSettings {
  staffIdleMinutes: number;
  staffAbsoluteMinutes: number;
  maxConcurrentSessions: number;
  concurrentSessionAction: "REVOKE_OLDEST" | "REFUSE_NEW";
  maxFailedAttempts: number;
  lockoutMinutes: number;
  addressThrottleAttempts: number;
  addressThrottleMinutes: number;
}

export function signInSettings(policy: SecurityPolicyValues | null): SignInSettings | null {
  if (!policy) return null;
  const { staffIdleMinutes, staffAbsoluteMinutes, maxConcurrentSessions, concurrentSessionAction, maxFailedAttempts, lockoutMinutes, addressThrottleAttempts, addressThrottleMinutes } = policy;
  if (
    staffIdleMinutes == null ||
    staffAbsoluteMinutes == null ||
    maxConcurrentSessions == null ||
    concurrentSessionAction == null ||
    maxFailedAttempts == null ||
    lockoutMinutes == null ||
    addressThrottleAttempts == null ||
    addressThrottleMinutes == null
  ) {
    return null;
  }
  return { staffIdleMinutes, staffAbsoluteMinutes, maxConcurrentSessions, concurrentSessionAction, maxFailedAttempts, lockoutMinutes, addressThrottleAttempts, addressThrottleMinutes };
}

export const EMPTY_POLICY: SecurityPolicyValues = {
  staffIdleMinutes: null,
  staffAbsoluteMinutes: null,
  supplierIdleMinutes: null,
  supplierAbsoluteMinutes: null,
  maxConcurrentSessions: null,
  concurrentSessionAction: null,
  maxFailedAttempts: null,
  lockoutMinutes: null,
  addressThrottleAttempts: null,
  addressThrottleMinutes: null,
  passwordMinLength: null,
  resetCodeValidityMinutes: null,
  paperSignatureRecording: null,
  signInDetailRetentionDays: null,
};

/**
 * Fill the settings that are unset from what an operator supplied, and never change one that is set: changing a setting is a
 * configuration change that needs a second person (Phase 2c), not something a command does in passing. Gives back the merged values and the
 * keys it filled, in the policy's own order.
 */
export function fillUnset(existing: SecurityPolicyValues | null, supplied: Partial<SecurityPolicyValues>): { values: SecurityPolicyValues; filled: SecurityPolicyKey[] } {
  const values: SecurityPolicyValues = { ...EMPTY_POLICY, ...(existing ?? {}) };
  const filled: SecurityPolicyKey[] = [];
  for (const key of Object.keys(EMPTY_POLICY) as SecurityPolicyKey[]) {
    const wanted = supplied[key];
    if (values[key] == null && wanted != null) {
      (values as unknown as Record<string, unknown>)[key] = wanted;
      filled.push(key);
    }
  }
  return { values, filled };
}

/// The validity range of each numeric setting: the bounds the database CHECK holds (`SecurityPolicy_ranges`), repeated here so a screen or a command says it in words before the write. They keep a typing mistake out. They are not policy: nothing says what a customer should choose within them.
export const SETTING_RANGES: Partial<Record<SecurityPolicyKey, { min: number; max: number; unit: string }>> = {
  staffIdleMinutes: { min: 1, max: 10080, unit: "minutes" },
  staffAbsoluteMinutes: { min: 1, max: 43200, unit: "minutes" },
  supplierIdleMinutes: { min: 1, max: 10080, unit: "minutes" },
  supplierAbsoluteMinutes: { min: 1, max: 43200, unit: "minutes" },
  maxConcurrentSessions: { min: 1, max: 100, unit: "sessions" },
  maxFailedAttempts: { min: 1, max: 100, unit: "attempts" },
  lockoutMinutes: { min: 1, max: 10080, unit: "minutes" },
  addressThrottleAttempts: { min: 1, max: 10000, unit: "attempts" },
  addressThrottleMinutes: { min: 1, max: 10080, unit: "minutes" },
  passwordMinLength: { min: 8, max: 256, unit: "characters" },
  resetCodeValidityMinutes: { min: 1, max: 10080, unit: "minutes" },
  signInDetailRetentionDays: { min: 1, max: 3650, unit: "days" },
};

const UNIT_WORDS: Record<string, string> = { minutes: "minit", sessions: "sesi", attempts: "percubaan", characters: "aksara", days: "hari" };

/// A value outside its setting's range, in both languages, or null.
export function rangeFaultWords(key: SecurityPolicyKey, value: number): SettingLabel | null {
  const range = SETTING_RANGES[key];
  if (!range) return null;
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    return {
      en: `Enter a whole number from ${range.min} to ${range.max} ${range.unit}.`,
      ms: `Masukkan nombor bulat dari ${range.min} hingga ${range.max} ${UNIT_WORDS[range.unit] ?? range.unit}.`,
    };
  }
  return null;
}

export const rangeFault = (key: SecurityPolicyKey, value: number): string | null => rangeFaultWords(key, value)?.en ?? null;
