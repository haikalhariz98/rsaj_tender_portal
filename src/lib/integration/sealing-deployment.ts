/**
 * What this DEPLOYMENT allows for online sealed bids, and the secret it holds for them (wave 3b, ADR 0036 D1, D4, D13, rulings 20e, 20i, 20v). Deployment
 * configuration, not customer policy: environment variables, every one absent by default. Each is read at the moment of asking (not at import), as the payment
 * simulator's permission is (SEC-1), so a test can set it and a restart is all a deployment needs after changing one.
 *
 *  - SEALED_BIDS_DEMONSTRATION_ALLOWED: the deployment allows online bids that are a demonstration ("not for real tenders"). Read live, at publication and at every
 *    submission (20i).
 *  - SEALED_BIDS_LIVE_ALLOWED: the deployment allows LIVE online bids. It gates only issuing LIVE and publishing under it: a published LIVE exercise keeps its pin when
 *    it is cleared (20i, G1).
 *  - BID_UPLOAD_MAX_CONCURRENT: how many bid parts this process takes at once, a memory guard (20e). Unset, zero or not a whole number: 3.
 *  - SEALING_PEPPER and SEALING_PEPPER_ID: the scrypt pepper (D4, 20v), base64 of at least 32 random bytes, and the name it is known by. Both or neither. It is held
 *    outside the database and backed up apart from it; losing it loses every exercise wrapped under it, and it is kept, unchanged, until no opening of any exercise
 *    wrapped under it can still follow (20y, which corrects 20v's "finalised or cancelled"; the deployment notes, `docs/notes/sealed-bids-deployment.md`).
 *
 * The pepper's id as the product uses it binds the key's bytes: it is the configured name, "#", and a short check value derived from the key itself. A wrap stores that
 * id. So a deployment that keeps the name but changes the bytes (a restore from the wrong backup, a typing slip) does not hold the wrap's pepper, and the act refuses
 * with its own fault before any unwrap (`pepperFault`), never counting it as a wrong passphrase (20v condition 1).
 */

import { createHmac } from "node:crypto";

import { DEFAULT_MAX_CONCURRENT_UPLOADS, parseConcurrency } from "@/lib/documents/concurrency";
import { PEPPER_MIN_BYTES } from "@/lib/sealing/kdf";

type Env = Record<string, string | undefined>;

export const SEALED_BIDS_DEMONSTRATION_ENV = "SEALED_BIDS_DEMONSTRATION_ALLOWED";
export const SEALED_BIDS_LIVE_ENV = "SEALED_BIDS_LIVE_ALLOWED";
export const BID_UPLOAD_CONCURRENCY_ENV = "BID_UPLOAD_MAX_CONCURRENT";
export const SEALING_PEPPER_ENV = "SEALING_PEPPER";
export const SEALING_PEPPER_ID_ENV = "SEALING_PEPPER_ID";

/// The upload limit when none is set: 3, as for the document store's uploads.
export const DEFAULT_BID_UPLOAD_MAX_CONCURRENT = DEFAULT_MAX_CONCURRENT_UPLOADS;

/// Only the word "true" (any case) or "1" allows; anything else, an empty value or "yes" included, does not.
const flag = (v: string | undefined) => {
  const s = v?.trim().toLowerCase();
  return s === "true" || s === "1";
};

export const demonstrationAllowedByDeployment = (env: Env = process.env): boolean => flag(env[SEALED_BIDS_DEMONSTRATION_ENV]);
export const liveAllowedByDeployment = (env: Env = process.env): boolean => flag(env[SEALED_BIDS_LIVE_ENV]);

/// The deployment's two flags as `onlineSubmissionAllowed` reads them.
export const sealingDeployment = (env: Env = process.env): { demoAllowed: boolean; liveAllowed: boolean } => ({ demoAllowed: demonstrationAllowedByDeployment(env), liveAllowed: liveAllowedByDeployment(env) });

export const bidUploadMaxConcurrent = (env: Env = process.env): number => parseConcurrency(env[BID_UPLOAD_CONCURRENCY_ENV], DEFAULT_BID_UPLOAD_MAX_CONCURRENT);

export type PepperFault = "ID_WITHOUT_KEY" | "KEY_WITHOUT_ID" | "ID_INVALID" | "NOT_BASE64" | "TOO_SHORT";
export type PepperReading = { status: "NOT_SET" } | { status: "SET"; pepper: { id: string; key: Uint8Array } } | { status: "INVALID"; fault: PepperFault };

/// The configured name: letters, digits, dot, underscore and hyphen, 1 to 64 of them (it goes into every wrap, so it is kept plain).
const PEPPER_ID = /^[A-Za-z0-9._-]{1,64}$/;
/// Standard base64 with its padding, nothing else.
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/// The short value that binds the key's bytes into the id a wrap stores: 16 hex digits of an HMAC of a fixed label under the key. It reveals nothing useful of the key.
export const pepperCheckValue = (key: Uint8Array): string => createHmac("sha256", key).update("perolehan-sealing-pepper-check-v1").digest("hex").slice(0, 16);

/**
 * The pepper as this deployment holds it. NOT_SET: neither variable is set (DEMONSTRATION may wrap without one; LIVE is refused). INVALID: set but unusable, said
 * why; it is never treated as unset, so nothing is wrapped without the pepper the deployment meant to hold. SET: the key, and the id that binds it.
 */
export function sealingPepper(env: Env = process.env): PepperReading {
  const rawKey = (env[SEALING_PEPPER_ENV] ?? "").trim();
  const rawId = (env[SEALING_PEPPER_ID_ENV] ?? "").trim();
  if (!rawKey && !rawId) return { status: "NOT_SET" };
  if (!rawKey) return { status: "INVALID", fault: "ID_WITHOUT_KEY" };
  if (!rawId) return { status: "INVALID", fault: "KEY_WITHOUT_ID" };
  if (!PEPPER_ID.test(rawId)) return { status: "INVALID", fault: "ID_INVALID" };
  if (!BASE64.test(rawKey)) return { status: "INVALID", fault: "NOT_BASE64" };
  const key = new Uint8Array(Buffer.from(rawKey, "base64"));
  if (Buffer.from(key).toString("base64") !== rawKey) return { status: "INVALID", fault: "NOT_BASE64" };
  if (key.length < PEPPER_MIN_BYTES) return { status: "INVALID", fault: "TOO_SHORT" };
  return { status: "SET", pepper: { id: `${rawId}#${pepperCheckValue(key)}`, key } };
}

/// Whether a usable pepper is configured (`liveIssueFaults`' pepperConfigured, `publishSealingFaults`').
export const pepperConfigured = (env: Env = process.env): boolean => sealingPepper(env).status === "SET";

export const PEPPER_FAULT_WORDS: Readonly<Record<PepperFault, string>> = {
  ID_WITHOUT_KEY: "The deployment names a sealing pepper but does not hold its value.",
  KEY_WITHOUT_ID: "The deployment holds a sealing pepper but gives it no name.",
  ID_INVALID: "The sealing pepper's name may hold only letters, digits, dots, underscores and hyphens, at most 64 of them.",
  NOT_BASE64: "The sealing pepper is not written in base64.",
  TOO_SHORT: "The sealing pepper is shorter than 32 bytes.",
};
