import Link from "next/link";

import { requireSettingsReader } from "./section-route";
import { ChecklistCard } from "@/components/setup/checklist";
import { Card, CardBody } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Meter } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { formatOrgDay } from "@/lib/format";
import { SETTINGS_SECTIONS } from "@/lib/nav";
import { progressOf } from "@/lib/setup/checklist";
import { loadChecklist } from "@/lib/setup/checklist-repo";

export const dynamic = "force-dynamic";

/// Configuration opens on the Getting-started checklist (ADR 0043 D4): what is set, what is not, one link to each. The rail is still the index.
export default async function ConfigurationPage() {
  const actor = await requireSettingsReader();
  const { items } = await loadChecklist(db, actor.organisationId);
  const at = (d: Date) => formatOrgDay(d, actor.organisationTimeZone);
  const { done, total } = progressOf(items);
  const complete = done === total;
  const cards = (
    <div className="flex flex-col gap-6">
      {SETTINGS_SECTIONS.map((s) => <ChecklistCard key={s.slug} title={s.label.en} items={items.filter((i) => i.section === s.slug && i.kind !== "go-live")} at={at} />)}
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
      <nav aria-label="Settings sections" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map((s) => (
          <Link key={s.slug} href={`/configuration/${s.slug}`} className="group rounded-card border border-line bg-surface p-5 shadow-card no-underline transition hover:border-brand-300 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
            <span className="block text-[15px] font-bold text-ink group-hover:text-brand-700">{s.label.en}</span>
            <span className="mt-1 block text-[13px] text-ink-3">{s.about}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
