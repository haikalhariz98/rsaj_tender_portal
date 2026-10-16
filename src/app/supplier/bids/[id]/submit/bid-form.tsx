"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { CheckIcon, FileIcon, UploadIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Bi } from "@/components/ui/bilingual";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { sha256HexOf } from "@/lib/bids/online/browser-hash";
import type { PartView } from "@/lib/bids/online/my-bids";
import { SCREEN_WORDS, UNIT_WORDS } from "@/lib/bids/online/screen-words";
import { stampText } from "@/lib/bids/online/stamp-text";
import type { Receipt } from "@/lib/bids/online/types";
import type { Words } from "@/lib/contract/labels";
import { SUPPLIER_BIDS_POSTS } from "@/lib/auth/routes";
import { DEMONSTRATION_WORDS } from "@/lib/sealing/switch";

import { answerWords, postOnline, postUpload, type OnlineAnswer } from "../../online-post";
import { ReceiptCard, type ReceiptData } from "../receipt-card";

/**
 * The page a supplier submits an online bid on (SR-13, ADR 0036 D5 to D8; build plan step 11): upload each part (the browser hashes the file and sends the hash), state the price and the
 * completion period, enter the password again, and submit or replace. The rules are the server's: every refusal comes back in words in both languages and is shown as it is. The
 * parts, the types, the sizes and every sentence arrive as props or from `SCREEN_WORDS`, so nothing here restates a rule or does arithmetic. A filename is known only to this page, in
 * this browser: the portal keeps it sealed.
 */

type Mode = "NEW_BID" | "NEW_ALTERNATIVE" | "REPLACE";
interface Held { fileId: string; name: string | null; uploadedAtText: string }

export interface BidFormProps {
  exerciseId: string;
  token: string | null;
  reference: string;
  title: string;
  supplierName: string;
  timeZone: string | null;
  demonstration: boolean;
  parts: PartView[];
  replaceable: { id: string; number: number; kind: "BID" | "ALTERNATIVE"; parentId: string | null }[];
  parents: { id: string; number: number }[];
  bidStands: boolean;
  alternativesPermitted: boolean | null;
  liveFingerprint: string | null;
}

