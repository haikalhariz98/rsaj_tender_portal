import type { Tx } from "@/lib/audit/record";

import type { SecurityPolicyValues } from "./types";

/// The organisation's security settings, or null where it has no policy row at all (then every setting is unset).
export async function loadSecurityPolicy(client: Tx, organisationId: string): Promise<SecurityPolicyValues | null> {
  const row = await client.securityPolicy.findUnique({ where: { organisationId } });
  if (!row) return null;
  return {
    staffIdleMinutes: row.staffIdleMinutes,
    staffAbsoluteMinutes: row.staffAbsoluteMinutes,
    supplierIdleMinutes: row.supplierIdleMinutes,
    supplierAbsoluteMinutes: row.supplierAbsoluteMinutes,
    maxConcurrentSessions: row.maxConcurrentSessions,
    concurrentSessionAction: row.concurrentSessionAction,
    maxFailedAttempts: row.maxFailedAttempts,
    lockoutMinutes: row.lockoutMinutes,
    addressThrottleAttempts: row.addressThrottleAttempts,
    addressThrottleMinutes: row.addressThrottleMinutes,
    passwordMinLength: row.passwordMinLength,
    resetCodeValidityMinutes: row.resetCodeValidityMinutes,
    paperSignatureRecording: row.paperSignatureRecording,
    signInDetailRetentionDays: row.signInDetailRetentionDays,
    sealingPassphraseMinLength: row.sealingPassphraseMinLength,
  };
}
