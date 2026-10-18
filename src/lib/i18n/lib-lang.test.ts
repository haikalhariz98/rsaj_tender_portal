import { describe, expect, it } from "vitest";

import { activityFeed, activityLine, type ActivityEntry, type ActivityOwner } from "@/lib/dashboard/activity";
import { awardChips } from "@/lib/contract/case-list-words";
import { greetingAt } from "@/lib/dates";
import { phaseSummary, statusBreakdown } from "@/lib/method/phase";
import { serviceWords } from "@/lib/portal/projects/labels";
import { expiryChip, remindersText } from "@/lib/securities/expiry";

/**
 * N1 step 4 (NFR-LNG-001, ADR 0040): a lib function that returns an English string takes `lang`, English by default, and gives the Malay when
 * asked. The English each one gave before is held by the tests beside it.
 */

let n = 0;
const entry = (over: Partial<ActivityEntry> & Pick<ActivityEntry, "entity">): ActivityEntry => ({
  id: `e${++n}`,
  entityId: "x1",
  entityLabel: "REQ/1 · Pumps",
  action: "UPDATE",
  changes: [],
  reason: "",
  at: new Date("2026-09-10T02:00:00Z"),
  ...over,
});
const to = (from: string | null, after: string) => [{ field: "status", before: from, after }];
const TZ = "Asia/Kuala_Lumpur";

describe("the greeting", () => {
  const noon = new Date("2026-09-10T04:00:00Z"); // 12:00 in Kuala Lumpur
  it("is said in both languages, and claims no time of day without a zone", () => {
    expect(greetingAt(noon, TZ)).toBe("Good afternoon");
    expect(greetingAt(noon, TZ, "ms")).toBe("Selamat petang");
    expect(greetingAt(noon, null)).toBe("Welcome");
    expect(greetingAt(noon, null, "ms")).toBe("Selamat datang");
    expect(greetingAt(new Date("2026-09-10T00:00:00Z"), TZ, "ms")).toBe("Selamat pagi");
    expect(greetingAt(new Date("2026-09-10T12:00:00Z"), TZ, "ms")).toBe("Selamat malam");
  });
});

describe("the pipeline hints", () => {
  const buckets = [
    { status: "DRAFT" as const, count: 2 },
    { status: "ADVERTISED" as const, count: 1 },
    { status: "UNDER_EVALUATION" as const, count: 3 },
  ];
  it("gives the English as before and the Malay on request", () => {
    expect(phaseSummary(buckets)).toBe("2 preparing · 1 out to market · 3 at opening or evaluation");
    expect(phaseSummary(buckets, "ms")).toBe("2 dalam penyediaan · 1 di pasaran · 3 pada pembukaan atau penilaian");
    expect(statusBreakdown(buckets, 1)).toBe("2 draft · 1 advertised · 3 under evaluation · 1 cancelled, not counted");
    expect(statusBreakdown(buckets, 1, "ms")).toBe("2 draf · 1 diiklankan · 3 sedang dinilai · 1 dibatalkan, tidak dikira");
  });
});

