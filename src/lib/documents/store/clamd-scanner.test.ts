import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clamdScanner, FailClosedScanner, parseClamdReply } from "./clamd-scanner";
import { runScan } from "./scanner";
import type { ScannerTarget } from "./scanner-config";

// The EICAR test string is assembled at runtime; the literal never appears in a source file (Defender quarantines it).
const EICAR = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR", "-STANDARD-ANTIVIRUS-", "TEST-FILE!", "$H+H*"].join("");

const servers: Server[] = [];
const sockets = new Set<Socket>();
const dirs: string[] = [];

afterEach(async () => {
  for (const s of sockets) s.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Seen = { command: string; frames: number[]; terminated: boolean; payload: Buffer };

/** A scripted clamd. `onFrame` runs per parsed event; `reply` is sent once the terminator arrives unless `onData` takes over. */
async function fake(opts: {
  reply?: (seen: Seen) => Buffer | string | null;
  onConnection?: (s: Socket) => void;
  onFirstData?: (s: Socket) => void;
}): Promise<{ target: ScannerTarget; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((s) => {
    sockets.add(s);
    s.on("error", () => {});
    const rec: Seen = { command: "", frames: [], terminated: false, payload: Buffer.alloc(0) };
    seen.push(rec);
    opts.onConnection?.(s);
    let buf = Buffer.alloc(0);
    let gotCommand = false;
    let first = true;
    const parts: Buffer[] = [];
    s.on("data", (d) => {
      if (first) {
        first = false;
        opts.onFirstData?.(s);
      }
      buf = Buffer.concat([buf, d]);
      if (!gotCommand) {
        const nul = buf.indexOf(0);
        if (nul < 0) return;
        rec.command = buf.subarray(0, nul).toString("latin1");
        buf = buf.subarray(nul + 1);
        gotCommand = true;
      }
      while (!rec.terminated && buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          rec.terminated = true;
          buf = buf.subarray(4);
          rec.payload = Buffer.concat(parts);
          const r = opts.reply?.(rec);
          if (r != null) s.write(r);
          return;
        }
        if (buf.length < 4 + len) return;
        rec.frames.push(len);
        parts.push(buf.subarray(4, 4 + len));
        buf = buf.subarray(4 + len);
      }
    });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { target: { kind: "tcp", host: "127.0.0.1", port: (server.address() as AddressInfo).port }, seen };
}

const bytes = (n: number) => new Uint8Array(randomBytes(n));
const ok = () => "stream: OK\0";

describe("parseClamdReply", () => {
  it.each([
    ["stream: OK\0", "CLEAN"],
    ["stream: OK", "CLEAN"],
    ["stream: Eicar-Test-Signature FOUND\0", "THREAT"],
    ["stream: Win.Test.EICAR_HDB-1 FOUND", "THREAT"],
    ["stream:  FOUND\0", "ERROR"],
    ["stream: OK extra\0", "ERROR"],
    ["stream: OK\0stream: OK\0", "ERROR"],
    ["", "ERROR"],
    ["\0", "ERROR"],
    ["ERROR", "ERROR"],
    ["INSTREAM size limit exceeded. ERROR\0", "ERROR"],
    ["stream: something ERROR\0", "ERROR"],
    ["OK\0", "ERROR"],
    ["stream: ok\0", "ERROR"],
    ["Eicar FOUND\0", "ERROR"],
  ])("%j reads %s", (reply, want) => {
    expect(parseClamdReply(reply)).toBe(want);
  });
});

describe("clamdScanner over TCP", () => {
  it("OK reads CLEAN and the wire is zINSTREAM, framed chunks, a zero terminator", async () => {
    const { target, seen } = await fake({ reply: ok });
    const payload = bytes(1000);
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(payload)).toBe("CLEAN");
    expect(seen[0].command).toBe("zINSTREAM");
    expect(seen[0].frames).toEqual([1000]);
    expect(seen[0].terminated).toBe(true);
    expect(seen[0].payload.equals(Buffer.from(payload))).toBe(true);
  });

  it("an empty file is just the command and the terminator", async () => {
    const { target, seen } = await fake({ reply: ok });
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(new Uint8Array())).toBe("CLEAN");
    expect(seen[0].frames).toEqual([]);
    expect(seen[0].terminated).toBe(true);
  });

  it("EICAR reads THREAT", async () => {
    const { target } = await fake({
      reply: (s) => (s.payload.toString("latin1").includes(["EICAR", "-STANDARD"].join("")) ? "stream: Eicar-Test-Signature FOUND\0" : ok()),
    });
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(new TextEncoder().encode(EICAR))).toBe("THREAT");
  });

  it("300 KiB arrives in frames of at most 64 KiB that sum to the payload", async () => {
    const { target, seen } = await fake({ reply: ok });
    const payload = bytes(300 * 1024);
    expect(await clamdScanner(target, { timeoutMs: 10_000 }).scan(payload)).toBe("CLEAN");
    expect(seen[0].frames.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...seen[0].frames)).toBeLessThanOrEqual(65536);
    expect(seen[0].frames.reduce((a, b) => a + b, 0)).toBe(payload.length);
    expect(seen[0].payload.equals(Buffer.from(payload))).toBe(true);
    expect(seen[0].terminated).toBe(true);
  });

  it("chunkBytes sets the frame size", async () => {
    const { target, seen } = await fake({ reply: ok });
    await clamdScanner(target, { timeoutMs: 5000, chunkBytes: 100 }).scan(bytes(250));
    expect(seen[0].frames).toEqual([100, 100, 50]);
  });

  it("no answer is ERROR at the deadline", async () => {
    const { target } = await fake({ reply: () => null });
    const t = Date.now();
    expect(await clamdScanner(target, { timeoutMs: 200 }).scan(bytes(10))).toBe("ERROR");
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it("a socket destroyed mid-stream is ERROR", async () => {
    const { target } = await fake({ onFirstData: (s) => s.destroy() });
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(bytes(5 * 1024 * 1024))).toBe("ERROR");
  });

  it("a closed port is ERROR", async () => {
    const { target } = await fake({});
    const s = servers.pop()!;
    await new Promise<void>((r) => s.close(() => r()));
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
  });

  it("a garbage reply is ERROR", async () => {
    const { target } = await fake({ reply: () => "hello world\0" });
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
  });

  it("a reply without its terminator, then a close, is ERROR", async () => {
    const { target } = await fake({
      reply: () => "stream: OK",
      onConnection: (s) => s.on("data", () => setTimeout(() => s.end(), 50)),
    });
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
  });

  it("a reply over 4096 bytes is ERROR, with or without its terminator", async () => {
    const long = "stream: " + "a".repeat(5000);
    const a = await fake({ reply: () => long + " FOUND\0" });
    expect(await clamdScanner(a.target, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
    const b = await fake({ reply: () => long });
    expect(await clamdScanner(b.target, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
  });

  it("the size-limit reply is ERROR", async () => {
    const { target } = await fake({ reply: () => "INSTREAM size limit exceeded. ERROR\0" });
    expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
  });

  it("a reply before the terminator is written is ERROR even if it says OK", async () => {
    // The server answers at once and stops reading, so the client is held in backpressure mid-stream.
    // Only the OK case proves the early-reply guard (without it the reply would read CLEAN). The size-limit case is ERROR through reply parsing alone.
    for (const early of [ok(), "INSTREAM size limit exceeded. ERROR\0"]) {
      const { target } = await fake({
        onConnection: (s) => {
          s.pause();
          s.write(early);
        },
      });
      expect(await clamdScanner(target, { timeoutMs: 5000 }).scan(bytes(40 * 1024 * 1024))).toBe("ERROR");
    }
  });
});

describe("clamdScanner over a local socket", () => {
  it("reads CLEAN through a unix path, or a named pipe on Windows", async () => {
    let path: string;
    if (process.platform === "win32") {
      path = `\\\\.\\pipe\\perolehan-n5-${randomBytes(6).toString("hex")}`;
    } else {
      const dir = mkdtempSync(join(tmpdir(), "n5-"));
      dirs.push(dir);
      path = join(dir, "clamd.ctl");
    }
    const seen: string[] = [];
    const server = createServer((s) => {
      sockets.add(s);
      s.on("error", () => {});
      let buf = Buffer.alloc(0);
      s.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        if (buf.length >= 10 + 4 && buf.subarray(buf.length - 4).equals(Buffer.alloc(4))) {
          seen.push(buf.subarray(0, 9).toString("latin1"));
          s.write(ok());
        }
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(path, r));
    expect(await clamdScanner({ kind: "socket", path }, { timeoutMs: 5000 }).scan(bytes(100))).toBe("CLEAN");
    expect(seen).toEqual(["zINSTREAM"]);
  });

  it("a missing socket is ERROR", async () => {
    const path = process.platform === "win32" ? `\\\\.\\pipe\\perolehan-n5-missing-${randomBytes(6).toString("hex")}` : join(tmpdir(), `n5-missing-${randomBytes(6).toString("hex")}`);
    expect(await clamdScanner({ kind: "socket", path }, { timeoutMs: 5000 }).scan(bytes(10))).toBe("ERROR");
  });
});

describe("FailClosedScanner", () => {
  it("is configured and always ERROR", async () => {
    expect(FailClosedScanner.configured).toBe(true);
    expect(await FailClosedScanner.scan(bytes(5))).toBe("ERROR");
    expect(await runScan(FailClosedScanner, bytes(5))).toBe("ERROR");
  });
});
