import { describe, expect, it, vi } from "vitest";

import { MoveRefused, moveRequisition } from "./move";

/// A transaction that only records what it was asked to write.
function fakeTx(count = 1) {
  const updateMany = vi.fn(async () => ({ count }));
  return { tx: { requisition: { updateMany } } as never, updateMany };
}

describe("moveRequisition asks the state machine inside the move (ruling C1)", () => {
  it("refuses an edge the state machine refuses, and writes nothing", async () => {
    const { tx, updateMany } = fakeTx();
    await expect(moveRequisition(tx, { id: "r1", status: "PENDING_APPROVAL" }, "DRAFT", { today: "2026-10-01" })).rejects.toBeInstanceOf(MoveRefused);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("refuses Rejected back to approval without a successor, and writes nothing", async () => {
    const { tx, updateMany } = fakeTx();
    await expect(moveRequisition(tx, { id: "r1", status: "REJECTED" }, "PENDING_APPROVAL", { today: "2026-10-01" })).rejects.toMatchObject({ fault: { code: "SUCCESSOR_REQUIRED" } });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("writes an allowed move conditional on the status it was read in", async () => {
    const { tx, updateMany } = fakeTx();
    await moveRequisition(tx, { id: "r1", status: "PENDING_APPROVAL" }, "REJECTED", { today: "2026-10-01", reason: "Out of scope" }, { cancelReason: "" });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "PENDING_APPROVAL" }, data: { cancelReason: "", status: "REJECTED" } });
  });

  it("refuses when the row moved under it (lost race)", async () => {
    const { tx } = fakeTx(0);
    await expect(moveRequisition(tx, { id: "r1", status: "APPROVED" }, "SOURCING", { today: "2026-10-01" })).rejects.toMatchObject({ fault: { code: "CHANGED" } });
  });

  it("cannot be talked past the check by the extra fields", async () => {
    const { tx, updateMany } = fakeTx();
    await moveRequisition(tx, { id: "r1", status: "APPROVED" }, "SOURCING", { today: "2026-10-01" }, { status: "CLOSED" } as never);
    expect(updateMany.mock.calls[0]).toMatchObject([{ data: { status: "SOURCING" } }]);
  });
});