describe("Recent activity", () => {
  const owners: Record<string, ActivityOwner> = {};
  it("reads a requisition's moves in both languages", () => {
    const e = entry({ entity: "Requisition", entityId: "r1", changes: to("PENDING_APPROVAL", "APPROVED") });
    expect(activityLine(e, owners, TZ)?.headline).toBe("REQ/1 approved");
    expect(activityLine(e, owners, TZ, "ms")?.headline).toBe("REQ/1 diluluskan");
    expect(activityLine(entry({ entity: "Requisition", action: "CREATE" }), owners, TZ, "ms")?.headline).toBe("REQ/1 dibangkitkan");
  });

  it("dates the line in the language", () => {
    const e = entry({ entity: "Requisition", changes: to(null, "ENDORSED"), at: new Date("2026-05-10T02:00:00Z") });
    expect(activityLine(e, owners, TZ)?.day).toBe("10 May 2026");
    expect(activityLine(e, owners, TZ, "ms")?.day).toBe("10 Mei 2026");
  });

  it("reads an exercise, an award, a sitting and a tabled matter in Malay, with the values kept", () => {
    const exercise = entry({ entity: "SourcingExercise", entityLabel: "EX/7 · Road", changes: to("ADVERTISED", "INVITED") });
    expect(activityLine(exercise, owners, TZ)?.headline).toBe("Exercise EX/7: letters of invitation issued");
    expect(activityLine(exercise, owners, TZ, "ms")?.headline).toBe("Urusan EX/7: surat jemputan dikeluarkan");

    const award = entry({ entity: "Award", entityLabel: "AWD/3 · Road", changes: to("DRAFT", "ISSUED") });
    expect(activityLine(award, owners, TZ)?.headline).toBe("Award AWD/3 issued");
    expect(activityLine(award, owners, TZ, "ms")?.headline).toBe("Anugerah AWD/3 dikeluarkan");

    const scheduled = entry({ entity: "Meeting", action: "CREATE", changes: [{ field: "reference", before: null, after: "MTG/2" }, { field: "committee", before: null, after: "Tender Board" }, { field: "meetingDate", before: null, after: "2026-10-02" }] });
    expect(activityLine(scheduled, owners, TZ)?.headline).toBe("Tender Board sitting scheduled for 02 Oct 2026");
    expect(activityLine(scheduled, owners, TZ, "ms")?.headline).toBe("Mesyuarat Tender Board dijadualkan pada 02 Okt 2026");

    const outcome = entry({ entity: "CommitteeDecision", entityLabel: "Pumps", changes: [{ field: "outcome", before: "PENDING", after: "NOT_CARRIED" }] });
    expect(activityLine(outcome, owners, TZ)?.headline).toBe("Pumps: not carried");
    expect(activityLine(outcome, owners, TZ, "ms")?.headline).toBe("Pumps: tidak diluluskan");
  });

  it("folds the rows of one act in Malay as it does in English", () => {
    const at = new Date("2026-09-10T02:00:00Z");
    const stepOwners: Record<string, ActivityOwner> = { "ApprovalStep:s1": { kind: "requisition", id: "r1", reference: "REQ/1", committee: null } };
    const rows = [
      entry({ entity: "ApprovalStep", entityId: "s1", entityLabel: "REQ/1 · Head of Department", changes: [{ field: "decision", before: null, after: "DONE" }], at }),
      entry({ entity: "Requisition", entityId: "r1", changes: to("PENDING_APPROVAL", "APPROVED"), at }),
    ];
    expect(activityFeed(rows, stepOwners, TZ).map((l) => l.headline)).toEqual(["REQ/1 approved at Head of Department"]);
    expect(activityFeed(rows, stepOwners, TZ, 8, "ms").map((l) => l.headline)).toEqual(["REQ/1 diluluskan di Head of Department"]);
  });
});

describe("a case's chips and a security's expiry", () => {
  const facts = { status: "ISSUED" as const, returned: false, toVerify: 2, registered: 2, hasCommitmentNo: false, indentExpired: true };
  it("gives the chips in both languages, with the same tones", () => {
    const en = awardChips(facts);
    const ms = awardChips(facts, "ms");
    expect(en.map((c) => c.text)).toEqual(["Awaiting return", "2 to verify", "No commitment number", "Indent expired"]);
    expect(ms.map((c) => c.text)).toEqual(["Menunggu pulangan", "2 untuk disahkan", "Tiada nombor komitmen", "Indent tamat tempoh"]);
    expect(ms.map((c) => c.tone)).toEqual(en.map((c) => c.tone));
  });

  it("says the expiry chip and the reminder intervals in both languages, and never zero days for none", () => {
    expect(expiryChip({ state: "EXPIRED", daysAgo: 3 })?.text).toBe("Expired 3 days ago");
    expect(expiryChip({ state: "EXPIRED", daysAgo: 3 }, "ms")?.text).toBe("Tamat 3 hari yang lalu");
    expect(expiryChip({ state: "NO_EXPIRY" }, "ms")?.text).toBe("Tiada tarikh tamat direkodkan");
    expect(remindersText([30, 7])).toBe("Reminders at 30, 7 days");
    expect(remindersText([30, 7], "ms")).toBe("Peringatan pada 30, 7 hari");
    expect(remindersText([])).toBe("Expiry reminders are not set");
    expect(remindersText([], "ms")).toBe("Peringatan tamat tempoh belum ditetapkan");
  });
});

describe("a submission's service level", () => {
  it("is said in both languages with the date in the language", () => {
    const due = { state: "DUE", dueOn: "2026-05-10", daysLeft: 3 } as const;
    expect(serviceWords(due).text).toBe("Due 10 May 2026, 3 days left");
    expect(serviceWords(due, "ms").text).toBe("Genap tempoh 10 Mei 2026, 3 hari lagi");
    expect(serviceWords({ state: "NOT_SET" }, "ms").text).toBe("Tahap perkhidmatan belum ditetapkan: tiada hari akhir");
  });
});
