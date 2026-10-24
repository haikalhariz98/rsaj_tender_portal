import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { through, type Sulit } from "@/lib/auth/sulit-access";
import { ClipboardIcon } from "@/components/icons";
import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { SulitValue } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState, ToneNote } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { KeyValues } from "@/components/ui/stat";
import { ACCEPTANCE_FAULT_LABEL, RETURN_ITEM_LABEL, RETURN_SLOT_LABEL, returnScansText, WAITING_FOR_PAPER } from "@/lib/award/labels";
import { type LoadedAward } from "@/lib/award/repo";
import { acceptancePageFaults, RETURN_SCANS, returnState, scansAwaitingPaper, scansMissing, scansRequired, type ReturnRecord } from "@/lib/award/stage-two";
import { isLive } from "@/lib/documents/evidence";
import type { InstrumentKind } from "@/lib/award/types";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/db";
import { ReturnDrawer } from "@/app/awards/editors";
import { loadAttributions } from "@/lib/auth/attribution-read";
import { loadEventPlan } from "@/lib/award/clock-notices";
import { AWARD_RETURN_EVENT_KEY } from "@/lib/award/online-return-store";
import { onlineReturnState } from "@/lib/award/online-return";
import { nobodyToldLine, onlineReturnCardFacts } from "@/lib/award/online-return-view";
import { OnlineReturnCard } from "./online-return-card";
import { QueriesCard } from "./queries-card";
import { notSet, yesNo } from "./shared";


export async function ReturnPanel({ sulit, l, ret, people }: { sulit: Sulit<true>; l: LoadedAward; ret: ReturnRecord | null; people: { value: string; label: string }[] }) {
  const { award } = l;
  const online = onlineReturnCardFacts(award.onlineReturns, { awardStatus: award.status, sulitWithheldWords: null });
  // AC-42 (WV-8): who is told of a return sent online and of a question. Read only for what exists; the line appears when nobody would be.
  const told = async (eventKey: string) => nobodyToldLine(await loadEventPlan(db, { organisationId: l.org.id, organisationCode: l.org.code, requestingUnitCode: l.req.requestingUnitCode, namedPartyId: l.ex.personInChargeId, today: l.org.today, eventKey }));
  const returnTold = online ? await told(AWARD_RETURN_EVENT_KEY.AWARD_RETURN_LODGED) : null;
  const queryTold = award.queries.length > 0 ? await told(AWARD_RETURN_EVENT_KEY.AWARD_QUERY_RAISED) : null;
  // OD-5: the return counts with its scans, except for an award accepted before they were required.
  const scansAreRequired = scansRequired(award.status, award.returnScanSnapshot != null);
  return (
    <div className="flex flex-col gap-6">
      {online && <OnlineReturnCard sulit={sulit} l={l} facts={online} nobodyTold={returnTold} />}
      <QueriesCard l={l} nobodyTold={queryTold} />
      <ReturnRecordCard sulit={sulit} l={l} ret={ret} people={people} />
      <OwnerAttachments
        owner={{ kind: "award", id: award.id }}
        title="Scans of what came back"
       
        required={Object.fromEntries(RETURN_SCANS[award.instrumentKind as InstrumentKind].map((p) => [p, scansAreRequired]))}
        labels={RETURN_SLOT_LABEL}
        statuses={ret && award.awardReturn ? Object.fromEntries(scansAwaitingPaper(award.instrumentKind as InstrumentKind, ret).map((p) => [p, { text: WAITING_FOR_PAPER, tone: "neutral" as const }])) : undefined}
      />
    </div>
  );
}

