import { DownloadLink } from "@/components/attachments/download-link";
import { ClipboardIcon } from "@/components/icons";
import { Badge, SulitValue } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ToneNote } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { through, type Sulit } from "@/lib/auth/sulit-access";
import { RETURN_SLOT_LABEL } from "@/lib/award/labels";
import { ONLINE_STATE_LABEL, type OnlineReturnCardFacts } from "@/lib/award/online-return-view";
import type { LoadedAward } from "@/lib/award/repo";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";
import { day, notSet } from "./shared";

const tri = (v: boolean | null) => (v == null ? notSet("Not recorded") : v ? "Yes" : "No");

/**
 * "Sent online": the contractor's latest return (ADR 0045 D1): who sent it, the day, the typed acceptance page of an indent, the scans to open, and where the officer's decision
 * stands. The identity card number is SULIT: read only for a reader the award's gate grants, as on the paper return, and masked otherwise. Verify and Refuse are the header's.
 */
export async function OnlineReturnCard({ sulit, l, facts, nobodyTold }: { sulit: Sulit<true>; l: LoadedAward; facts: OnlineReturnCardFacts; nobodyTold: string | null }) {
  const { award } = l;
  const row = award.onlineReturns.find((r) => r.id === facts.latest)!;
  const indent = award.instrumentKind !== "LETTER_OF_ACCEPTANCE";
  const ic = indent && sulit.state === "GRANTED" ? ((await db.awardOnlineReturn.findFirst({ where: { id: row.id, organisationId: l.org.id }, select: { icNumber: true } }))?.icNumber ?? "") : "";
  const state = ONLINE_STATE_LABEL[facts.state];
  const files = row.files.filter((f) => !f.detachedAt && !f.version.withdrawnAt);
  const tz = l.org.timeZone;
  return (
    <Card>
      <CardHeader icon={<ClipboardIcon size={17} />} title="Sent online" subtitle={`${row.submittedBySupplierAccount.contact.name}, ${formatDate(day(row.submittedOn)!)}`} actions={<Badge tone={state.tone}>{state.text}</Badge>} />
      <CardBody className="flex flex-col gap-5">
        {nobodyTold && <ToneNote tone="warn">{nobodyTold}</ToneNote>}
        {facts.state === "REFUSED" && (
          <ToneNote tone="err" title={`Refused${row.refusedBy ? ` by ${row.refusedBy.name}` : ""}, ${formatOrgDay(row.refusedAt, tz)}`}>
            {row.refusedReason}
          </ToneNote>
        )}
        {facts.state === "VERIFIED" && <p className="text-[13.5px] text-ink-2">{`Verified${row.verifiedBy ? ` by ${row.verifiedBy.name}` : ""}, ${formatOrgDay(row.verifiedAt, tz)}.`}</p>}
        {indent && (
          <KeyValues
            columns={2}
            items={[
              { label: "Contractor's signatory", value: row.signatoryName || notSet("Not recorded") },
              { label: "Identity card number", value: ic ? <span className="font-mono text-[13px]"><SulitValue of={through(sulit, ic)} /></span> : sulit.state === "WITHHELD" ? <SulitValue of={through(sulit, "")} /> : notSet("Not recorded") },
              { label: "Occupation", value: row.occupation || notSet("Not recorded") },
              { label: "Address", value: row.address || notSet("Not recorded") },
              { label: "Signed in the capacity of", value: row.capacity || notSet("Not recorded") },
              { label: "Contractor signed", value: tri(row.contractorSigned) },
              { label: "Company stamp affixed", value: tri(row.stampAffixed) },
              { label: "Witness", value: row.witnessName || notSet("Not recorded") },
              { label: "Witness signed", value: tri(row.witnessSigned) },
            ]}
          />
        )}
        <ul className="flex flex-col gap-2" aria-label="Files sent">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13.5px] text-ink-2">
                <span className="font-semibold text-ink">{RETURN_SLOT_LABEL[f.purpose as keyof typeof RETURN_SLOT_LABEL] ?? "Scan"}</span> · {f.version.originalFilename}
              </span>
              <DownloadLink href={`/api/documents/versions/${f.versionId}`} className={buttonClass("secondary", "sm")} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.version.originalFilename}`}>
                Open
              </DownloadLink>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
