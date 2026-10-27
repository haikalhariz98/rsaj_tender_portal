import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { rowInForce } from "@/lib/contract/in-force";
import { storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { senFromDecimal } from "@/lib/money";
import { requireStaff } from "@/app/_auth/actor";

import { FundingScreen } from "./editors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funding" };

const INFO = { title: "Funding", text: "Where the money comes from, which project categories each source may fund, and the impact figures reported per project." };

/**
 * Settings › Funding (ADR 0046): funding sources, project categories and impact measures, as three tabs. Every list ships empty; the
 * customer's own values arrive in its pack.
 */
export default async function FundingSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireStaff();
  const org = await exerciseOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        <PageHeader title="Funding" info={INFO} />
        <Card>
          <EmptyState title="No organisation is configured" />
        </Card>
      </>
    );
  }
  const where = { organisationId: org.id };
  const orderBy = [{ sortOrder: "asc" as const }, { nameEn: "asc" as const }];
  const [{ tab }, sources, categories, measures] = await Promise.all([
    searchParams,
    db.fundingSource.findMany({ where, orderBy }),
    db.projectCategory.findMany({ where, orderBy }),
    db.impactMeasure.findMany({ where, orderBy }),
  ]);
  const retirement = (x: { retiredOn: Date | null }) => {
    const retired = x.retiredOn != null && (org.today ? !rowInForce(x, org.today) : true);
    return {
      retiredOn: x.retiredOn ? storedDay(x.retiredOn) : null,
      retired,
      retiredText: x.retiredOn ? `${retired ? "No longer used from" : "In use until"} ${formatDate(storedDay(x.retiredOn))}` : null,
    };
  };
  const unset = sources.filter((s) => s.retiredOn == null && s.categoriesRestricted == null).length;

  return (
    <>
      <PageHeader title="Funding" info={INFO} subtitle={unset > 0 ? `Eligibility not set on ${unset} ${unset === 1 ? "source" : "sources"}` : undefined} />
      <FundingScreen
        view={tab ?? null}
        today={org.today}
        sources={sources.map((s) => ({
          id: s.id,
          nameEn: s.nameEn,
          provenance: s.provenance,
          governingSource: s.governingSource,
          sortOrder: s.sortOrder,
          envelopeSen: s.envelope == null ? null : senFromDecimal(s.envelope).toString(),
          envelope: s.envelope?.toString() ?? null,
          categoriesRestricted: s.categoriesRestricted,
          eligibleCategoryCodes: s.eligibleCategoryCodes,
          eligibilityProvenance: s.eligibilityProvenance,
          notes: s.notes,
          ...retirement(s),
        }))}
        categories={categories.map((c) => ({ id: c.id, code: c.code, nameEn: c.nameEn, provenance: c.provenance, governingSource: c.governingSource, sortOrder: c.sortOrder, ...retirement(c) }))}
        measures={measures.map((m) => ({ id: m.id, nameEn: m.nameEn, unit: m.unit, provenance: m.provenance, governingSource: m.governingSource, sortOrder: m.sortOrder, ...retirement(m) }))}
      />
    </>
  );
}
