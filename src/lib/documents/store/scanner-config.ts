/**
 * The malware scanner's setting, read from the environment (N5). Pure: it takes an env and returns what it found, never
 * throws and never reads process.env itself. A setting that is present but wrong is a FAULT, never NONE, so a typo cannot
 * turn into "not scanned" (T2). Only a socket path or a loopback literal is accepted, so bid bytes never cross a network
 * and no name is ever resolved (T3).
 */

export type ScannerTarget = { kind: "socket"; path: string } | { kind: "tcp"; host: string; port: number };
export type ScannerFault =
  | "SOCKET_AND_PORT"
  | "HOST_WITHOUT_PORT"
  | "TIMEOUT_WITHOUT_TARGET"
  | "HOST_NOT_LOOPBACK"
  | "PORT_INVALID"
  | "SOCKET_PATH_INVALID"
  | "TIMEOUT_INVALID";
export type ScannerSetting =
  | { state: "NONE" }
  | { state: "SET"; target: ScannerTarget; timeoutMs: number }
  | { state: "FAULT"; fault: ScannerFault };

export const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
export const MIN_SCAN_TIMEOUT_MS = 1_000;
export const MAX_SCAN_TIMEOUT_MS = 300_000;
const DEFAULT_HOST = "127.0.0.1";

type Env = Readonly<Record<string, string | undefined>>;

/// 127.0.0.0/8 in dotted-quad form with no leading zeros, or exactly ::1. Nothing else.
export function isLoopbackLiteral(host: string): boolean {
  if (host === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1);
  if (parts.some((p) => p.length > 1 && p.startsWith("0"))) return false;
  const n = parts.map(Number);
  return n.every((x) => x >= 0 && x <= 255) && n[0] === 127;
}

function read(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

export function scannerSettingFrom(env: Env): ScannerSetting {
  const socket = read(env, "MALWARE_SCANNER_SOCKET");
  const port = read(env, "MALWARE_SCANNER_PORT");
  const host = read(env, "MALWARE_SCANNER_HOST");
  const timeout = read(env, "MALWARE_SCANNER_TIMEOUT_MS");
  const fault = (f: ScannerFault): ScannerSetting => ({ state: "FAULT", fault: f });

  if (socket === undefined && port === undefined) {
    if (host !== undefined) return fault("HOST_WITHOUT_PORT");
    if (timeout !== undefined) return fault("TIMEOUT_WITHOUT_TARGET");
    return { state: "NONE" };
  }
  if (socket !== undefined && port !== undefined) return fault("SOCKET_AND_PORT");

  let timeoutMs = DEFAULT_SCAN_TIMEOUT_MS;
  if (timeout !== undefined) {
    if (!/^\d+$/.test(timeout)) return fault("TIMEOUT_INVALID");
    timeoutMs = Number(timeout);
    if (timeoutMs < MIN_SCAN_TIMEOUT_MS || timeoutMs > MAX_SCAN_TIMEOUT_MS) return fault("TIMEOUT_INVALID");
  }

  if (socket !== undefined) {
    if (host !== undefined) return fault("HOST_WITHOUT_PORT");
    if (!socket.startsWith("/") || /[\0\r\n]/.test(socket)) return fault("SOCKET_PATH_INVALID");
    return { state: "SET", target: { kind: "socket", path: socket }, timeoutMs };
  }

  if (!/^\d+$/.test(port!)) return fault("PORT_INVALID");
  const portNo = Number(port);
  if (portNo < 1 || portNo > 65535) return fault("PORT_INVALID");
  const h = host ?? DEFAULT_HOST;
  if (!isLoopbackLiteral(h)) return fault("HOST_NOT_LOOPBACK");
  return { state: "SET", target: { kind: "tcp", host: h, port: portNo }, timeoutMs };
}
