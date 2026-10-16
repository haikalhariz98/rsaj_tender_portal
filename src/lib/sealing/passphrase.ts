/**
 * The officer's passphrase attempts (ADR 0036 D4, ruling 20v; wave 3b step 13). Pure.
 *
 * Wrong entries lock on the officer key's own counter, apart from the sign-in password's. The thresholds are the organisation's sign-in lockout settings (`SecurityPolicy.maxFailedAttempts`
 * and `lockoutMinutes`), read, never a literal here: where either is unset the passphrase is not attempted at all, because an unset limit is not an unlimited one. A pepper this copy does
 * not hold is not a wrong passphrase and never reaches this counter (`PEPPER_NOT_HELD`, checked before any unwrap).
 */

import { afterFailedAttempt, isLocked, type AccountLockState } from "@/lib/auth/lockout";

export type PassphraseGate = "LOCKED" | "LOCKOUT_NOT_SET";

export interface PassphrasePolicy { maxFailedAttempts: number | null; lockoutMinutes: number | null }

/// Whether the passphrase may be tried now, before it is derived.
export function passphraseGate(key: AccountLockState, policy: PassphrasePolicy, now: Date): PassphraseGate | null {
  if (policy.maxFailedAttempts == null || policy.lockoutMinutes == null) return "LOCKOUT_NOT_SET";
  if (isLocked(key, now)) return "LOCKED";
  return null;
}

/// What the key's counter holds after one more wrong passphrase. The caller has passed `passphraseGate`.
export function afterWrongPassphrase(key: AccountLockState, policy: PassphrasePolicy, now: Date): AccountLockState {
  return afterFailedAttempt(key, { maxFailedAttempts: policy.maxFailedAttempts, lockoutMinutes: policy.lockoutMinutes }, now);
}

export const PASSPHRASE_GATE_WORDS: Readonly<Record<PassphraseGate, string>> = {
  LOCKED: "Too many wrong passphrases were entered for this key, so it is locked for a while. Nothing was opened.",
  LOCKOUT_NOT_SET: "The organisation's sign-in lockout limits are not set, so a passphrase cannot be tried. They are set on Configuration, under security.",
};

export const WRONG_PASSPHRASE_WORDS = "That passphrase did not unlock your key. The wrong entry was counted. Nothing was opened.";
export const NOT_YOUR_KEY_WORDS = "Your key for this exercise is not the one the exercise key was split to. Each named officer must set their share again before the bids can be opened.";
