import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";
import { ChecklistCard } from "@/components/setup/checklist";
import { Card, CardBody } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Meter } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { formatOrgDay } from "@/lib/format";
import { progressOf } from "@/lib/setup/checklist";
import { loadChecklist } from "@/lib/setup/checklist-repo";
import type { SettingsSection } from "@/lib/setup/types";

export const dynamic = "force-dynamic";

const SECTIONS: { key: SettingsSection; title: string }[] = [
  { key: "people", title: "People and organisation" },
  { key: "approvals", title: "Approvals" },
  { key: "purchasing", title: "Purchasing" },
  { key: "suppliers-portal", title: "Suppliers and portal" },
  { key: "contracts-payments", title: "Contracts and payments" },
  { key: "system", title: "System" },
];

/// Configuration opens on the Getting-started checklist (ADR 0043 D4): what is set, what is not, one link to each. The rail is still the index.
export default async function ConfigurationPage() {
  const actor = await requireStaff();
  const mayRead = actor.isAdministrator || ["configuration.draft", "configuration.issue", "audit.read"].some((k) => actor.permissions.has(k as never));
  if (!mayRead) redirect("/");
  const { items } = await loadChecklist(db, actor.organisationId);
  const at = (d: Date) => formatOrgDay(d, actor.organisationTimeZone);
  const { done, total } = progressOf(items);
  const complete = done === total;
  const cards = (
    <div className="flex flex-col gap-6">
      {SECTIONS.map((s) => <ChecklistCard key={s.key} title={s.title} items={items.filter((i) => i.section === s.key && i.kind !== "go-live")} at={at} />)}
      <ChecklistCard title="Before go-live" items={items.filter((i) => i.kind === "go-live")} at={at} />
    </div>
  );
  return (
    <>
      <PageHeader title="Getting started" meta={[`${done} of ${total} done`]} />
      <Card className="mb-6">
        <CardBody>
          <Meter percent={(done / total) * 100} showValue={false} label={`${done} of ${total} done`} />
        </CardBody>
      </Card>
      {complete ? <Disclosure title="Setup complete" summary={`${total} of ${total} done`}>{cards}</Disclosure> : cards}
    </>
  );
}
