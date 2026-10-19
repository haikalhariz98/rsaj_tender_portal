"use client";

import { useCallback, useState } from "react";

import { SUPPLIER_REGISTRATION_PAGE, SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
import type { RegistrationStep } from "@/lib/portal/registration/types";

import type { FaultView } from "./reply";

/**
 * What the registration wizard's client side shares (Phase 4b): posting JSON to a route handler with the page's signed token, and the one way a step is saved. The public copy takes no server
 * action, so every write is a post to a literal path. The draft's `version` rides every request and comes back with every answer: a save made on a page that is out of date is refused with
 * 409 and writes nothing, and the page says so.
 */

export interface SaveAnswer {
  ok?: boolean;
  code?: string;
  message?: string;
  version?: number;
  created?: Record<string, string>;
  faults?: FaultView[];
  advance?: boolean;
}

export async function postJson(path: string, token: string | null, body: Record<string, unknown>): Promise<{ status: number; body: SaveAnswer | null }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ ...body, formToken: token }) });
    let json: SaveAnswer | null = null;
    try {
      json = (await res.json()) as SaveAnswer;
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  } catch {
    return { status: 0, body: null };
  }
}

export const stepHref = (step: RegistrationStep) => `${SUPPLIER_REGISTRATION_PAGE}?step=${step}`;

/// The words for an answer that is not ok and carried none of its own.
const NOTHING_SAVED = "Not saved. Try again in a moment.";

export interface Saved {
  ok: boolean;
  advance: boolean;
  created: Record<string, string>;
}

/**
 * Saving a step: the section, the version the page last saw, and whether the supplier asked to go on. Gives back the faults to show beside the fields (only when going on: a save never says
 * a draft is wrong), a message for a page that is out of date or a save that failed, and the new version.
 */
export function useStepSave(step: RegistrationStep, token: string | null, initialVersion: number) {
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [faults, setFaults] = useState<FaultView[]>([]);
  const [stale, setStale] = useState(false);

  const save = useCallback(
    async (section: Record<string, unknown>, opts: { next?: boolean; remove?: readonly string[] } = {}): Promise<Saved> => {
      setBusy(true);
      setMessage(null);
      setSaved(null);
      const { status, body } = await postJson(SUPPLIER_REGISTRATION_POSTS.save, token, { step, version, section, remove: opts.remove ?? [], next: opts.next === true });
      setBusy(false);
      if (status === 200 && body?.ok) {
        if (typeof body.version === "number") setVersion(body.version);
        setFaults(body.faults ?? []);
        if (!opts.next) setSaved("Draft saved.");
        return { ok: true, advance: opts.next === true && body.advance === true, created: body.created ?? {} };
      }
      setFaults(body?.faults ?? []);
      setStale(status === 409);
      setMessage(body?.message ?? NOTHING_SAVED);
      return { ok: false, advance: false, created: {} };
    },
    [step, token, version],
  );

  return { version, setVersion, busy, message, saved, faults, stale, save, setMessage };
}

/// The words of the faults that belong to a field or a row, joined, or undefined where there are none. Blocking ones first, so a field's error is what stops the step.
export function faultsAt(faults: readonly FaultView[], field: string | ((f: string | null) => boolean)): FaultView[] {
  return faults.filter((f) => (typeof field === "string" ? f.field === field : field(f.field)));
}

export const errorText = (fs: readonly FaultView[]): string | undefined => {
  const blocking = fs.filter((f) => f.level === "block");
  return blocking.length ? blocking.map((f) => f.message).join(" ") : undefined;
};

export const noteText = (fs: readonly FaultView[]): string | undefined => {
  const rest = fs.filter((f) => f.level !== "block");
  return rest.length ? rest.map((f) => f.message).join(" ") : undefined;
};
