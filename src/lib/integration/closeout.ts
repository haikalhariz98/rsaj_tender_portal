/**
 * Close-out's hand-offs to the finance system (INT-07, INT-08; plan closeout-plan.md CO-11), behind a façade, as the award's commitment is
 * (`award-commitment.ts`). No adapter exists (D365 is on hold): the manual one does nothing, and the officer acts in the finance system. No
 * finance system's schema appears here.
 */

export interface CloseoutRef {
  contractNumber: string;
  /// What was released, in words the finance system's officer recognises.
  what: string;
  amount: string;
}

export interface CloseoutGateway {
  /// INT-07: retention released (the first release or the balance).
  retentionReleased(ref: CloseoutRef): Promise<void>;
  /// INT-08: the contract is closed: close its commitment and capitalise the asset (stage C).
  closeRequested(ref: Omit<CloseoutRef, "amount">): Promise<void>;
}

export const manualCloseout: CloseoutGateway = {
  async retentionReleased() {
    // Manual: the officer releases it in the finance system.
  },
  async closeRequested() {
    // Manual: the officer asks Finance to close the commitment.
  },
};
