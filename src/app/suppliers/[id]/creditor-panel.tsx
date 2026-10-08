import { DataList, type Column, type Row } from "@/components/data-list";
import { LockIcon } from "@/components/icons";
import { RegistrationSummaryCards } from "@/components/registration-summary";
import { sulitGate } from "@/app/_auth/sulit";
import { Badge, SulitTag } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { CREDITOR_PROFILE_FIELDS } from "@/lib/auth/creditor-access-store";
import type { Sulit } from "@/lib/auth/sulit-access";
import type { StaffActor } from "@/lib/auth/types";
import { storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { creditorStanding, creditorStandingWords, creditorVersionState, type CreditorVersionState } from "@/lib/payment/creditor";
import { registrationSummary, type SummaryCreditor, type SummaryRecord } from "@/lib/portal/registration/summary";
import { creditorSummaryOf, loadCreditorRows } from "@/lib/portal/registration/summary-store";
import { creditorReviewFaults, creditorReviewText } from "@/lib/suppliers/creditor-review";
import type { LoadedSupplier } from "@/lib/suppliers/repo";

import { VerifyCreditorDrawer } from "./editors";

/**
 * The Creditor profile tab of a supplier (Phase 4b, FR-VND-005): the supplier's bank details, SULIT, versioned. Read only while this tab is the one open (it is `lazy`), so the details are
 * read, and the reading logged, only for the tab that shows them. A list of the versions sent and where each stands (in force, awaiting a check, superseded, not in order); the standing in
 * words (payments go to the version in force, and a newer one changes nothing until it is checked); and the selected version's details, judged by the creditor profile's own gate:
 * the holders of a step on the registration's route, the officer who checked it, and the staff the organisation grants reading to. Withheld, it says why in words and shows none of the
 * values. One officer checks it (a signed act); a later change by the supplier is a new version.
 */

const STATE_WORDS: Readonly<Record<CreditorVersionState, { text: string; tone: "ok" | "warn" | "err" | "neutral" }>> = {
  IN_FORCE: { text: "In force", tone: "ok" },
  AWAITING_CHECK: { text: "Awaiting verification", tone: "warn" },
  NOT_IN_ORDER: { text: "Not in order", tone: "err" },
  SUPERSEDED: { text: "Superseded", tone: "neutral" },
  DRAFT: { text: "Being filled in", tone: "neutral" },
};

const COLUMNS: Column[] = [
  { key: "version", label: "Version", width: "230px", nowrap: true },
  { key: "sent", label: "Sent", width: "170px", nowrap: true },
  { key: "state", label: "Where it stands", width: "190px" },
  { key: "checked", label: "Checked" },
];

export async function CreditorPanel({ actor, l, version }: { actor: StaffActor; l: LoadedSupplier; version: string | null }) {
  const s = l.supplier;
  const zone = l.org.timeZone;
  const today = l.org.today;
  const scope = { organisationId: l.org.id, supplierId: s.id };
  const [allRows, drafting] = await Promise.all([loadCreditorRows(db, scope), db.creditorProfile.count({ where: { supplierId: s.id, organisationId: l.org.id, submittedAt: null } })]);
  const rows = allRows.filter((r) => r.submittedAt != null);
  const facts = rows.map((r) => ({ version: r.version, sent: true, verification: r.verification }));
  const standing = creditorStanding(facts);
  const words = creditorStandingWords(standing);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader icon={<LockIcon size={17} />} title="Creditor profile" subtitle="The supplier's bank and beneficiary details." actions={<SulitTag />} />
        <EmptyState title="No bank details have been sent">
          {drafting > 0 ? "The supplier has started on its bank details but has not sent them. They are its working copy until it does, and are not shown here." : "The supplier enters its bank details in its registration, in the portal. Nothing is held for it here, and payments to it are refused until an officer has checked some."}
        </EmptyState>
      </Card>
    );
  }

  const selected = rows.find((r) => String(r.version) === version) ?? rows[0]!;
  // The selected version's details, through the creditor profile's own gate: one answer, logged, shown or withheld.
  const gate = await sulitGate(actor, { scope: "creditorProfile", id: selected.id, label: `${s.reference} · Creditor's profile`, supplierId: s.id, verifiedByPersonId: selected.verifiedByPersonId }, CREDITOR_PROFILE_FIELDS);
  const detail: Sulit<SummaryCreditor | null> = gate.state === "GRANTED" ? { state: "GRANTED", value: await creditorSummaryOf(db, l.org.id, selected), basis: gate.basis } : gate;
  const record: SummaryRecord = { company: { registeredName: s.registeredName, registrationNo: s.registrationNo, formatChecked: null, entityTypeName: null, countryName: null, addressLines: [], incorporatedOn: null, companyEmail: s.companyEmail, bumiputera: { kind: "NO_CLAIM", claim: null, reference: null, verification: null } }, contacts: { state: "GRANTED", value: [], basis: "NAMED_ON_RECORD" }, documents: [], creditor: detail, declarations: [] };
  const section = registrationSummary(record, { day: formatDate }).find((x) => x.key === "creditor")!;

  const listRows: Row[] = rows.map((r) => {
    const st = STATE_WORDS[creditorVersionState({ version: r.version, sent: true, verification: r.verification }, facts)];
    return {
      id: r.id,
      cells: {
        version: { kind: "link", text: `Version ${r.version}${r.version === selected.version ? " · shown below" : ""}`, href: `/suppliers/${s.id}?tab=creditor&version=${r.version}` },
        sent: { kind: "text", text: r.submittedAt ? formatOrgDateTime(r.submittedAt, zone) : "—" },
        state: { kind: "badge", text: st.text, tone: st.tone === "neutral" ? undefined : st.tone },
        checked: { kind: "text", text: r.verification === "NOT_CHECKED" ? "Not yet" : `${r.verifiedOn ? formatDate(storedDay(r.verifiedOn)) : ""}${r.verifiedByName ? ` · ${r.verifiedByName}` : ""}${r.verificationNote ? ` · “${r.verificationNote}”` : ""}` },
      },
      search: "",
    };
  });

  // Whether the check can be made, said beside the button from the same rule the act runs.
  const live = selected.statement.length;
  const blocker = creditorReviewFaults({ state: "VERIFIED", personActive: true, verifiedOn: today, note: "" }, { sent: true, verification: selected.verification, sentOn: selected.submittedAt && today ? todayIn(selected.submittedAt, zone) : null, statementFiles: live }, today).find((f) => f.level === "block");
  const canCheck = selected.verification === "NOT_CHECKED";

  return (
    <div className="flex flex-col gap-6">
      <Callout tone={words.payable ? "ok" : "warn"} title={words.payable ? "Payments can go to this supplier" : "Payments to this supplier are refused"}>
        {words.en} Bank details count for payment only once an officer has checked them; a change by the supplier is a new version and takes effect only after it is checked.
      </Callout>

      <Card className="overflow-hidden">
        <CardHeader icon={<LockIcon size={17} />} title="Creditor profile" subtitle="Versions the supplier has sent. The bank details are SULIT: shown to those named on the registration's route, the officer who checked them, and staff the organisation grants reading to." actions={<SulitTag />} divided={false} />
        <DataList columns={COLUMNS} rows={listRows} toolbar={false} searchable={false} selectable={false} flat emptyTitle="No versions" />
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[15px] font-bold text-ink">Version {selected.version}</h3>
          <Badge tone={STATE_WORDS[creditorVersionState({ version: selected.version, sent: true, verification: selected.verification }, facts)].tone === "neutral" ? undefined : STATE_WORDS[creditorVersionState({ version: selected.version, sent: true, verification: selected.verification }, facts)].tone}>
            {STATE_WORDS[creditorVersionState({ version: selected.version, sent: true, verification: selected.verification }, facts)].text}
          </Badge>
          {canCheck && gate.state === "GRANTED" && <VerifyCreditorDrawer profileId={selected.id} version={selected.version} today={today} blocker={blocker ? creditorReviewText(blocker).en : null} />}
          {selected.statement.map((f) => (
            <ButtonLink key={f.versionId} href={`/api/documents/versions/${f.versionId}`} variant="secondary" size="sm" target="_blank" rel="noopener noreferrer">
              Bank statement: {f.name}
            </ButtonLink>
          ))}
        </div>
        {canCheck && gate.state === "WITHHELD" && <p className="text-[12.5px] text-ink-3">You cannot check these details: you may not read them.</p>}
        <RegistrationSummaryCards sections={[section]} />
      </div>
    </div>
  );
}
