"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { SUPPLIER_BIDS_POSTS } from "@/lib/auth/routes";

import { answerWords, postBids } from "../../post-json";

/**
 * The two buttons of the simulated provider's page (SR-10): "Pay successfully" and "Payment fails". Each posts the buyer's choice to My Bids' one door with the page's signed token; the server decides,
 * and what it answers is shown in its own words. A failure is an answer, not an error: the purchase stays awaiting payment, the failure is shown here, and the buyer may choose a method and try again.
 * Nothing here moves money: the page says so, and so does everything the payment leaves behind.
 */
export function PayControls({ exerciseId, token, method, againHref }: { exerciseId: string; token: string | null; method: string; againHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"PAY" | "FAIL" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(choice: "PAY" | "FAIL") {
    setBusy(choice);
    setError(null);
    setFailure(null);
    const res = await postBids(SUPPLIER_BIDS_POSTS.request, token, { exerciseId, action: "pay", method, choice });
    setBusy(null);
    if (res.status === 200 && res.body?.ok) {
      // Paid: the receipt is this page without a method chosen.
      router.push(againHref);
      router.refresh();
      return;
    }
    if (res.status === 200 && res.body?.code === "PAYMENT_FAILED") {
      setFailure(res.body.message ?? "The simulated provider declined the payment.");
      return;
    }
    setError(answerWords(res.status, res.body));
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Callout tone="err">{error}</Callout>}
      {failure && (
        <Callout tone="err" title="Payment failed (simulated)">
          {failure}
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => choose("PAY")} disabled={busy != null || !token}>{busy === "PAY" ? "Paying…" : "Pay successfully"}</Button>
        <Button variant="secondary" onClick={() => choose("FAIL")} disabled={busy != null || !token}>{busy === "FAIL" ? "Failing…" : "Payment fails"}</Button>
      </div>
      <p className="text-[12.5px] text-ink-3">Simulated payment. These two buttons stand in for a payment provider&apos;s page: no money moves and nothing is charged.</p>
    </div>
  );
}
