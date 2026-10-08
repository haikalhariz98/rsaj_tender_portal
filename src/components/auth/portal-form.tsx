"use client";

import type { ComponentProps } from "react";

import type { FormState, SaveAction } from "@/components/record-editor";
import { FORM_TOKEN_FIELD } from "@/lib/auth/form-token";

import { AuthForm } from "./auth-form";

/**
 * The supplier portal's sign-in, activation, reset and account forms (Phase 4a). The public copy takes no server action, so a form posts its fields as JSON to its
 * route handler, with the signed token the server put on the page, and the handler's structured answer (`ok`, `message`, `errors`, `href`) is the form's state. It is
 * `AuthForm` all the same: the fields, the focus, the show/hide on a password, the clearing of a password after every answer.
 */

type PortalAnswer = { ok?: boolean; message?: string; errors?: Record<string, string>; href?: string };

export async function postPortal(path: string, formToken: string, fields: Record<string, string>): Promise<FormState> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, [FORM_TOKEN_FIELD]: formToken }) });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return { ok: false, message: "Something went wrong and nothing was done. Try again in a moment." };
    const a = (await res.json()) as PortalAnswer;
    return { ok: a.ok === true, ...(a.message ? { message: a.message } : {}), ...(a.errors ? { errors: a.errors } : {}), ...(a.href ? { href: a.href } : {}) };
  } catch {
    return { ok: false, message: "Something went wrong and nothing was done. Try again in a moment." };
  }
}

export function PortalForm({ path, formToken, ...rest }: Omit<ComponentProps<typeof AuthForm>, "action"> & { path: string; formToken: string }) {
  const action: SaveAction = async (_prev, data) => {
    const fields: Record<string, string> = {};
    for (const [k, v] of data.entries()) if (typeof v === "string") fields[k] = v;
    return postPortal(path, formToken, fields);
  };
  return <AuthForm {...rest} action={action} />;
}
