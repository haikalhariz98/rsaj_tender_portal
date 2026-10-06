import { BuildingIcon, InfoIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { loadRegistrationForm } from "@/lib/portal/apply-repo";
import { APPLY } from "@/lib/portal/labels";
import { loadShell } from "@/lib/shell";

import { ApplicationForm } from "./application-form";

export const dynamic = "force-dynamic";

/**
 * A supplier applies to join the register, without signing in. The application lands in the staff
 * review queue marked as sent through the portal; nothing here reads an application back, so there is
 * no status page. No bank details are asked and nothing is uploaded.
 */
export default async function SupplierRegisterPage() {
  const [{ organisation }, form] = await Promise.all([loadShell(), loadRegistrationForm()]);
  const open = form.ready && form.missing.length === 0;

  return (
    <>
      <PageHeader title={APPLY.title.en} subtitle={APPLY.subtitle(organisation.name).en} info={{ title: APPLY.title.en, text: APPLY.info.en }} />

      {!form.ready ? (
        <Card>
          <EmptyState title={APPLY.closedTitle.en}>{APPLY.noOrganisation.en}</EmptyState>
        </Card>
      ) : !open ? (
        <Card>
          <EmptyState title={APPLY.closedTitle.en} icon={<BuildingIcon size={22} />}>
            {APPLY.closedBody.en} {APPLY.closedMissing.en} {form.missing.map((m) => m.en).join(", ")}.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Callout tone="info" icon={<InfoIcon size={16} />} title={APPLY.beforeTitle.en}>
            <ul className="mt-1 list-disc pl-5">
              {APPLY.beforeItems.map((item) => (
                <li key={item.en}>{item.en}</li>
              ))}
            </ul>
          </Callout>
          <ApplicationForm entityTypes={form.entityTypes} countries={form.countries} formatExample={form.formatExample} notice={form.notice} personalDataNotice={form.personalDataNotice!} />
        </div>
      )}
    </>
  );
}
