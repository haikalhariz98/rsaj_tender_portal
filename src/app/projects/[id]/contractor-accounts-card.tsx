import { UsersIcon } from "@/components/icons";
import { Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import type { ContractorAccounts } from "@/lib/project-docs/team-read";

const MORE = "These are the contractor's portal accounts that can act on this contract. Only the procurement office opens them.";

/**
 * The contractor's side of the Team tab (PW-16, PW-17): its active portal accounts, read only. A contact's name is shown only to a reader with the right to read it; without it
 * each row reads "Portal account", and why is behind the information button. "Manage accounts" is a link, and only for a reader who may manage them.
 */
export function ContractorAccountsCard({ accounts }: { accounts: ContractorAccounts }) {
  const { rows, namesWithheld, manageHref, noContractor } = accounts;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<UsersIcon size={17} />}
        title="Contractor's portal accounts"
        subtitle={<MoreText label="About the contractor's accounts" text={namesWithheld ? `${MORE} ${namesWithheld}` : MORE} />}
        divided={rows.length > 0}
        actions={manageHref ? <ButtonLink href={manageHref} size="sm" variant="secondary">Manage accounts</ButtonLink> : undefined}
      />
      {noContractor ? (
        <EmptyState size="sm" title="No contractor on the register" action={<MoreText label="Why" text="This award names no supplier on the register, so there are no portal accounts." />} />
      ) : rows.length === 0 ? (
        <EmptyState size="sm" title="No portal accounts" />
      ) : (
        <ul className="divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.accountId} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13.5px] font-semibold break-words text-ink sm:px-6">
              {r.label}
              <Chip tone="ok">{r.statusLabel}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
