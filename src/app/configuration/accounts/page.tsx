import { permissionGate, requireStaff } from "@/app/_auth/actor";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";
import { secondPersonNotice } from "@/lib/auth/administration-rules";
import { loadAccountsView, type AccountRow } from "@/lib/auth/administration-view";
import { RUNTIME_ROLE_WORDS, warnsOnly } from "@/lib/auth/db-role";
import { runtimeRoleCheck } from "@/lib/auth/runtime-role-store";
import { settingLabels } from "@/lib/auth/policy";
import { ACCOUNT_STATUS_WORDS } from "@/lib/auth/words";
import { formatOrgDateTime } from "@/lib/format";

import { Section, Stat, Stats } from "../records-ui";
import { ProposeAccountCode, ProposeAdministrator } from "../changes/editors";
import { CreateAccount, DisableAccount, EnableAccount, IssueCode, UnlockAccount } from "./editors";

export const dynamic = "force-dynamic";

const STATUS_TONE = { ACTIVE: "ok", PENDING_ACTIVATION: "warn", DISABLED: "err" } as const;

/**
 * Sign-in accounts (Phase 1b): who can sign in, and the administrator's acts on them. An account is made for a person on record; it waits for an
 * activation code that an administrator issues and hands over by hand (the product sends nothing). Reached by whoever holds `accounts.manage`, which only an
 * administrator holds (Phase 2c). A code for the account of an administrator, or of someone who holds or has held an office, a seat or a delegation, and making or ending an administrator, need a
 * second person: they are proposed here and decided under Changes awaiting a second person.
 */
