"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, FileInput, Input, Option, Select, Textarea } from "@/components/ui/field";
import { MoreText } from "@/components/ui/more-text";
import { SUPPLIER_AWARD_RETURN_POSTS } from "@/lib/auth/routes";
import { ACCEPT_INFO, type AcceptForm } from "@/lib/portal/projects/award-card";

import { answerWords, postBids as postJson } from "../../bids/post-json";
import { postForm, answerWords as formWords } from "../../company/post-form";
import { canSend, chooseSignatory, startValues, submitBody, type AcceptValues, type StagedScans } from "./award-return-form";
import { Frame } from "./document-drawers";

/**
 * What the contractor does about an issued award (Wave V, V4): send the signed documents back, and ask the office a question. Each posts to the portal's literal routes with the page's
 * `projects` form token. Each signed scan is staged the moment it is chosen (one request each); the act then names them and asks the password again, sent once and kept nowhere. A scan
 * that is staged stays staged for as long as the drawer is open, so a refusal and a second press reuse it; opening the drawer afresh starts clean, because the scans of a refused return are
 * used. What the server refuses is shown in its own words beside the field it concerns; a code is never printed.
 */

type Errors = Record<string, string>;
type Common = { contractId: string; token: string | null };

export function AcceptDrawer({ contractId, token, form }: Common & { form: AcceptForm }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<StagedScans>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<Errors>({});
  const [v, setV] = useState<AcceptValues>(() => startValues(form));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const heading = useId();
  const f = useId();
  // The password is never kept past the drawer or an answer.
  const close = () => {
    setPassword("");
    setOpen(false);
  };
  const set = (k: keyof AcceptValues, value: string | boolean) => setV((x) => ({ ...x, [k]: value }));

  async function stage(scan: string, file: File | undefined) {
    if (!file) return;
    setUploading(scan);
    setScanErrors((e) => ({ ...e, [scan]: "" }));
    setStaged((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== scan)));
    const body = new FormData();
    body.append("file", file);
    const res = await postForm(`${SUPPLIER_AWARD_RETURN_POSTS.upload}?contractId=${encodeURIComponent(contractId)}&scan=${encodeURIComponent(scan)}`, token, body);
    setUploading(null);
    if (res.status === 201 && res.body?.ok && typeof res.body.versionId === "string") setStaged((s) => ({ ...s, [scan]: res.body!.versionId as string }));
    else setScanErrors((e) => ({ ...e, [scan]: formWords(res.status, res.body) }));
  }

  async function send() {
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await postJson(SUPPLIER_AWARD_RETURN_POSTS.submit, token, submitBody(contractId, form, staged, v, password));
    setBusy(false);
    setPassword("");
    if (res.status === 201 && res.body?.ok) {
      setOpen(false);
      router.refresh();
      return;
    }
    setError(answerWords(res.status, res.body));
    setErrors((res.body as { errors?: Errors } | null)?.errors ?? {});
  }

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => {
          setV(startValues(form));
          setStaged({});
          setScanErrors({});
          setPassword("");
          setError(null);
          setErrors({});
          setOpen(true);
        }}
        disabled={!token}
        aria-haspopup="dialog"
      >
        {form.resend ? "Send again" : "Accept"}
      </Button>
      {open && (
        <Frame title="Accept the award" heading={heading} error={error} errors={errors} busy={busy} holdClose={uploading !== null} onClose={close} onSend={send} canSend={!!token && uploading === null && canSend(form, staged, v, password)} sendLabel="Accept and send">
          <MoreText label="About accepting" text={ACCEPT_INFO} />
          {form.scans.map((s) => (
            <Field key={s.key} label={s.label} htmlFor={`${f}-${s.key}`} required error={scanErrors[s.key] || errors.files} hint={staged[s.key] ? "Uploaded" : uploading === s.key ? "Uploading…" : undefined}>
              <FileInput id={`${f}-${s.key}`} disabled={busy || uploading !== null} onChange={(e) => void stage(s.key, e.currentTarget.files?.[0])} />
            </Field>
          ))}
          {form.isIndent && (
            <>
              <Field label="Signatory" htmlFor={`${f}-signatory`} required error={errors["page.signatoryContactId"]}>
                <Select id={`${f}-signatory`} value={v.signatoryId} onChange={(e) => setV((x) => chooseSignatory(form, x, e.target.value))}>
                  {form.signatories.map((s) => (
                    <Option key={s.id} value={s.id}>{s.name}</Option>
                  ))}
                </Select>
              </Field>
              <Field label="Capacity" htmlFor={`${f}-capacity`} required error={errors["page.capacity"]}>
                <Input id={`${f}-capacity`} value={v.capacity} maxLength={240} onChange={(e) => set("capacity", e.target.value)} />
              </Field>
              <Field label="IC number" htmlFor={`${f}-ic`} required error={errors["page.icNumber"]}>
                <Input id={`${f}-ic`} value={v.icNumber} maxLength={40} autoComplete="off" inputMode="numeric" onChange={(e) => set("icNumber", e.target.value)} />
              </Field>
              <Field label="Occupation" htmlFor={`${f}-occupation`} required error={errors["page.occupation"]}>
                <Input id={`${f}-occupation`} value={v.occupation} maxLength={240} onChange={(e) => set("occupation", e.target.value)} />
              </Field>
              <Field label="Address" htmlFor={`${f}-address`} required error={errors["page.address"]}>
                <Textarea id={`${f}-address`} value={v.address} maxLength={1000} rows={3} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="Witness name" htmlFor={`${f}-witness`} required error={errors["page.witnessName"]}>
                <Input id={`${f}-witness`} value={v.witnessName} maxLength={240} onChange={(e) => set("witnessName", e.target.value)} />
              </Field>
              <div className="flex flex-col gap-2.5">
                <Checkbox label="Signed" checked={v.signed} onChange={(e) => set("signed", e.target.checked)} />
                <Checkbox label="Witnessed" checked={v.witnessed} onChange={(e) => set("witnessed", e.target.checked)} />
                <Checkbox label="Company stamp" checked={v.stamped} onChange={(e) => set("stamped", e.target.checked)} />
              </div>
            </>
          )}
          <Field label="Your password" htmlFor={`${f}-password`} required error={errors.password}>
            <Input id={`${f}-password`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </Frame>
      )}
    </>
  );
}

/// A question to the office about the issued award. It pauses nothing.
export function AskQuestionDrawer({ contractId, token }: Common) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  // One key per question (security review L2): a retry of the same question sends the same key, so the office gets it once. A new one after each question sent.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heading = useId();
  const f = useId();
  const close = () => setOpen(false);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await postJson(SUPPLIER_AWARD_RETURN_POSTS.query, token, { contractId, body, requestKey });
    setBusy(false);
    if (res.status === 201 && res.body?.ok) {
      setOpen(false);
      setBody("");
      setRequestKey(crypto.randomUUID());
      router.refresh();
      return;
    }
    setError(answerWords(res.status, res.body));
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setError(null); setOpen(true); }} disabled={!token} aria-haspopup="dialog">
        Ask a question
      </Button>
      {open && (
        <Frame title="Ask a question" heading={heading} error={error} busy={busy} dirty={body.trim() !== ""} onClose={close} onSend={send} canSend={!!token && body.trim() !== ""} sendLabel="Send">
          <Field label="Your question" htmlFor={`${f}-body`} required>
            <Textarea id={`${f}-body`} value={body} maxLength={2000} rows={5} autoFocus onChange={(e) => setBody(e.target.value)} />
          </Field>
        </Frame>
      )}
    </>
  );
}
