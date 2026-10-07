import { requireStaff } from "@/app/_auth/actor";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";
import { officeHolderNotice } from "@/lib/auth/administration-rules";
import { loadAccountsView, type AccountRow } from "@/lib/auth/administration-view";
import { runtimeRoleCheck } from "@/lib/auth/runtime-role-store";
import { settingLabels } from "@/lib/auth/policy";
import { ACCOUNT_STATUS_WORDS } from "@/lib/auth/words";
import { formatOrgDateTime } from "@/lib/format";

import { Section, Stat, Stats } from "../records-ui";
import { CreateAccount, DisableAccount, EnableAccount, IssueCode, UnlockAccount } from "./editors";

export const dynamic = "force-dynamic";

const STATUS_TONE = { ACTIVE: "ok", PENDING_ACTIVATION: "warn", DISABLED: "err" } as const;

/**
 * Sign-in accounts (Phase 1b): who can sign in, and the administrator's acts on them. An account is made for a person on record; it waits for an
 * activation code that an administrator issues and hands over by hand (the product sends nothing). Reached only by an administrator until permissions arrive.
 */
export default async function AccountsPage() {
  const actor = await requireStaff();
  const zone = actor.organisationTimeZone;

  if (!actor.isAdministrator) {
    return (
      <>
        <PageHeader title="Sign-in accounts" subtitle="Who can sign in, and how they get their first password." />
        <Callout tone="warn" title="Only an administrator manages sign-in accounts">
          You are signed in, but this screen is for administrators. Ask one if somebody needs an account or a code.
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
        subtitle="Who can sign in, and how they get their first password."
        actions={<CreateAccount people={view.people} />}
      />

      {role && !role.safe && (
        <Callout tone="warn" title="This copy is connected to its database with too much authority" className="mb-5">
          It runs as the {role.reason === "SUPERUSER" ? "database superuser" : "owner of the tables"}, not as the app&apos;s own database role, so nothing but the
          trail&apos;s triggers stops a change to the audit trail or the sign-in log.{" "}
          {role.refuseSignIn
            ? "Sign-in is refused until the operator sets the app's own role up."
            : "This is allowed while developing only: a production copy refuses every sign-in like this. The operator sets the app's own role up as the README describes (Running in production)."}
        </Callout>
      )}

      {view.codeSettingsUnset.length > 0 && (
        <Callout tone="warn" title="Codes cannot be issued yet" className="mb-5">
          The organisation has not set: {settingLabels(view.codeSettingsUnset).join("; ")}. These are its own to choose; the operator sets them when creating the first administrator.
        </Callout>
      )}

      <Stats>
        <Stat label="Accounts" value={view.rows.length === 0 ? null : view.rows.length} hint={view.rows.length === 0 ? "Nobody can sign in" : "People who can sign in"} />
        <Stat label="Waiting for activation" value={view.rows.length === 0 ? null : waiting} hint="Need a code handed over" />
        <Stat label="Locked now" value={view.rows.length === 0 ? null : locked} hint="Too many wrong passwords" />
      </Stats>

      <Section
        title="Accounts"
        blurb="A person has at most one account. A code is shown once, to the administrator who issues it, who hands it over by hand; nobody issues a code for their own account."
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
  const notice = officeHolderNotice(r.holdings);
  const locked = (r.lockedUntil != null && r.lockedUntil > now) || r.failedAttempts > 0;
  return (
    <>
      {r.status === "PENDING_ACTIVATION" && <IssueCode accountId={r.id} name={r.personName} purpose="ACTIVATION" notice={notice} />}
      {r.status === "ACTIVE" && !r.isYou && <IssueCode accountId={r.id} name={r.personName} purpose="RESET" notice={notice} />}
      {locked && r.status !== "DISABLED" && <UnlockAccount accountId={r.id} name={r.personName} />}
      {r.status === "DISABLED" ? <EnableAccount accountId={r.id} name={r.personName} /> : !r.isYou && <DisableAccount accountId={r.id} name={r.personName} loginName={r.loginName} />}
    </>
  );
}
