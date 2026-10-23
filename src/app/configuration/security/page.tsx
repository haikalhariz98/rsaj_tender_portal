import { permissionGate, requireStaff } from "@/app/_auth/actor";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { InfoChip } from "@/components/ui/info-chip";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MoreText } from "@/components/ui/more-text";
import { KeyValues } from "@/components/ui/stat";
import { SettingValue, settingLine } from "@/components/setup/setting-value";
import { HistoryButton } from "@/components/history-drawer";
import { settingChoices, settingValueWords } from "@/lib/auth/configuration-change-words";
import { SETTING_LABELS, settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import type { SecurityPolicyKey } from "@/lib/auth/types";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";

import { ProposeSetting } from "../changes/editors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign-in settings" };

/**
 * The organisation's sign-in settings (ADR 0034 D17, Phase 2c). Every one is the customer's to choose and is not set until they have: nothing here has a default,
 * and sign-in refuses and names what is unset. They are read here and changed only by proposing a change, which a different person with the permission
 * applies (the change is read, and decided, under Changes awaiting a second person). The first values are set by the bootstrap command.
 */

const GROUPS: { title: string; blurb: string; keys: SecurityPolicyKey[] }[] = [
  { title: "Staff sessions", blurb: "How long a signed-in staff member may be idle, and how long a session may last.", keys: ["staffIdleMinutes", "staffAbsoluteMinutes", "maxConcurrentSessions", "concurrentSessionAction"] },
  { title: "Supplier sessions", blurb: "The same for a supplier's sign-in.", keys: ["supplierIdleMinutes", "supplierAbsoluteMinutes"] },
  { title: "Wrong passwords", blurb: "When an account is locked and when an address is held back. A lock ends by itself, or an administrator unlocks it.", keys: ["maxFailedAttempts", "lockoutMinutes", "addressThrottleAttempts", "addressThrottleMinutes"] },
  { title: "Passwords and codes", blurb: "The shortest password, and how long a one-time code stays valid.", keys: ["passwordMinLength", "resetCodeValidityMinutes"] },
  { title: "Sealed bids", blurb: "Used when bids are opened online.", keys: ["sealingPassphraseMinLength"] },
  { title: "Approval of changes", blurb: "Whether a change to settings waits for a second admin. Turning it on is saved at once; turning it off needs a second admin to agree.", keys: ["twoPersonChanges"] },
  { title: "Signatures and records", blurb: "Whether a paper decision may be recorded for someone else, and how long sign-in addresses are kept.", keys: ["paperSignatureRecording", "signInDetailRetentionDays"] },
];

/// What a setting holds back while it is not set, or the caution to read before choosing: one popover beside the value.
const CAUTION: Partial<Record<SecurityPolicyKey, string>> = {
  paperSignatureRecording: "A paper decision is refused until this is chosen.",
  concurrentSessionAction: "Sign-in is refused until this is chosen.",
  signInDetailRetentionDays: "While it is not set, sign-in addresses are kept.",
  twoPersonChanges: "While it is off, a save applies at once and the history records that one person made it.",
  sealingPassphraseMinLength: "At least 12. A forgotten passphrase cannot be recovered. Bid sealing says what this holds back.",
};

export default async function SecurityPage() {
  const actor = await requireStaff();
  const gate = await permissionGate(actor, "security.policy");
  if (!gate.ok) {
    return (
      <>
        <PageHeader title="Sign-in settings" info={{ title: "Sign-in settings", text: "How long a session lasts, when an account is locked, and how long a password must be." }} />
        <Callout tone="warn" title="Only an administrator manages these settings">
          {gate.message}
        </Callout>
      </>
    );
  }

  const [policy, policyRow, waiting] = await Promise.all([
    loadSecurityPolicy(db, actor.organisationId),
    db.securityPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { id: true } }),
    db.configurationChange.findMany({ where: { organisationId: actor.organisationId, kind: "SECURITY_POLICY", status: "PROPOSED" }, select: { payload: true } }),
  ]);
  // Which settings a change is already waiting on, so a second proposal is not made blind to the first.
  const proposed = new Set(waiting.flatMap((w) => Object.keys(((w.payload as { changes?: Record<string, unknown> }).changes ?? {}) as object)));
  const unset = unsetSettings(policy, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE", "SET_OFFICER_SHARE");
  // Closed means sign-in itself cannot work: only its own needs are named here. The rest show as "Not set" on their own rows.
  const signInUnset = unsetSettings(policy, "SIGN_IN");

  return (
    <>
      <PageHeader
        title="Sign-in settings"
        info={{ title: "Sign-in settings", text: "How long a session lasts, when an account is locked, and how long a password must be. Each is the organisation's choice and has no default; sign-in refuses and names what is not set. Changes are made by proposing them, and a second admin applies them unless that is turned off." }}
        badge={unset.length > 0 ? <Badge tone="warn">{`${unset.length} not set`}</Badge> : <Badge tone="ok">All set</Badge>}
        actions={
          <>
            {policyRow && <HistoryButton entity="SecurityPolicy" entityId={policyRow.id} label="Sign-in settings" />}
            <ButtonLink href="/approvals?tab=changes" variant="secondary" size="sm">
              Settings changes
            </ButtonLink>
          </>
        }
      />

      <div className="mb-5"><InfoChip tone="warn" detail={AUTH_WORDS.secondFactorNotBuilt.en}>Password only</InfoChip></div>

      {!policy && (
        <Callout tone="warn" title="No sign-in settings. Nobody can sign in." className="mb-5" />
      )}
      {policy && signInUnset.length > 0 && (
        <Callout tone="warn" title="Sign-in closed. Not set:" className="mb-5">
          {settingLabels(signInUnset).join("; ")}.
        </Callout>
      )}

      {GROUPS.map((g) => (
        <Card key={g.title} className="mb-6 overflow-hidden">
          <CardHeader title={<span className="inline-flex items-center gap-2">{g.title}<MoreText text={g.blurb} label={`About ${g.title}`} /></span>} />
          <CardBody>
            <KeyValues
              columns={2}
              items={g.keys.map((key) => {
                const value = policy?.[key] ?? null;
                const words = value == null ? "Not set" : settingValueWords(key, value);
                const edit = policy ? <ProposeSetting setting={key} label={SETTING_LABELS[key].en} current={words} choices={settingChoices(key)} atOnce={policy.twoPersonChanges === false} /> : undefined;
                return settingLine(
                  SETTING_LABELS[key].en,
                  <span className="flex flex-col items-start gap-1">
                    {value == null ? <SettingValue value={null} unset={CAUTION[key] ?? ""} /> : <span className="inline-flex items-center gap-1 font-medium text-ink">{words}{CAUTION[key] && <MoreText text={CAUTION[key]!} label={`About ${SETTING_LABELS[key].en}`} />}</span>}
                    {proposed.has(key) && <span className="text-[12.5px] text-ink-3">A change is waiting for a second person</span>}
                  </span>,
                  edit,
                );
              })}
            />
          </CardBody>
        </Card>
      ))}
    </>
  );
}
