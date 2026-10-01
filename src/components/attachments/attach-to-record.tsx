"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { attachDocument, loadAttachTargets } from "@/app/documents/actions";
import { EMPTY_FORM_STATE } from "@/components/record-editor";
import { LinkIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/field";
import { OWNER_KINDS } from "@/lib/documents/types";
import { OWNER_KIND_LABEL, ownerHref } from "@/lib/documents/targets";
import type { OwnerKind } from "@/lib/documents/types";

type Targets = NonNullable<Awaited<ReturnType<typeof loadAttachTargets>>>;

/**
 * The way out of "Received, not filed": choose a kind of record, the record and what the
 * document is kept as, and the same attach act the record's own screen runs does the rest,
 * with every check it makes. This component decides nothing: which records, which purposes,
 * and which are closed (with the words why) arrive from `attachTargets`, the rule the act
 * itself judges under.
 *
 * Afterwards the officer is taken to the record: the document has left the list that
 * showed it (and the drawer opened from it), so the record is where it can now be seen.
 */
export function AttachToRecordButton({
  versionId,
  title,
  unclassified,
}: {
  /// The version to attach: the newest that is not withdrawn. Null: every version is withdrawn, so none can be.
  versionId: string | null;
  title: string;
  /// The document's classification is not set: said before, so it is no surprise afterwards.
  unclassified: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OwnerKind | "">("");
  const [targets, setTargets] = useState<Targets | null | undefined>(undefined);
  const [recordId, setRecordId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  const close = () => {
    setOpen(false);
    setKind("");
    setTargets(undefined);
    setRecordId("");
    setPurpose("");
    setError(null);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("[role=combobox],select,input")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const chooseKind = (k: string) => {
    const next = OWNER_KINDS.find((x) => x === k) ?? "";
    setKind(next);
    setRecordId("");
    setPurpose("");
    setError(null);
    setTargets(undefined);
    if (next) void loadAttachTargets(next).then(setTargets);
  };

  // Derived, not stored: the record chosen, its purposes, and the one chosen among them.
  const record = targets?.records.find((r) => r.id === recordId) ?? null;
  const chosen = record?.purposes.find((p) => p.value === purpose) ?? null;
  const cut = targets && targets.total > targets.cap;

  const submit = () => {
    if (!kind || !record || !chosen || !versionId) return;
    start(async () => {
      const fd = new FormData();
      fd.set("ownerKind", kind);
      fd.set("ownerId", record.id);
      fd.set("purpose", chosen.value);
      fd.set("versionId", versionId);
      const r = await attachDocument(EMPTY_FORM_STATE, fd);
      if (!r.ok) {
        setError(r.message ?? Object.values(r.errors ?? {}).join(" ") ?? "Attaching was refused.");
        return;
      }
      // The document is filed, so it leaves "Received, not filed" and whatever listed it: the
      // officer is taken to the record it now belongs to, which is where it can be seen.
      close();
      router.push(ownerHref(kind, record.id));
    });
  };

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={buttonClass("secondary", "sm")}
        aria-label={`Attach ${title} to a record`}
        onClick={() => setOpen(true)}
      >
        <LinkIcon size={15} />
        Attach to a record…
      </button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <aside ref={dialog} role="dialog" aria-modal="true" aria-label={`Attach ${title} to a record`} className={drawerPanelClass("md")}>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <DrawerHeader title="Attach to a record" subtitle={title} onClose={close} />
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-4">
                  {versionId == null && <Callout tone="err">Every version of this document is withdrawn, so it cannot be attached. Upload the file again as a new document.</Callout>}
                  {error && <Callout tone="err">{error}</Callout>}
                  <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-[13px] text-ink-2">
                    The file is already stored. Attaching it files it against a record and takes it off the Received, not filed list. Every check the record&apos;s own screen makes is made again.
                  </p>
                  {unclassified && (
                    <Callout tone="warn">This document&apos;s classification is not set. It can be attached, but it is listed and never opened in the portal until its classification is set.</Callout>
                  )}
                  <Field label="Kind of record" required htmlFor="attach-kind">
                    <Select id="attach-kind" value={kind} onChange={(e) => chooseKind(e.target.value)} placeholder="Choose a kind of record">
                      {OWNER_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {OWNER_KIND_LABEL[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {kind && targets === undefined && <p className="text-[13px] text-ink-3">Loading…</p>}
                  {kind && targets === null && <Callout tone="err">That kind of record cannot be listed. Reload the page.</Callout>}
                  {targets && (
                    <>
                      <Field
                        label="Record"
                        required
                        htmlFor="attach-record"
                        hint={
                          targets.records.length === 0
                            ? `There is no ${OWNER_KIND_LABEL[kind as OwnerKind].toLowerCase()} yet.`
                            : cut
                              ? `Showing the latest ${targets.cap} of ${targets.total}. If the one you want is not here, attach the document from that record's own screen.`
                              : undefined
                        }
                      >
                        <Select
                          id="attach-record"
                          value={recordId}
                          onChange={(e) => {
                            setRecordId(e.target.value);
                            setPurpose("");
                          }}
                          placeholder="Choose a record"
                        >
                          {targets.records.map((r) => (
                            <option key={r.id} value={r.id} disabled={r.purposes.length === 0} data-sub={r.nothingKept ?? undefined}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      {record && (
                        <Field label="Kept as" required htmlFor="attach-purpose" hint="Where a purpose is closed, its reason is under it.">
                          <Select id="attach-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Choose what it is kept as">
                            {record.purposes.map((p) => (
                              <option key={p.value} value={p.value} disabled={!p.open} data-sub={p.reason ?? undefined}>
                                {p.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </>
                  )}
                </div>
              </div>
              <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" className={buttonClass("ghost", "md")} onClick={close}>
                  Cancel
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={pending || !chosen || !versionId}>
                  {pending ? "Attaching…" : "Attach"}
                </button>
              </footer>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}
