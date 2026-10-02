import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { CHANNEL_LABEL, NOT_RESTRICTED_CHIP, PAPER_CALLOUT } from "@/lib/suppliers/labels";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { APPLICATION_CHANNELS } from "@/lib/suppliers/types";

import { ApplicationForm } from "./application-form";

export const dynamic = "force-dynamic";

/// Recording a supplier from its paper application (FR-VND-001, a1). The supplier cannot sign in yet.
export default async function NewSupplierApplicationPage() {
  const header = <PageHeader eyebrow={<Link href="/suppliers">Suppliers</Link>} title="Record a paper application" subtitle="A new supplier, recorded by an officer from the application it handed in." />;
  const org = await supplierOrg();
  if (!org) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const [cfg, people] = await Promise.all([loadSupplierConfig(org.id), db.person.findMany({ where: { organisationId: org.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const list = (kind: "ENTITY_TYPE" | "COUNTRY") => cfg.lists.filter((l) => l.list === kind && cfg.live(l, org.today)).map((l) => ({ value: l.code, label: l.nameEn }));
  return (
    <>
      {header}
      <Callout tone="info" className="mb-6" title="Recorded on paper">
        {PAPER_CALLOUT.en} Its documents are lodged and checked on its record once it is recorded.
      </Callout>
      <ApplicationForm
        entityTypes={list("ENTITY_TYPE")}
        countries={list("COUNTRY")}
        channels={APPLICATION_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c].en }))}
        people={people.map((p) => ({ value: p.id, label: p.name }))}
        formatExample={cfg.format?.example || null}
        today={org.today}
        notRestricted={NOT_RESTRICTED_CHIP.en}
      />
    </>
  );
}