export default async function AccountsPage() {
  const actor = await requireStaff();
  const zone = actor.organisationTimeZone;

  const gate = await permissionGate(actor, "accounts.manage");
  if (!gate.ok) {
    return (
      <>
        <PageHeader title="Sign-in accounts" info={{ title: "Sign-in accounts", text: "Who can sign in, and how they get their first password." }} />
        <Callout tone="warn" title="Only an administrator manages accounts">
          {gate.message}
        </Callout>
      </>
    );
  }

  const now = new Date();
  const view = await loadAccountsView(actor, now);
  // Phase 1d: whether the app runs as its own database role. A failed check says nothing rather than guessing.
  const role = await runtimeRoleCheck().catch(() => null);
  const waiting = view.rows.filter((r) => r.status === "PENDING_ACTIVATION").length;
  const locked = view.rows.filter((r) => r.lockedUntil && r.lockedUntil > now).length;

  return (
    <>
      <PageHeader
        title="Sign-in accounts"
        info={{ title: "Sign-in accounts", text: "Who can sign in, and how they get their first password." }}
        actions={
          <>
            <ButtonLink href="/configuration/changes" variant="secondary" size="sm">
              Changes awaiting a second person
            </ButtonLink>
            <CreateAccount people={view.people} />
          </>
        }
      />

      {role && !role.safe && warnsOnly(role.reason) && (
        <Callout tone="warn" title="Database login too broad. Operator reruns role setup." className="mb-5">
          Runs as {RUNTIME_ROLE_WORDS[role.reason]}.
        </Callout>
      )}

      {role && !role.safe && !warnsOnly(role.reason) && (
        <Callout tone="warn" title={role.refuseSignIn ? "Sign-in refused: database login too broad. Contact the operator." : "Database login too broad. Production refuses sign-in. Contact the operator."} className="mb-5">
          Runs as {RUNTIME_ROLE_WORDS[role.reason]}.
        </Callout>
      )}

      {view.codeSettingsUnset.length > 0 && (
        <Callout tone="warn" title="Codes cannot be issued. Not set:" className="mb-5">
          {settingLabels(view.codeSettingsUnset).join("; ")}.
        </Callout>
      )}

      <Stats>
        <Stat label="Accounts" value={view.rows.length === 0 ? null : view.rows.length} hint={view.rows.length === 0 ? "Nobody can sign in" : "People who can sign in"} />
        <Stat label="Waiting for activation" value={view.rows.length === 0 ? null : waiting} hint="Need a code handed over" />
        <Stat label="Locked now" value={view.rows.length === 0 ? null : locked} hint="Too many wrong passwords" />
      </Stats>

      <Section
        title="Accounts"
        blurb="One account per person. A code is shown once, to the administrator who issues it, and never for their own account."
        empty="No account exists yet. Create one for a person on record, then issue an activation code."
        count={view.rows.length}
      >
        <Table>
          <colgroup>
            <col />
            <col style={{ width: "17%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "26%" }} />
          </colgroup>
          <THead>
            <Th>Person</Th>
            <Th>Sign-in name</Th>
            <Th>Standing</Th>
            <Th>Last signed in</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {view.rows.map((r) => (
              <Tr key={r.id}>
                <Td label="Person" title={r.personName}>
                  <CellStack
                    title={r.personName}
                    sub={[r.jobTitle, holdingsWords(r)].filter(Boolean).join(" · ") || undefined}
                    aside={
                      <>
                        {r.isYou && <Badge tone="brand">You</Badge>}
                        {r.isAdministrator && <Badge outline>Administrator</Badge>}
                      </>
                    }
                  />
                </Td>
                <Td label="Sign-in name" className="font-mono text-[13px] text-ink-2">
                  {r.loginName}
                </Td>
                <Td label="Standing">
                  <div className="flex flex-col items-start gap-1">
                    <Badge tone={STATUS_TONE[r.status]}>{ACCOUNT_STATUS_WORDS[r.status]}</Badge>
                    {r.lockedUntil && r.lockedUntil > now && <Badge tone="warn">Locked until {formatOrgDateTime(r.lockedUntil, zone)}</Badge>}
                    {r.openCode && <span className="text-[12.5px] text-ink-3">{r.openCode.purpose === "ACTIVATION" ? "Activation" : "Reset"} code valid until {formatOrgDateTime(r.openCode.expiresAt, zone)}</span>}
                    {r.status === "DISABLED" && r.disabledReason && <span className="text-[12.5px] text-ink-3">{r.disabledReason}</span>}
                    {!r.personActive && r.status !== "DISABLED" && <span className="text-[12.5px] text-ink-3">The person is no longer active</span>}
                  </div>
                </Td>
                <Td label="Last signed in" className="text-ink-2">
                  {r.lastSignInAt ? formatOrgDateTime(r.lastSignInAt, zone) : "Never"}
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="StaffAccount" entityId={r.id} label={`Sign-in account of ${r.personName}`} />
                    {rowActions(r, now)}
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}

function holdingsWords(r: AccountRow): string | null {
  const h = r.holdings;
  const parts = [h.offices > 0 && `${h.offices} ${h.offices === 1 ? "office" : "offices"}`, h.seats > 0 && `${h.seats} ${h.seats === 1 ? "seat" : "seats"}`, h.delegations > 0 && `${h.delegations} ${h.delegations === 1 ? "delegation" : "delegations"}`].filter(Boolean);
  return parts.length > 0 ? `holds ${parts.join(", ")}` : null;
}

function rowActions(r: AccountRow, now: Date) {
  // A code for an administrator's account, or for a person who holds or has held anything (ended or not), needs a second person. Making someone an administrator
  // is judged on what they hold now, which is what the rule of keeping administration apart from transactions asks.
  const notice = secondPersonNotice({ isAdministrator: r.isAdministrator, held: r.held });
  const holdsNow = r.holdings.offices + r.holdings.seats + r.holdings.delegations > 0;
  const locked = (r.lockedUntil != null && r.lockedUntil > now) || r.failedAttempts > 0;
  // An administrator's or office holder's code is made by two people: proposed here, issued by a second administrator. Everyone else's is issued directly.
  const codeFor = (purpose: "ACTIVATION" | "RESET") =>
    notice ? <ProposeAccountCode accountId={r.id} name={r.personName} purpose={purpose} notice={notice} /> : <IssueCode accountId={r.id} name={r.personName} purpose={purpose} />;
  return (
    <>
      {r.status === "PENDING_ACTIVATION" && codeFor("ACTIVATION")}
      {r.status === "ACTIVE" && !r.isYou && codeFor("RESET")}
      {r.status === "ACTIVE" && r.personActive && !r.isAdministrator && !holdsNow && <ProposeAdministrator accountId={r.id} name={r.personName} direction="GRANT" />}
      {r.status === "ACTIVE" && r.isAdministrator && <ProposeAdministrator accountId={r.id} name={r.personName} direction="REVOKE" />}
      {locked && r.status !== "DISABLED" && <UnlockAccount accountId={r.id} name={r.personName} />}
      {r.status === "DISABLED" ? <EnableAccount accountId={r.id} name={r.personName} /> : !r.isYou && <DisableAccount accountId={r.id} name={r.personName} loginName={r.loginName} />}
    </>
  );
}
