import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { supplierFaultText } from "./labels";
import { approveFaults, openApplicationFaults, submitFaults, type BlacklistInEffect, type FileFacts } from "./review";
import { standing } from "./standing";

/**
 * FR-TRM-017 (6.15a fix S-2): while a blacklisting is in effect, a renewal or upgrade is not opened, and an
 * application already open is not approved (nor sent for approval), each refusal naming the blacklisting.
 */

const blacklist: BlacklistInEffect = { effectiveOn: "2026-09-24", endsOn: "2031-09-24", reasonLabel: "False declaration in a bid" };
const file: FileFacts = {
  status: "RECEIVED",
  lapsedRecordedAt: null,
  resubmitBy: null,
  routePending: false,
  declarationSignedOn: "2026-09-29",
  declarationScanned: true,
  mandatory: [{ label: "Works board certificate", state: "VALID" }],
  mandatoryNotSet: [],
  typesConfigured: 1,
  blacklist: null,
};

describe("a blacklisting in effect stops a renewal or upgrade (FR-TRM-017, fix S-2)", () => {
  it("opening a renewal or an upgrade is refused, naming the blacklisting", () => {
    for (const kind of ["RENEWAL", "UPGRADE"] as const) {
      const fs = openApplicationFaults(kind, "REGISTERED", false, blacklist);
      expect(fs).toEqual([{ code: "BLACKLISTED_NO_APPLICATION", level: "block", data: { since: "2026-09-24", endsOn: "2031-09-24", reason: "False declaration in a bid" } }]);
      expect(supplierFaultText(fs[0])).toBe("A blacklisting is in effect (since 24 Sep 2026, False declaration in a bid; last blacklisted day 23 Sep 2031, free from 24 Sep 2031): a renewal or upgrade is not opened while it stands.");
    }
  });

  it("until further notice reads so; with none in effect the renewal opens", () => {
    expect(supplierFaultText(openApplicationFaults("RENEWAL", "REGISTERED", false, { ...blacklist, endsOn: null })[0])).toContain("; until further notice)");
    expect(openApplicationFaults("RENEWAL", "REGISTERED", false, null)).toEqual([]);
  });

  it("approving, and sending for approval, an open application is refused the same way", () => {
    expect(approveFaults(file, "2026-10-01")).toEqual([]);
    const fs = approveFaults({ ...file, blacklist }, "2026-10-01");
    expect(fs.map((f) => f.code)).toEqual(["BLACKLISTED_NOT_APPROVED"]);
    expect(supplierFaultText(fs[0])).toMatch(/^A blacklisting is in effect \(since 24 Sep 2026, False declaration in a bid; .*\): an application is not approved while it stands\./);
    expect(submitFaults({ ...file, blacklist, routePending: false }, "2026-10-01").map((f) => f.code)).toEqual(["BLACKLISTED_NOT_APPROVED"]);
  });

  it("boundary: on the last blacklisted day refused; on the free-from day the reading carries no blacklisting", () => {
    const ev = { id: "b", kind: "BLACKLIST" as const, effectiveOn: "2026-09-24", endsOn: "2031-09-24", offenceNo: 1, reasonLabel: "False declaration in a bid", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], withdrawn: false, cancelledBy: null };
    const on = (d: string) => standing({ status: "REGISTERED" }, [ev], [], { autoSuspendOnLapse: null }, d).blacklist;
    expect(on("2031-09-23")).not.toBeNull();
    expect(openApplicationFaults("RENEWAL", "REGISTERED", false, on("2031-09-23")).map((f) => f.code)).toEqual(["BLACKLISTED_NO_APPLICATION"]);
    expect(on("2031-09-24")).toBeNull();
    expect(openApplicationFaults("RENEWAL", "REGISTERED", false, on("2031-09-24"))).toEqual([]);
  });

  it("the actions read the blacklisting from the standing under the lock (source)", () => {
    const text = readFileSync("src/app/suppliers/actions.ts", "utf8");
    expect(text).toMatch(/openApplicationFaults\(kind, [^)]*, !!open, blacklist\)/);
    expect(text).toMatch(/blacklist: st\?\.reading\.blacklist \?\? null/);
  });
});
