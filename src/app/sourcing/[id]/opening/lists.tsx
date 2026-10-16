"use client";

import { sulitCell } from "@/components/sulit-cell";
import { DataList, type Row } from "@/components/data-list";
import { SealedFileDownload } from "@/components/sealed-file-download";
import type { OpeningSectionView, OpeningView } from "@/lib/opening/read";

import { AlternativeInsideDrawer, ChecklistDrawer, CorrectAsReadDrawer, InitialDrawer, OpenEnvelopeDrawer, VerdictDrawer } from "./editors";

/**
 * The opening's two lists, on the shared DataList: the envelopes it opens, and the offers read from
 * them. A row's acts open drawers, so the lists are client components; they sit on the line under the
 * row. The price as read is SULIT (C-4): its column is flagged, which labels it and removes the
 * list's export.
 */

export function EnvelopesToOpen({ exerciseId, o }: { exerciseId: string; o: OpeningView }) {
  const byId = new Map(o.envelopes.map((e) => [e.id, e]));
  const rows: Row[] = o.envelopes.map((e) => ({
    id: e.id,
    search: `${e.sequence} ${e.markings} ${e.kind}`,
    sortKeys: { envelope: e.sequence },
    views: [e.state === "Sealed" ? "sealed" : "done"],
    note: e.open && !e.open.allowed && e.open.reason !== o.held ? `Not opened yet: ${e.open.reason}` : undefined,
    cells: {
      envelope: { kind: "stack", title: `Envelope ${e.sequence}`, sub: e.kind },
      source: { kind: "text", text: e.source },
      state: { kind: "chip", text: e.state, tone: e.tone === "neutral" ? undefined : e.tone },
      markings: { kind: "text", text: e.markings },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="envelopes-to-open"
      emptyTitle="No envelope to open"
      emptyBody={o.kind === "MAIN" ? "No envelope in time is on the register. Register each envelope found in the box first." : "The admitted envelope is not on the register."}
      actionsPlacement="below"
      columns={[
        { key: "envelope", label: "Envelope", width: "150px", sortable: true, mobile: "primary" },
        { key: "source", label: "How it came", width: "220px", mobile: "meta" },
        { key: "state", label: "Status", width: "190px", mobile: "meta" },
        { key: "markings", label: "Markings as written", mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const e = byId.get(id)!;
        if (!e.open?.allowed) return null;
        return <OpenEnvelopeDrawer exerciseId={exerciseId} openingId={o.id} envelope={{ id: e.id, sequence: e.sequence, markings: e.markings, isAlternative: e.isAlternative }} parties={o.parties} parents={o.parentOptions} allowed={e.open} />;
      }}
    />
  );
}

export function OffersRead({ exerciseId, o }: { exerciseId: string; o: OpeningView }) {
  const byId = new Map(o.offers.map((b) => [b.id, b]));
  const rows: Row[] = o.offers.map((b) => ({
    id: b.id,
    search: `${b.listingNo} ${b.bidder} ${b.registration}`,
    sortKeys: { listing: b.listingNo },
    note:
      [
        b.restrictionWhy,
        b.grounds.length ? `Eliminatory: ${b.grounds.join("; ")}.` : null,
        b.reported.length ? `Reported to the committee: ${b.reported.join("; ")}.` : null,
        b.verdict?.reason ? `Why not carried: ${b.verdict.reason}` : null,
        b.initialMissing.length && !o.finalised ? `Initials still to record: ${b.initialMissing.join(", ")}.` : null,
        b.unanswered && !o.finalised ? `${b.unanswered} checklist ${b.unanswered === 1 ? "item" : "items"} not answered.` : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    cells: {
      listing: { kind: "stack", title: `No. ${b.listingNo}`, sub: b.envelope },
      bidder: { kind: "stack", title: b.bidder, sub: [b.registration, b.alternative].filter(Boolean).join(" · ") || undefined },
      openingPrice: sulitCell(b.openingPrice, (title) => ({ kind: "stack", title, sub: `${b.period} · validity ${b.validity}` })),
      findings: {
        kind: "chips",
        items: [
          { text: b.sale, tone: b.saleTone },
          ...(b.restriction ? [{ text: b.restriction, tone: b.restrictionTone }] : []),
          ...(b.eligibility ? [b.eligibility] : []),
          ...(b.corrected ? [{ text: b.corrected, tone: "info" as const }] : []),
        ],
      },
      marks: { kind: "text", text: `Initialled by ${b.initialled.length ? b.initialled.join(", ") : "nobody yet"} · checklist ${b.checklist.length - b.unanswered} of ${b.checklist.length}` },
      verdict: b.verdict ? { kind: "badge", text: b.verdict.label, tone: b.verdict.tone } : { kind: "text", text: "No verdict yet", dim: true },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="offers-read"
      emptyTitle="No offer read yet"
      emptyBody="Each envelope opened is listed here in opening order, with its number (Bil.)."
      actionsPlacement="below"
      // S-1: stacked below 2xl (a 1280–1440 card cannot hold six columns and the bidder's name);
      // from 2xl the bidder keeps 200px at least, and the verdict column holds "Carried to evaluation".
      stackBelow="2xl"
      columns={[
        { key: "listing", label: "Bil.", width: "110px", sortable: true, mobile: "primary" },
        { key: "bidder", label: "Bidder as read", minWidth: "200px", mobile: "meta" },
        { key: "openingPrice", label: "Price as read", width: "190px", sulit: true, mobile: "meta" },
        { key: "findings", label: "Findings", width: "220px", mobile: "meta" },
        { key: "marks", label: "Initials and checklist", width: "220px", mobile: "meta" },
        { key: "verdict", label: "Verdict", width: "210px", mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const b = byId.get(id)!;
        if (o.finalised || o.held) return null;
        const bid = { id: b.id, listingNo: b.listingNo };
        return (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {b.initialFor.map((p) => <InitialDrawer key={p.personId} exerciseId={exerciseId} bid={bid} person={{ id: p.personId, name: p.name }} allowed={p.allowed} />)}
            <ChecklistDrawer exerciseId={exerciseId} bid={bid} items={b.checklist} allowed={b.record} />
            <VerdictDrawer exerciseId={exerciseId} bid={bid} options={b.verdictOptions} grounds={b.grounds} reported={b.reported} allowed={b.verdictAllowed} />
            <CorrectAsReadDrawer exerciseId={exerciseId} bid={bid} values={b.correctValues} allowed={b.record} />
            {b.alternativeInside?.allowed && <AlternativeInsideDrawer exerciseId={exerciseId} bid={bid} allowed={b.alternativeInside} />}
          </span>
        );
      }}
    />
  );
}

type CheckFiles = NonNullable<OpeningSectionView["openings"][number]["checkFiles"]>;

/// The opening-check files an online opening's named officers may download, on the shared DataList: one row per file, the download as the row's action.
export function FilesToCheck({ openingId, offers }: { openingId: string; offers: CheckFiles }) {
  const rows: Row[] = offers.flatMap((offer) =>
    offer.files.map((f) => ({
      id: f.fileId,
      search: `${offer.listingNo} ${f.partLabel} ${offer.bidder}`,
      sortKeys: { file: offer.listingNo },
      cells: { file: { kind: "stack" as const, title: `Offer ${offer.listingNo} · ${f.partLabel}`, sub: offer.bidder } },
    })),
  );
  const byId = new Map(offers.flatMap((offer) => offer.files.map((f) => [f.fileId, { listingNo: offer.listingNo, partLabel: f.partLabel }] as const)));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      exportName="files-to-check"
      emptyTitle="No file to check"
      emptyBody="No document is marked as checked at the opening."
      actionsPlacement="below"
      columns={[{ key: "file", label: "File", sortable: true, mobile: "primary" }]}
      rows={rows}
      actions={(id) => {
        const f = byId.get(id)!;
        return <SealedFileDownload openingId={openingId} fileId={id} label={`Offer ${f.listingNo}, ${f.partLabel}`} />;
      }}
    />
  );
}