async function ReturnRecordCard({ sulit, l, ret, people }: { sulit: Sulit<true>; l: LoadedAward; ret: ReturnRecord | null; people: { value: string; label: string }[] }) {
  const { award } = l;
  const returnIndex = await loadAttributions(db, l.org.id, [{ entity: "AwardReturn", slot: "receivedBy", ids: award.awardReturn ? [award.awardReturn.id] : [] }]);
  const loa = award.instrumentKind === "LETTER_OF_ACCEPTANCE";
  if (!ret || !award.awardReturn) {
    return (
      <Card>
        <EmptyState title="Nothing to return yet" />
      </Card>
    );
  }
  const r = award.awardReturn;
  const state = returnState(ret);
  const kind = award.instrumentKind as InstrumentKind;
  const scans = { required: scansRequired(award.status, award.returnScanSnapshot != null), attached: new Set(award.attachments.filter((a) => isLive(a)).map((a) => a.purpose as string)) };
  const scanLine = returnScansText({ required: scans.required, missing: scansMissing(kind, ret, scans.attached), attached: award.attachments.filter((a) => (RETURN_SCANS[kind] as readonly string[]).includes(a.purpose) && isLive(a)).length });
  const page = acceptancePageFaults(ret);
  const tri = (v: boolean | null) => (v == null ? notSet("Not recorded") : v ? "Yes" : "No — recorded as not done");
  return (
    <Card>
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title={<Say words={loa ? P.returnedItems : P.acceptancePage} />}
        subtitle={loa ? (state.complete ? "All three documents are back." : `Still to come: ${state.missing.map((m) => RETURN_ITEM_LABEL[m]).join(", ")}.`) : page.length === 0 ? "Every field is recorded." : `Still to record: ${page.map((x) => ACCEPTANCE_FAULT_LABEL[x]).join(", ")}.`}
        // WV-4: paper is not recorded while a return sent online waits; the card above is decided first.
        actions={(award.status === "ISSUED" || award.status === "ACCEPTED") && sulit.state === "GRANTED" && onlineReturnState(award.onlineReturns) !== "WAITING" ? <ReturnDrawer id={award.id} loa={loa} people={people} correcting={award.status === "ACCEPTED"} values={{ ...ret, contractorSigned: yesNo(ret.contractorSigned), stampAffixed: yesNo(ret.stampAffixed), witnessSigned: yesNo(ret.witnessSigned), receivedByPersonId: r.receivedByPersonId, whereHeld: r.whereHeld }} /> : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        {loa ? (
          <KeyValues
            columns={3}
            items={[
              { label: "Signed letter", value: ret.signedLetterReceivedOn ? `Received ${formatDate(ret.signedLetterReceivedOn)}` : notSet("Not received") },
              { label: "Successful bidder's declaration", value: ret.declarationReceivedOn ? `Received ${formatDate(ret.declarationReceivedOn)}` : notSet("Not received") },
              { label: "Letter of authorisation", value: ret.authorisationReceivedOn ? `Received ${formatDate(ret.authorisationReceivedOn)}` : notSet("Not received") },
            ]}
          />
        ) : (
          <>
            {sulit.state === "WITHHELD" ? <Callout tone="warn">{`Withheld from you: you cannot record or correct the return. ${sulit.words.en}`}</Callout> : <div><InfoChip outline detail="The identity card number is SULIT. Shown in full only to those entitled; masked elsewhere.">SULIT</InfoChip></div>}
            <KeyValues
              columns={2}
              items={[
                { label: "Acceptance page received", value: ret.signedLetterReceivedOn ? `Received ${formatDate(ret.signedLetterReceivedOn)}` : notSet("Not received") },
                { label: "Contractor's signatory", value: ret.signatoryName || notSet("Not recorded") },
                { label: "Identity card number", value: ret.icNumber ? <span className="font-mono text-[13px]"><SulitValue of={through(sulit, ret.icNumber)} /></span> : notSet("Not recorded") },
                { label: "Occupation", value: ret.occupation || notSet("Not recorded") },
                { label: "Address", value: ret.address || notSet("Not recorded") },
                { label: "Signed in the capacity of", value: ret.capacity || notSet("Not recorded") },
                { label: "Contractor signed", value: tri(ret.contractorSigned) },
                { label: "Company stamp affixed", value: tri(ret.stampAffixed) },
                { label: "Witness", value: ret.witnessName || notSet("Not recorded") },
                { label: "Witness signed", value: tri(ret.witnessSigned) },
              ]}
            />
          </>
        )}
        <KeyValues
          columns={2}
          className="border-t border-line pt-5"
          items={[
            { label: "Received by", value: r.receivedBy && award.awardReturn ? returnIndex.read({ entity: "AwardReturn", id: award.awardReturn.id, slot: "receivedBy" }, r.receivedBy.name).en : notSet("Not recorded") },
            { label: "Originals held at", value: r.whereHeld || notSet("Not recorded") },
          ]}
        />
        <ToneNote tone={scanLine.tone}>
          <span className="font-semibold">Scans. </span>
          {scanLine.text}
        </ToneNote>
      </CardBody>
    </Card>
  );
}
