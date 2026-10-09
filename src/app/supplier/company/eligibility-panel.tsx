import { DataList, type Column, type Row } from "@/components/data-list";
import { Callout } from "@/components/ui/feedback";
import { Card, CardHeader } from "@/components/ui/card";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { ELIGIBILITY_PAGE, loadEligibilityTab } from "@/lib/portal/company/company-store";
import { SUPPLIER_VERDICT } from "@/lib/portal/company/eligibility-view";

/**
 * The Company workspace's Eligibility tab (Phase 4c; FR-VND-011, after 615-C1): the opportunities open to everyone, each with whether this supplier meets what it asks. Its own file, so
 * that the list is drawn apart from anything of the supplier's that is SULIT (the scan of a screen's lists holds a list to the fields it can read).
 */

const Section = ({ children }: { children: React.ReactNode }) => <div className="flex max-w-5xl flex-col gap-5">{children}</div>;

const ELIGIBILITY_COLUMNS: Column[] = [
  { key: "exercise", label: "Opportunity", mobile: "primary" },
  { key: "closes", label: "Closes", width: "210px", nowrap: true, mobile: "meta" },
  { key: "verdict", label: "You", width: "150px", mobile: "meta" },
  { key: "because", label: "What stops it", width: "34%", mobile: "meta" },
];

export async function EligibilityPanel({ actor }: { actor: SupplierActor }) {
  const tab = await loadEligibilityTab(db, actor);
  if (!tab.today) return <Callout tone="warn">Your eligibility could not be judged: the organisation&apos;s time zone is not set. Tell the procurement office.</Callout>;
  const rows: Row[] = tab.rows.map((r) => ({
    id: r.id,
    cells: {
      exercise: { kind: "link", text: r.title, href: `/supplier/opportunities/${r.id}`, sub: r.reference },
      closes: { kind: "text", text: r.closing ?? "—" },
      verdict: { kind: "badge", text: SUPPLIER_VERDICT[r.verdict].text, tone: SUPPLIER_VERDICT[r.verdict].tone },
      because: { kind: "text", text: r.because ?? (r.verdict === "ELIGIBLE" ? "Nothing" : "—"), dim: r.because == null },
    },
    search: `${r.title} ${r.reference}`,
  }));
  return (
    <Section>
      <Callout tone="info" title="Judged by the same check the office uses">
        This lists the opportunities open to everyone, and whether you meet what each asks: your registration and standing, the registrations and grades it names, and any restriction. &quot;Not assessed&quot; means something could not be checked, so no one can say yet that you qualify. Open an opportunity for every condition and the reason.
      </Callout>
      <Card>
        <CardHeader title="Opportunities open now" subtitle={tab.open > tab.rows.length ? `The ${ELIGIBILITY_PAGE} that close soonest, of ${tab.open} open.` : `${tab.open} open.`} divided={false} />
        <DataList columns={ELIGIBILITY_COLUMNS} rows={rows} toolbar={false} searchable={false} selectable={false} flat emptyTitle={tab.ready ? "No opportunity is open now" : "The portal is not set up"} emptyBody={tab.ready ? "When the office advertises one, it is listed here with whether you meet what it asks." : "Tell the procurement office."} />
      </Card>
    </Section>
  );
}
