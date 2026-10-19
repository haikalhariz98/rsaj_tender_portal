/**
 * clamd INSTREAM client (N5). Server only: imports node:net. Fail closed: only an exact "stream: OK" is CLEAN, every other
 * path is ERROR (T1). The promise never rejects, the socket is destroyed and the timer cleared on every exit, and nothing is
 * logged, so neither the bytes nor a signature name leave this file (T7).
 */

import { connect, type Socket } from "node:net";
import type { ScannerTarget } from "./scanner-config";
import type { MalwareScanner, ScanResult } from "./types";

const DEFAULT_CHUNK_BYTES = 64 * 1024;
const MAX_REPLY_BYTES = 4096;
const COMMAND = Buffer.from("zINSTREAM\0", "latin1");

/// Strict. The trailing \0 is trimmed first; only an exact OK is CLEAN.
export function parseClamdReply(reply: string): ScanResult {
  const text = reply.endsWith("\0") ? reply.slice(0, -1) : reply;
  if (text === "stream: OK") return "CLEAN";
  if (/^stream: (\S.*) FOUND$/.test(text)) return "THREAT";
  return "ERROR";
}

export function clamdScanner(target: ScannerTarget, o: { timeoutMs: number; chunkBytes?: number }): MalwareScanner {
  const chunkBytes = Math.max(1, Math.min(o.chunkBytes ?? DEFAULT_CHUNK_BYTES, DEFAULT_CHUNK_BYTES));
  return {
    configured: true,
    scan(bytes: Uint8Array): Promise<ScanResult> {
      return new Promise<ScanResult>((resolve) => {
        let settled = false;
        let terminatorWritten = false;
        let reply: Buffer = Buffer.alloc(0);
        let socket: Socket | undefined;
        let wake: (() => void) | undefined;

        const finish = (r: ScanResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket?.destroy();
          wake?.();
          resolve(r);
        };
        const timer = setTimeout(() => finish("ERROR"), o.timeoutMs);

        const send = async (s: Socket) => {
          const write = async (b: Buffer) => {
            if (settled) return;
            if (!s.write(b) && !settled) {
              await new Promise<void>((r) => {
                wake = r;
                s.once("drain", r);
              });
              wake = undefined;
            }
          };
          await write(COMMAND);
          for (let at = 0; at < bytes.length && !settled; at += chunkBytes) {
            const part = Buffer.from(bytes.buffer, bytes.byteOffset + at, Math.min(chunkBytes, bytes.length - at));
            const head = Buffer.alloc(4);
            head.writeUInt32BE(part.length);
            await write(head);
            await write(part);
          }
          if (settled) return;
          s.write(Buffer.alloc(4));
          terminatorWritten = true;
        };

        try {
          socket = target.kind === "socket" ? connect({ path: target.path }) : connect({ host: target.host, port: target.port });
        } catch {
          finish("ERROR");
          return;
        }
        const s = socket;
        s.on("error", () => finish("ERROR"));
        s.on("close", () => finish("ERROR"));
        s.on("data", (d: Buffer) => {
          if (!terminatorWritten) return finish("ERROR");
          reply = Buffer.concat([reply, d]);
          const end = reply.indexOf(0);
          if (end >= MAX_REPLY_BYTES || (end < 0 && reply.length > MAX_REPLY_BYTES)) return finish("ERROR");
          if (end >= 0) finish(parseClamdReply(reply.subarray(0, end + 1).toString("latin1")));
        });
        s.on("connect", () => {
          send(s).catch(() => finish("ERROR"));
        });
      });
    },
  };
}

/// What a setting fault becomes: configured, and every scan is ERROR, so a mistake never reads as "not scanned" (T2).
export const FailClosedScanner: MalwareScanner = {
  configured: true,
  async scan() {
    return "ERROR";
  },
};
