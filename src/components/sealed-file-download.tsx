"use client";

import { useEffect, useId, useState } from "react";

import { DownloadIcon } from "@/components/icons";
import { buttonClass, Button } from "@/components/ui/button";
import { CONFIRM_SCRIM, confirmPanelClass, DrawerHeader } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";

/**
 * An opening officer's download of one sealed file at the opening check (ruling 20at, 20au; ADR 0036 D4, D10). One shared control: the Opening tab uses it per file, and wave 3c's checklist
 * cell uses this same component, not a copy.
 *
 * One form, asked on EVERY download: the sign-in password and the unseal passphrase together (the route takes both in one request). Neither is remembered between downloads, pre-filled or held
 * in this component's state once the request has been sent, and a refusal clears both. The password field is the sign-in's `current-password`; the passphrase field asks the browser not to
 * fill it. The refusal is shown in the words the server gave (`downloadRefusalWords` and the unlock words), never restated here. The bytes arrive only once verified, and are handed to the
 * browser as a download, never shown inline.
 */

const GENERIC_REFUSAL = "The file could not be downloaded. Nothing was opened.";

function filenameOf(disposition: string | null): string {
  if (!disposition) return "file";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : "file";
}

export function SealedFileDownload({ openingId, fileId, label }: { openingId: string; fileId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const id = useId();

  const close = () => {
    // Nothing typed outlives the dialog.
    setPassword("");
    setPassphrase("");
    setRefusal(null);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setPassword("");
        setPassphrase("");
        setRefusal(null);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const body = JSON.stringify({ openingId, fileId, password, passphrase });
    // Cleared the moment the request is built: neither is held in state while it is in flight, whatever the answer.
    setPassword("");
    setPassphrase("");
    setBusy(true);
    setRefusal(null);
    try {
      const res = await fetch("/api/opening/sealed-file", { method: "POST", headers: { "content-type": "application/json" }, body, credentials: "same-origin", cache: "no-store" });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filenameOf(res.headers.get("content-disposition"));
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setOpen(false);
        setRefusal(null);
        return;
      }
      let message = GENERIC_REFUSAL;
      try {
        const json = (await res.json()) as { message?: unknown };
        if (typeof json.message === "string" && json.message) message = json.message;
      } catch {
        /* a refusal that is not ours (a proxy's) says the generic words */
      }
      setRefusal(message);
    } catch {
      setRefusal(GENERIC_REFUSAL);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(true)} aria-label={`Download ${label}`}>
        <DownloadIcon size={15} />
        Download
      </button>
      {open && (
        <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !busy && close()}>
          <form role="dialog" aria-modal="true" aria-label={`Download ${label}`} className={confirmPanelClass()} onSubmit={submit} autoComplete="off">
            <DrawerHeader title="Download for the opening check" subtitle={label} onClose={() => !busy && close()} />
            <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
              <p className="text-[13px] text-ink-2">Asked every time: your sign-in password and the unseal passphrase you chose for this exercise. Neither is kept. The file is opened for you alone and every attempt is logged.</p>
              {refusal && <Callout tone="warn">{refusal}</Callout>}
              <Field label="Sign-in password" htmlFor={`${id}-password`} required>
                <Input autoFocus id={`${id}-password`} type="password" name="signInPassword" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Field label="Unseal passphrase" htmlFor={`${id}-passphrase`} required>
                <Input id={`${id}-passphrase`} type="password" name="unsealPassphrase" autoComplete="off" spellCheck={false} autoCapitalize="off" autoCorrect="off" data-lpignore="true" data-1p-ignore="true" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} required />
              </Field>
            </div>
            <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy || password === "" || passphrase === ""}>
                {busy ? "Opening…" : "Download"}
              </Button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
