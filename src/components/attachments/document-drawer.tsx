"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { loadDocumentDrawer, placeLegalHold, releaseLegalHold, reclassifyDocument, withdrawVersion } from "@/app/documents/actions";
import { Accordion } from "@/components/accordion";
import { EyeIcon, FileIcon } from "@/components/icons";
import { EMPTY_FORM_STATE, RecordEditor, type SaveAction } from "@/components/record-editor";
import { Badge, Chip } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { RECLASSIFY_NOTE, WITHDRAW_NOTE } from "@/lib/documents/labels";
import type { DrawerView, DrawerVersionView } from "@/lib/documents/views";

import { VerifyButton, type Notice } from "./upload-actions";

/**
 * One document, read in full: its versions (each with its full fingerprint, scan state,
 * download and verify, and withdrawal), where it is attached, its legal holds, who
 * opened or was refused it, and its history. Loaded when opened, never with the screen.
 * Rendered into the page body so it can be opened from inside a form or a table cell.
 */
export function DocumentButton({
  documentId,
  label,
  variant = "ghost",
}: {
  documentId: string;
  /// What the document is called, for the button's name.
  label: string;
  variant?: "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DrawerView | null | undefined>(undefined);
  const opener = useRef<HTMLButtonElement>(null);

  const reload = useCallback(async () => setData(await loadDocumentDrawer(documentId)), [documentId]);
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={buttonClass(variant, "sm")}
        aria-label={`Details of ${label}`}
        onClick={() => {
          setOpen(true);
          setData(undefined);
          void reload();
        }}
      >
        <EyeIcon size={15} />
        Details
      </button>
      {open && createPortal(<Drawer data={data} reload={reload} onClose={close} />, document.body)}
    </>
  );
}

