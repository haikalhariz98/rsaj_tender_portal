import { permissionGate, requireStaff } from "@/app/_auth/actor";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { InfoChip } from "@/components/ui/info-chip";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { CellStack, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";
import { settingChoices, settingValueWords } from "@/lib/auth/configuration-change-words";
import { SETTING_LABELS, settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import type { SecurityPolicyKey } from "@/lib/auth/types";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";

import { ProposeSetting } from "../changes/editors";
import { Section } from "../records-ui";

export const dynamic = "force-dynamic";

/**
 * The organisation's sign-in settings (ADR 0034 D17, Phase 2c). Every one is the customer's to choose and is not set until they have: nothing here has a default,
 * and sign-in refuses and names what is unset. They are read here and changed only by proposing a change, which a different person with the permission
 * applies (the change is read, and decided, under Changes awaiting a second person). The first values are set by the bootstrap command.
 */

const GROUPS: { title: string; blurb: string; keys: SecurityPolicyKey[] }[] = [
  {
    title: "Staff sessions",
    blurb: "How long a signed-in staff member may be idle, and how long a session may last at all.",
    keys: ["staffIdleMinutes", "staffAbsoluteMinutes", "maxConcurrentSessions", "concurrentSessionAction"],
  },
  {
    title: "Supplier sessions",
    blurb: "The same for a supplier's sign-in, which the supplier portal uses once it is built.",
    keys: ["supplierIdleMinutes", "supplierAbsoluteMinutes"],
  },
  {
    title: "Wrong passwords",
    blurb: "When an account is locked, and when an address is held back. The lock ends by itself, and an administrator can unlock it.",
    keys: ["maxFailedAttempts", "lockoutMinutes", "addressThrottleAttempts", "addressThrottleMinutes"],
  },
  {
    title: "Passwords and codes",
    blurb: "The shortest password, and how long a one-time code handed over by hand stays valid.",
    keys: ["passwordMinLength", "resetCodeValidityMinutes"],
  },
  {
    title: "Sealed bids",
    blurb: "The shortest unseal passphrase an opening officer may set for an online exercise. No officer can set a share while it is not set.",
    keys: ["sealingPassphraseMinLength"],
  },
  {
    title: "Signatures and records",
    blurb: "Whether a paper decision may be recorded for someone else, and how long sign-in addresses are kept.",
    keys: ["paperSignatureRecording", "signInDetailRetentionDays"],
  },
];

/// What a setting says beside its value where it carries a caution the customer must read before choosing.
const CAUTION: Partial<Record<SecurityPolicyKey, string>> = {
  paperSignatureRecording: "A choice for the organisation, and the product advises neither. While it is not set, a paper decision is refused and the form says so.",
  concurrentSessionAction: "A choice for the organisation, and the product advises neither. While it is not set, sign-in is refused.",
  signInDetailRetentionDays: "While it is not set, sign-in addresses are kept. Legal hold (NFR-RET-002) is not built.",
  sealingPassphraseMinLength: "While it is not set, no opening officer can set a share of an online exercise's key. At least 12; a forgotten passphrase cannot be recovered.",
};

export default async function SecurityPage() {
  const actor = await requireStaff();
  const gate = await permissionGate(actor, "security.policy");
  if (!gate.ok) {
    return (
      <>
        <PageHeader title="Sign-in settings" info={{ title: "Sign-in settings", text: "How long a session lasts, when an account is locked, and how long a password must be." }} />
        <Callout tone="warn" title="Only an administrator manages the sign-in settings">
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

  return (
    <>
      <PageHeader
        title="Sign-in settings"
        info={{ title: "Sign-in settings", text: "How long a session lasts, when an account is locked, and how long a password must be." }}
        badge={unset.length > 0 ? <Badge tone="warn">{`${unset.length} not set`}</Badge> : <Badge tone="ok">All set</Badge>}
        actions={
          <>
            {policyRow && <HistoryButton entity="SecurityPolicy" entityId={policyRow.id} label="Sign-in settings" />}
            <ButtonLink href="/configuration/changes" variant="secondary" size="sm">
              Changes awaiting a second person
            </ButtonLink>
          </>
        }
      />

      <div className="mb-5"><InfoChip tone="warn" detail={AUTH_WORDS.secondFactorNotBuilt.en}>Password only</InfoChip></div>

      {!policy && (
        <Callout tone="warn" title="No sign-in settings. Nobody can sign in. Contact the operator." className="mb-5" />
      )}
      {policy && unset.length > 0 && (
        <Callout tone="warn" title="Sign-in closed. Not set:" className="mb-5">
          {settingLabels(unset).join("; ")}.
        </Callout>
      )}

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title} blurb={g.blurb} empty="" count={g.keys.length}>
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "24%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>
            <THead>
              <Th>Setting</Th>
              <Th>Now</Th>
              <Th className="text-right">Change</Th>
            </THead>
            <tbody>
              {g.keys.map((key) => {
                const value = policy?.[key] ?? null;
                return (
                  <Tr key={key}>
                    <Td label="Setting">
                      <CellStack title={SETTING_LABELS[key].en} sub={CAUTION[key]} />
                    </Td>
                    <Td label="Now">
                      <div className="flex flex-col items-start gap-1">
                        {value == null ? <Badge tone="warn">Not set</Badge> : <span className="font-medium text-ink">{settingValueWords(key, value)}</span>}
                        {proposed.has(key) && <span className="text-[12.5px] text-ink-3">A change is waiting for a second person</span>}
                      </div>
                    </Td>
                    <Td label="Change" className="text-right">
                      {policy ? <ProposeSetting setting={key} label={SETTING_LABELS[key].en} current={value == null ? "Not set" : settingValueWords(key, value)} choices={settingChoices(key)} /> : <span className="text-[12.5px] text-ink-3">Set by the operator first</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Section>
      ))}
    </>
  );
}
