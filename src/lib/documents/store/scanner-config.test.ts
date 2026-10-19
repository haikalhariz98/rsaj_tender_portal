import { describe, expect, it } from "vitest";
import { malwareScanner, runScan, scannerSetting } from "./index";
import { NotConfiguredScanner } from "./scanner";
import { DEFAULT_SCAN_TIMEOUT_MS, isLoopbackLiteral, scannerSettingFrom } from "./scanner-config";

const fault = (env: Record<string, string>) => scannerSettingFrom(env);

describe("scannerSettingFrom", () => {
  it("no environment, or blank values, is NONE", () => {
    expect(scannerSettingFrom({})).toEqual({ state: "NONE" });
    expect(scannerSettingFrom({ MALWARE_SCANNER_SOCKET: "  ", MALWARE_SCANNER_PORT: "", MALWARE_SCANNER_HOST: " ", MALWARE_SCANNER_TIMEOUT_MS: "\t" })).toEqual({ state: "NONE" });
  });

  it("a socket path is SET with the default timeout", () => {
    expect(scannerSettingFrom({ MALWARE_SCANNER_SOCKET: "/run/clamav/clamd.ctl" })).toEqual({
      state: "SET",
      target: { kind: "socket", path: "/run/clamav/clamd.ctl" },
      timeoutMs: DEFAULT_SCAN_TIMEOUT_MS,
    });
  });

  it("a port is SET on 127.0.0.1 by default, with a given timeout", () => {
    expect(scannerSettingFrom({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_TIMEOUT_MS: "5000" })).toEqual({
      state: "SET",
      target: { kind: "tcp", host: "127.0.0.1", port: 3310 },
      timeoutMs: 5000,
    });
  });

  it.each(["127.0.0.1", "127.1.2.3", "::1"])("loopback literal %s is accepted", (host) => {
    expect(scannerSettingFrom({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_HOST: host })).toMatchObject({ state: "SET", target: { host } });
    expect(isLoopbackLiteral(host)).toBe(true);
  });

  it.each(["10.0.0.5", "localhost", "0.0.0.0", "::ffff:127.0.0.1", "127.0.0.01", "clamd.internal", "[::1]", "128.0.0.1", "127.0.0.256", "127.0.0"])(
    "host %s is refused as not loopback",
    (host) => {
      expect(fault({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_HOST: host })).toEqual({ state: "FAULT", fault: "HOST_NOT_LOOPBACK" });
    },
  );

  it("every other fault has a case", () => {
    expect(fault({ MALWARE_SCANNER_SOCKET: "/a", MALWARE_SCANNER_PORT: "1" })).toEqual({ state: "FAULT", fault: "SOCKET_AND_PORT" });
    expect(fault({ MALWARE_SCANNER_HOST: "127.0.0.1" })).toEqual({ state: "FAULT", fault: "HOST_WITHOUT_PORT" });
    expect(fault({ MALWARE_SCANNER_SOCKET: "/a", MALWARE_SCANNER_HOST: "127.0.0.1" })).toEqual({ state: "FAULT", fault: "HOST_WITHOUT_PORT" });
    expect(fault({ MALWARE_SCANNER_TIMEOUT_MS: "5000" })).toEqual({ state: "FAULT", fault: "TIMEOUT_WITHOUT_TARGET" });
    for (const port of ["0", "65536", "abc", "33.1", "-1", "0x10"]) {
      expect(fault({ MALWARE_SCANNER_PORT: port })).toEqual({ state: "FAULT", fault: "PORT_INVALID" });
    }
    for (const path of ["relative/clamd.ctl", "C:\\pipe", "\\\\.\\pipe\\x", "clamd.ctl"]) {
      expect(fault({ MALWARE_SCANNER_SOCKET: path })).toEqual({ state: "FAULT", fault: "SOCKET_PATH_INVALID" });
    }
    for (const t of ["999", "300001", "abc", "1.5", "-5000"]) {
      expect(fault({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_TIMEOUT_MS: t })).toEqual({ state: "FAULT", fault: "TIMEOUT_INVALID" });
    }
    expect(fault({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_TIMEOUT_MS: "1000" })).toMatchObject({ state: "SET", timeoutMs: 1000 });
    expect(fault({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_TIMEOUT_MS: "300000" })).toMatchObject({ state: "SET", timeoutMs: 300000 });
  });

  it("scannerSetting reads the injected environment", () => {
    expect(scannerSetting({})).toEqual({ state: "NONE" });
  });
});

describe("malwareScanner(env)", () => {
  it("with nothing set it is the unconfigured scanner and reads NOT_SCANNED", async () => {
    const s = malwareScanner({});
    expect(s).toBe(NotConfiguredScanner);
    expect(await runScan(s, new Uint8Array([1]))).toBe("NOT_SCANNED");
  });

  it("with a setting fault it is configured and every scan is ERROR", async () => {
    const s = malwareScanner({ MALWARE_SCANNER_PORT: "3310", MALWARE_SCANNER_HOST: "10.0.0.5" });
    expect(s.configured).toBe(true);
    expect(await runScan(s, new Uint8Array([1]))).toBe("ERROR");
  });

  it("with a valid setting it is a configured scanner", () => {
    expect(malwareScanner({ MALWARE_SCANNER_PORT: "3310" }).configured).toBe(true);
  });
});