export function BidForm(p: BidFormProps) {
  const router = useRouter();
  const ids = useId();
  const [held, setHeld] = useState<Record<string, Held | null>>(() => Object.fromEntries(p.parts.map((x) => [x.packPartId, x.draft ? { fileId: x.draft.fileId, name: null, uploadedAtText: x.draft.uploadedAtText } : null])));
  const [working, setWorking] = useState<Record<string, "hashing" | "sending" | null>>({});
  const [partError, setPartError] = useState<Record<string, Words | null>>({});
  const [mode, setMode] = useState<Mode>(p.bidStands ? (p.replaceable.length > 0 ? "REPLACE" : "NEW_ALTERNATIVE") : "NEW_BID");
  const [replacing, setReplacing] = useState(p.replaceable[0]?.id ?? "");
  const [parent, setParent] = useState("");
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState("");
  const [unit, setUnit] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ words: Words; more: Words[] } | null>(null);
  const [done, setDone] = useState<{ receipt: Receipt; warnings: Words[]; kind: "BID" | "ALTERNATIVE" } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const replaced = p.replaceable.find((r) => r.id === replacing) ?? null;
  const kind: "BID" | "ALTERNATIVE" = mode === "NEW_BID" ? "BID" : mode === "NEW_ALTERNATIVE" ? "ALTERNATIVE" : (replaced?.kind ?? "BID");
  const parentId = mode === "NEW_ALTERNATIVE" ? parent || null : mode === "REPLACE" && replaced?.kind === "ALTERNATIVE" ? replaced.parentId : null;

  async function choose(part: PartView, file: File | undefined) {
    if (!file) return;
    setPartError((e) => ({ ...e, [part.packPartId]: null }));
    setWorking((s) => ({ ...s, [part.packPartId]: "hashing" }));
    let sha: string;
    try {
      sha = await sha256HexOf(await file.arrayBuffer());
    } catch {
      setWorking((s) => ({ ...s, [part.packPartId]: null }));
      setPartError((e) => ({ ...e, [part.packPartId]: SCREEN_WORDS.notReached }));
      return;
    }
    setWorking((s) => ({ ...s, [part.packPartId]: "sending" }));
    // The ids ride in the query so the guards can judge before the body is read (20ah), and in the form, where they must agree.
    const form = new FormData();
    form.append("exerciseId", p.exerciseId);
    form.append("packPartId", part.packPartId);
    form.append("contentSha256", sha);
    form.append("file", file);
    const query = new URLSearchParams({ exerciseId: p.exerciseId, packPartId: part.packPartId });
    const res = await postUpload(`${SUPPLIER_BIDS_POSTS.part}?${query.toString()}`, p.token, form);
    setWorking((s) => ({ ...s, [part.packPartId]: null }));
    if (inputs.current[part.packPartId]) inputs.current[part.packPartId]!.value = "";
    if (res.status === 201 && res.body?.ok && res.body.fileId) {
      const before = held[part.packPartId];
      setHeld((h) => ({ ...h, [part.packPartId]: { fileId: res.body!.fileId!, name: file.name, uploadedAtText: "" } }));
      // One file for one part (20al): the one it replaces stops counting toward the cap.
      if (before) await postOnline(SUPPLIER_BIDS_POSTS.partDiscard, p.token, { exerciseId: p.exerciseId, fileId: before.fileId });
    } else {
      setPartError((e) => ({ ...e, [part.packPartId]: answerWords(res.status, res.body) }));
    }
  }

  async function remove(part: PartView) {
    const file = held[part.packPartId];
    if (!file) return;
    setPartError((e) => ({ ...e, [part.packPartId]: null }));
    const res = await postOnline(SUPPLIER_BIDS_POSTS.partDiscard, p.token, { exerciseId: p.exerciseId, fileId: file.fileId });
    if (res.status === 200 && res.body?.ok) setHeld((h) => ({ ...h, [part.packPartId]: null }));
    else setPartError((e) => ({ ...e, [part.packPartId]: answerWords(res.status, res.body) }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const fileIds = p.parts.map((x) => held[x.packPartId]?.fileId).filter((x): x is string => !!x);
    const body = {
      exerciseId: p.exerciseId,
      kind,
      parentOnlineBidId: parentId,
      replacesOnlineBidId: mode === "REPLACE" ? replacing || null : null,
      fileIds,
      declaration: { price: price.trim(), completionPeriod: period.trim() === "" ? null : Number(period), completionUnit: unit },
      password,
    };
    const res = await postOnline(SUPPLIER_BIDS_POSTS.submit, p.token, body);
    setBusy(false);
    if (res.status === 201 && res.body?.ok && res.body.receipt) {
      setPassword("");
      setDone({ receipt: res.body.receipt, warnings: (res.body.warnings ?? []).map((x) => ({ en: x.message, ms: x.messageMs })), kind });
      router.refresh();
      return;
    }
    const more = (res.body?.faults ?? []).slice(1).map((f: NonNullable<OnlineAnswer["faults"]>[number]) => ({ en: f.message, ms: f.messageMs }));
    setError({ words: answerWords(res.status, res.body), more });
  }

  if (done) {
    const r = done.receipt;
    const data: ReceiptData = {
      reference: p.reference, title: p.title, supplierName: p.supplierName, number: r.submissionNumber, kind: done.kind,
      stampText: stampText(new Date(r.receivedAt), p.timeZone), late: r.late,
      fingerprint: r.keyFingerprint, digest: r.receiptDigest, demonstration: r.demonstration, notConsidered: r.alternativeNotConsidered,
    };
    return (
      <div className="flex flex-col gap-5">
        <ReceiptCard data={data} />
        {done.warnings.length > 0 && (
          <Callout tone="warn" title={<Bi words={SCREEN_WORDS.warningsTitle} />}>
            <ul className="flex flex-col gap-1.5">
              {done.warnings.map((x) => <li key={x.en}><Bi words={x} /></li>)}
            </ul>
          </Callout>
        )}
        <div className="print:hidden">
          <Button variant="secondary" size="sm" onClick={() => { setDone(null); router.push(`/supplier/bids/${p.exerciseId}?tab=bid`); }}>
            <Bi words={SCREEN_WORDS.receiptAgain} inline inherit />
          </Button>
        </div>
      </div>
    );
  }

  const noPart = p.parts.length === 0;
  return (
    <div className="flex flex-col gap-5 print:hidden">
      {p.demonstration && (
        <Callout tone="warn" title={<Bi words={DEMONSTRATION_WORDS} />}>
          <Bi words={SCREEN_WORDS.demonstrationNote} />
        </Callout>
      )}

      <Card>
        <CardHeader icon={<UploadIcon size={17} />} title={<Bi words={SCREEN_WORDS.partsTitle} inline />} subtitle={<Bi words={SCREEN_WORDS.partsSubtitle} inline />} />
        <CardBody className="flex flex-col gap-3">
          {noPart && <p className="text-[13.5px] text-ink-3"><Bi words={SCREEN_WORDS.partNone} /></p>}
          <ul className="flex flex-col gap-3">
            {p.parts.map((part) => {
              const file = held[part.packPartId];
              const state = working[part.packPartId];
              const fail = partError[part.packPartId];
              const inputId = `${ids}-${part.packPartId}`;
              return (
                <li key={part.packPartId} className="rounded-xl border border-line bg-surface px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-ink">
                        <FileIcon size={15} />
                        <span>{part.label}</span>
                        <Badge tone={part.required ? "brand" : "neutral"}><Bi words={part.required ? SCREEN_WORDS.partRequired : SCREEN_WORDS.partOptional} inline /></Badge>
                      </div>
                      <div className="mt-1 text-[12.5px] text-ink-3">
                        {part.types ? <><Bi words={SCREEN_WORDS.partAccepts} inline />: <Bi words={part.types} inline /></> : <Bi words={SCREEN_WORDS.partNoTypes} inline />}
                      </div>
                      <div className="text-[12.5px] text-ink-3">
                        {part.largest ? <><Bi words={SCREEN_WORDS.partLargest} inline />: <Bi words={part.largest} inline /></> : <Bi words={SCREEN_WORDS.partNoSize} inline />}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <input
                        id={inputId}
                        ref={(el) => { inputs.current[part.packPartId] = el; }}
                        type="file"
                        className="peer sr-only"
                        disabled={!part.uploadable || !p.token || !!state || busy}
                        onChange={(e) => void choose(part, e.target.files?.[0])}
                      />
                      <label htmlFor={inputId} className={`${part.uploadable && p.token && !state && !busy ? "cursor-pointer" : "cursor-not-allowed opacity-60"} peer-focus-visible:[&>span]:outline-2 peer-focus-visible:[&>span]:outline-offset-2 peer-focus-visible:[&>span]:outline-brand-500`}>
                        <span className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[13.5px] font-semibold text-ink hover:border-brand-300">
                          <UploadIcon size={15} />
                          <Bi words={file ? SCREEN_WORDS.partChooseAnother : SCREEN_WORDS.partChoose} inline />
                        </span>
                      </label>
                      {file && (
                        <Button variant="ghost" size="sm" disabled={!!state || busy} onClick={() => void remove(part)}>
                          <Bi words={SCREEN_WORDS.partRemove} inline inherit />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-[13px]" aria-live="polite">
                    {state === "hashing" && <Bi words={SCREEN_WORDS.partHashing} />}
                    {state === "sending" && <Bi words={SCREEN_WORDS.partSending} />}
                    {!state && file && (
                      <span className="inline-flex items-start gap-1.5 text-emerald-800">
                        <CheckIcon size={14} />
                        <span>
                          <Bi words={SCREEN_WORDS.partUploaded} inline />
                          {file.name ? ` · ${file.name}` : ""}
                          {file.uploadedAtText ? ` · ${file.uploadedAtText}` : ""}
                          {!file.name && file.uploadedAtText ? <span className="block text-[12px] text-ink-3"><Bi words={SCREEN_WORDS.partDraftNote} /></span> : null}
                        </span>
                      </span>
                    )}
                    {!state && !file && <span className="text-ink-3"><Bi words={SCREEN_WORDS.partNotUploaded} inline /></span>}
                  </div>
                  {fail && <Callout tone="err" className="mt-2"><Bi words={fail} /></Callout>}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<Bi words={SCREEN_WORDS.kindTitle} inline />} />
        <CardBody className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only"><Bi words={SCREEN_WORDS.kindTitle} inline /></legend>
            {([
              ["NEW_BID", SCREEN_WORDS.kindBid, p.bidStands],
              ["NEW_ALTERNATIVE", SCREEN_WORDS.kindAlternative, false],
              ["REPLACE", SCREEN_WORDS.kindReplace, p.replaceable.length === 0],
            ] as const).map(([value, words, off]) => (
              <label key={value} className={`flex items-center gap-2.5 text-[14px] ${off ? "cursor-not-allowed text-ink-3" : "cursor-pointer text-ink"}`}>
                <input type="radio" className="size-4 accent-brand-600" name={`${ids}-mode`} value={value} checked={mode === value} disabled={off || busy} onChange={() => setMode(value)} />
                <Bi words={words} inline />
              </label>
            ))}
          </fieldset>
          {mode === "REPLACE" && (
            <>
              <Field label={<Bi words={SCREEN_WORDS.kindReplacing} inline />} htmlFor={`${ids}-replacing`}>
                <Select id={`${ids}-replacing`} value={replacing} onChange={(e) => setReplacing(e.target.value)}>
                  {p.replaceable.map((r) => <option key={r.id} value={r.id}>{`${r.number}`}</option>)}
                </Select>
              </Field>
              <Callout tone="info"><Bi words={SCREEN_WORDS.replaceNote} /></Callout>
            </>
          )}
          {mode === "NEW_ALTERNATIVE" && (
            <>
              <Field label={<Bi words={SCREEN_WORDS.kindParent} inline />} htmlFor={`${ids}-parent`}>
                <Select id={`${ids}-parent`} value={parent} onChange={(e) => setParent(e.target.value)}>
                  <option value="">{SCREEN_WORDS.kindNoParent.en} · {SCREEN_WORDS.kindNoParent.ms}</option>
                  {p.parents.map((r) => <option key={r.id} value={r.id}>{`${r.number}`}</option>)}
                </Select>
              </Field>
              {p.alternativesPermitted === false && (
                <Callout tone="warn" title={<Bi words={SCREEN_WORDS.alternativesNotConsideredTitle} />}><Bi words={SCREEN_WORDS.alternativesNotConsidered} /></Callout>
              )}
              {p.alternativesPermitted === null && <Callout tone="warn"><Bi words={SCREEN_WORDS.alternativesNotStated} /></Callout>}
            </>
          )}
          {mode === "REPLACE" && replaced?.kind === "ALTERNATIVE" && p.alternativesPermitted === false && (
            <Callout tone="warn" title={<Bi words={SCREEN_WORDS.alternativesNotConsideredTitle} />}><Bi words={SCREEN_WORDS.alternativesNotConsidered} /></Callout>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<Bi words={SCREEN_WORDS.declareTitle} inline />} subtitle={<Bi words={SCREEN_WORDS.declareSubtitle} inline />} />
        <CardBody className="grid gap-4 md:grid-cols-3">
          <Field label={<Bi words={SCREEN_WORDS.price} inline />} htmlFor={`${ids}-price`} hint={<Bi words={SCREEN_WORDS.priceHint} />}>
            <Input id={`${ids}-price`} inputMode="decimal" autoComplete="off" value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy} />
          </Field>
          <Field label={<Bi words={SCREEN_WORDS.period} inline />} htmlFor={`${ids}-period`} hint={<Bi words={SCREEN_WORDS.periodHint} />}>
            <Input id={`${ids}-period`} inputMode="numeric" autoComplete="off" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={busy} />
          </Field>
          <Field label={<Bi words={SCREEN_WORDS.unit} inline />} htmlFor={`${ids}-unit`}>
            <Select id={`${ids}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)} disabled={busy}>
              <option value=""></option>
              {(["DAYS", "WEEKS", "MONTHS"] as const).map((u) => <option key={u} value={u}>{UNIT_WORDS[u].en} · {UNIT_WORDS[u].ms}</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={<Bi words={SCREEN_WORDS.passwordTitle} inline />} subtitle={<Bi words={SCREEN_WORDS.stampNote} inline />} />
        <CardBody className="flex flex-col gap-4">
          <div className="max-w-sm">
            <Field label={<Bi words={SCREEN_WORDS.password} inline />} htmlFor={`${ids}-password`} hint={<Bi words={SCREEN_WORDS.passwordHint} />}>
              <Input id={`${ids}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            </Field>
          </div>
          {p.liveFingerprint && (
            <p className="text-[12.5px] text-ink-3"><Bi words={SCREEN_WORDS.receiptKey} inline />: <span className="font-mono break-all">{p.liveFingerprint}</span></p>
          )}
          {error && (
            <Callout tone="err">
              <Bi words={error.words} />
              {error.more.map((m) => <div key={m.en} className="mt-1.5"><Bi words={m} /></div>)}
            </Callout>
          )}
          <div>
            <Button variant="primary" onClick={() => void submit()} disabled={busy || !p.token || password === "" || p.parts.every((x) => !held[x.packPartId])}>
              <Bi words={busy ? SCREEN_WORDS.submitting : mode === "REPLACE" ? SCREEN_WORDS.replaceButton : SCREEN_WORDS.submitButton} inline inherit />
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