function Drawer({ data, reload, onClose }: { data: DrawerView | null | undefined; reload: () => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A form opened from here closes itself first.
      if (dialog.current?.querySelector('[role="dialog"]')) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A form inside this drawer submits to its own act, never to a form this drawer was opened from.
  const done = useCallback(
    (n: Notice) => {
      setNotice(n);
      void reload();
    },
    [reload],
  );

  return (
    <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && onClose()} onSubmit={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <aside ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={data ? `Document: ${data.title}` : "Document"} className={drawerPanelClass("lg", "outline-none")}>
        <DrawerHeader
          icon={<FileIcon size={17} />}
          title={data ? data.title : "Document"}
          badge={data ? <Badge tone={data.classificationTone}>{data.classification}</Badge> : undefined}
          subtitle={data ? `${data.className} · ${data.status}` : undefined}
          onClose={onClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {data === undefined ? (
            <p className="text-[13px] text-ink-3">Loading…</p>
          ) : data === null ? (
            <EmptyState size="sm" title="This document no longer exists">
              Close this and reload the page.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {notice && <Callout tone={notice.tone}>{notice.text}</Callout>}
              <Callout tone="info">
                {data.statements.access} {data.statements.fingerprint}
              </Callout>
              <Summary d={data} onDone={done} />
              <Section title="Versions" blurb="A correction is a new version. Nothing is ever deleted: a withdrawn version is marked, with its reason.">
                <ul className="flex flex-col gap-3">
                  {data.versions.map((v) => (
                    <VersionCard key={v.id} v={v} onDone={done} />
                  ))}
                </ul>
              </Section>
              <Section title="Where it is attached">
                <Attachments d={data} />
              </Section>
              <Section title="Legal holds" blurb="A hold stops it ever being disposed of, whatever its retention says.">
                <Holds d={data} onDone={done} />
              </Section>
              <Accordion title="Who opened it" meta={`${data.versions.reduce((n, v) => n + v.accessEvents.length, 0)} events`}>
                <AccessEvents d={data} />
              </Accordion>
              <Accordion title="History" meta={`${data.history.length} entries`}>
                <History d={data} />
              </Accordion>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[14px] font-bold text-ink">{title}</h3>
        {blurb && <p className="text-[12.5px] text-ink-3">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

function Summary({ d, onDone }: { d: DrawerView; onDone: (n: Notice) => void }) {
  const reclassify: SaveAction = useCallback(
    async (_p, data) => {
      const fd = new FormData();
      fd.set("documentId", d.id);
      fd.set("classification", String(data.get("classification") ?? ""));
      fd.set("reason", String(data.get("reason") ?? ""));
      const r = await reclassifyDocument(EMPTY_FORM_STATE, fd);
      if (r.ok) onDone({ tone: "ok", text: "Classification recorded." });
      return r;
    },
    [d.id, onDone],
  );
  return (
    <div className="flex flex-col gap-3">
      <KeyValues
        columns={2}
        items={[
          { label: "Classification", value: <Badge tone={d.classificationTone}>{d.classification}</Badge> },
          { label: "Class", value: d.className },
          { label: "Received into the portal", value: d.createdOn },
          { label: "Filed", value: d.filedOn ?? "Not yet: it is listed under Received, not filed" },
          { label: "Keep for", value: d.retention.period },
          { label: "Retention starts", value: d.retention.starts },
          { label: "Disposal", value: d.retention.disposal },
          { label: "Disposal needs the authority of", value: d.retention.authority },
        ]}
      />
      <div>
        {d.classificationLocked ? (
          <div className="flex flex-col items-start gap-1.5">
            <Button size="sm" variant="secondary" disabled aria-describedby={`cls-${d.id}`}>
              Change classification
            </Button>
            <p id={`cls-${d.id}`} className="text-[12.5px] text-ink-3">{d.classificationLocked}</p>
          </div>
        ) : (
          <RecordEditor
            title={`Classification of ${d.title}`}
            description={d.classificationUnset ? "Not set, so it is listed but never opened in the portal." : `Now ${d.classification}.`}
            fields={[
              { kind: "note", text: RECLASSIFY_NOTE },
              { kind: "select", name: "classification", label: "Classification", required: true, placeholder: "Choose", options: d.classificationChoices },
            ]}
            reason={{ label: "Why is it being classified this way?" }}
            action={reclassify}
            submitLabel="Record classification"
            trigger={{ label: d.classificationUnset ? "Set classification" : "Change classification", className: buttonClass("secondary", "sm") }}
            size="sm"
          />
        )}
      </div>
    </div>
  );
}

function VersionCard({ v, onDone }: { v: DrawerVersionView; onDone: (n: Notice) => void }) {
  const withdraw: SaveAction = useCallback(
    async (_p, data) => {
      const fd = new FormData();
      fd.set("versionId", v.id);
      fd.set("reason", String(data.get("reason") ?? ""));
      const r = await withdrawVersion(EMPTY_FORM_STATE, fd);
      if (r.ok) onDone({ tone: "ok", text: `Version ${v.versionNo} is withdrawn. It can still be downloaded where its classification allows; to stop that, set the classification to SULIT.` });
      return r;
    },
    [v.id, v.versionNo, onDone],
  );
  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold text-ink">Version {v.versionNo}</span>
        {v.withdrawn && <Badge tone="err">Withdrawn {v.withdrawn.on}</Badge>}
        <Chip tone={v.scan.tone === "neutral" ? undefined : v.scan.tone}>{v.scan.text}</Chip>
      </div>
      {v.withdrawn && <p className="mt-1.5 text-[13px] text-ink-2">Withdrawn because: {v.withdrawn.reason || "no reason recorded"}</p>}
      <KeyValues
        className="mt-3"
        columns={2}
        items={[
          { label: "File", value: <span className="break-words">{v.fileName}</span> },
          { label: "Type and size", value: `${v.typeLabel} · ${v.size}` },
          { label: "Received on", value: v.receivedOn ?? "Not recorded" },
          { label: "Stored", value: v.storedOn },
          { label: "Recorded by", value: v.recordedBy },
          ...(v.note ? [{ label: "Note", value: v.note }] : []),
          { label: "Fingerprint", value: <span className="font-mono text-[12px] break-all">{v.fingerprint}</span> },
        ]}
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {v.download.allowed ? (
          <a href={v.download.href} className={buttonClass("secondary", "sm")}>
            Download
          </a>
        ) : (
          <Button size="sm" variant="secondary" disabled aria-describedby={`dl-${v.id}`}>
            Download
          </Button>
        )}
        <VerifyButton versionId={v.id} onNotice={onDone} />
        {!v.withdrawn && (
          <RecordEditor
            title={`Withdraw version ${v.versionNo}`}
            description="Mark this version as withdrawn."
            fields={[{ kind: "hidden", name: "versionId" }, { kind: "note", text: WITHDRAW_NOTE }]}
            values={{ versionId: v.id }}
            destructive={{ reasonLabel: "Why is it withdrawn?" }}
            cancelLabel="Keep it"
            action={withdraw}
            submitLabel={`Withdraw version ${v.versionNo}`}
            trigger={{ label: "Withdraw", ariaLabel: `Withdraw version ${v.versionNo}`, className: buttonClass("destructive", "sm") }}
            size="sm"
          />
        )}
      </div>
      {!v.download.allowed && (
        <p id={`dl-${v.id}`} className="mt-2 text-[12.5px] text-ink-3">
          {v.download.reason}
        </p>
      )}
      {v.withdrawn && v.download.allowed && (
        <p className="mt-2 text-[12.5px] text-ink-3">
          This version was withdrawn on {v.withdrawn.on}: {v.withdrawn.reason || "no reason recorded"}. It can still be downloaded.
        </p>
      )}
    </li>
  );
}

function Attachments({ d }: { d: DrawerView }) {
  const rows = d.versions.flatMap((v) => v.attachments.map((a) => ({ ...a, versionNo: v.versionNo })));
  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-3">Not attached to any record. It is listed under Received, not filed until it is.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-line/70 rounded-2xl border border-line">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-col gap-0.5 px-4 py-3 text-[13px]">
          <span>
            <a href={a.href} className="font-semibold text-brand-700 hover:underline">
              {a.owner}
            </a>{" "}
            <span className="text-ink-3">· {a.label} · version {a.versionNo}</span>
          </span>
          <span className="text-ink-3">
            {a.takenOff ? `Attached ${a.attachedOn}. Taken off ${a.takenOff.on}: ${a.takenOff.reason || "no reason recorded"}` : `Attached ${a.attachedOn}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Holds({ d, onDone }: { d: DrawerView; onDone: (n: Notice) => void }) {
  const standing = d.holds.find((h) => h.standing);
  const place: SaveAction = useCallback(
    async (_p, data) => {
      const fd = new FormData();
      fd.set("documentId", d.id);
      fd.set("personId", String(data.get("personId") ?? ""));
      fd.set("reason", String(data.get("reason") ?? ""));
      const r = await placeLegalHold(EMPTY_FORM_STATE, fd);
      if (r.ok) onDone({ tone: "ok", text: "Legal hold placed." });
      return r;
    },
    [d.id, onDone],
  );
  const release: SaveAction = useCallback(
    async (_p, data) => {
      const fd = new FormData();
      fd.set("holdId", String(data.get("holdId") ?? ""));
      fd.set("personId", String(data.get("personId") ?? ""));
      fd.set("reason", String(data.get("reason") ?? ""));
      const r = await releaseLegalHold(EMPTY_FORM_STATE, fd);
      if (r.ok) onDone({ tone: "ok", text: "Legal hold released." });
      return r;
    },
    [onDone],
  );
  return (
    <div className="flex flex-col gap-3">
      {d.holds.length === 0 ? (
        <p className="text-[13px] text-ink-3">No legal hold has ever stood on this document.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/70 rounded-2xl border border-line">
          {d.holds.map((h) => (
            <li key={h.id} className="flex flex-col gap-1 px-4 py-3 text-[13px]">
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={h.standing ? "err" : "neutral"}>{h.standing ? "Standing" : "Released"}</Badge>
                <span className="font-semibold text-ink">{h.reason}</span>
              </span>
              <span className="text-ink-3">
                Placed {h.placedOn} by {h.placedBy}
              </span>
              {h.released && (
                <span className="text-ink-3">
                  Released {h.released.on} by {h.released.by}: {h.released.reason}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div>
        {standing ? (
          <RecordEditor
            title={`Release the legal hold on ${d.title}`}
            fields={[
              { kind: "hidden", name: "holdId" },
              { kind: "note", text: `The hold was placed because: ${standing.reason}` },
              { kind: "select", name: "personId", label: "Released by", required: true, placeholder: "Choose who is recording it", options: d.people, hint: "Recorded on their behalf, not signed: nobody is signed in." },
            ]}
            values={{ holdId: standing.id }}
            reason={{ label: "Why is the hold released?" }}
            action={release}
            submitLabel="Release hold"
            trigger={{ label: "Release hold", className: buttonClass("secondary", "sm") }}
            size="sm"
          />
        ) : (
          <RecordEditor
            title={`Place a legal hold on ${d.title}`}
            fields={[
              { kind: "select", name: "personId", label: "Placed by", required: true, placeholder: "Choose who is recording it", options: d.people, hint: "Recorded on their behalf, not signed: nobody is signed in." },
            ]}
            reason={{ label: "Why is the hold placed?" }}
            action={place}
            submitLabel="Place hold"
            trigger={{ label: "Place legal hold", className: buttonClass("secondary", "sm") }}
            size="sm"
          />
        )}
      </div>
    </div>
  );
}

function AccessEvents({ d }: { d: DrawerView }) {
  const rows = d.versions.flatMap((v) => v.accessEvents.map((e) => ({ ...e, versionNo: v.versionNo })));
  if (rows.length === 0) return <p className="px-5 py-4 text-[13px] text-ink-3">Nobody has downloaded, verified or been refused this document yet.</p>;
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-col gap-0.5 px-5 py-3 text-[13px]">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{e.kind}</span>
            <span className="text-ink-3">version {e.versionNo} · {e.at}</span>
          </span>
          {e.reason && <span className="text-ink-3">{e.reason}</span>}
        </li>
      ))}
      <li className="px-5 py-3 text-[12.5px] text-ink-3">Nobody is signed in, so these do not say who.</li>
    </ul>
  );
}

function History({ d }: { d: DrawerView }) {
  if (d.history.length === 0) return <p className="px-5 py-4 text-[13px] text-ink-3">No change to this document has been recorded.</p>;
  return (
    <ul className="divide-y divide-line/70">
      {d.history.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 px-5 py-3 text-[13px]">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={e.action === "Recorded" ? "ok" : e.action === "Removed" ? "err" : "info"}>{e.action}</Badge>
            <span className="font-semibold text-ink">{e.entity}</span>
            <span className="text-ink-3">{e.at}</span>
          </span>
          {e.changes.length > 0 && (
            <ul className="text-[12.5px] text-ink-3">
              {e.changes.map((c) => (
                <li key={c.field} className="break-words">
                  {c.field}: {e.action === "Changed" && c.before != null && <>{c.before} → </>}
                  <span className="text-ink-2">{c.after ?? "empty"}</span>
                </li>
              ))}
            </ul>
          )}
          {e.reason && <span className="text-[12.5px] text-ink-3">Reason: {e.reason}</span>}
        </li>
      ))}
      <li className="px-5 py-3 text-[12.5px] text-ink-3">Nobody is signed in, so no change is attributed.</li>
    </ul>
  );
}
