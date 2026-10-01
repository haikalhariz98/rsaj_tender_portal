/**
 * Which driver and which ceiling this deployment runs with, from its environment.
 * Pure: the environment is passed in. `DOCUMENT_STORE_DRIVER` defaults to postgres,
 * the only driver built (OD-1); naming another refuses uploads and downloads, naming
 * the variable. `DOCUMENT_MAX_BYTES` is the technical ceiling over the policy's size.
 */

import { parseCeiling } from "../limits";

import type { DriverName } from "./types";

export const BUILT_DRIVERS: readonly DriverName[] = ["postgres"];
const KNOWN: readonly string[] = ["postgres", "filesystem"];

export type DriverFault = "DRIVER_UNKNOWN" | "DRIVER_NOT_BUILT";

export function driverFrom(env: Readonly<Record<string, string | undefined>>): { driver: DriverName } | { fault: DriverFault } {
  const v = (env.DOCUMENT_STORE_DRIVER ?? "").trim().toLowerCase() || "postgres";
  if (!KNOWN.includes(v)) return { fault: "DRIVER_UNKNOWN" };
  if (!BUILT_DRIVERS.includes(v as DriverName)) return { fault: "DRIVER_NOT_BUILT" };
  return { driver: v as DriverName };
}

export const ceilingFrom = (env: Readonly<Record<string, string | undefined>>) => parseCeiling(env.DOCUMENT_MAX_BYTES);
