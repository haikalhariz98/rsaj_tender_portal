"use client";

import { PrinterIcon } from "@/components/icons";
import { Bi } from "@/components/ui/bilingual";
import { Button } from "@/components/ui/button";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";

/// Prints the page the receipt is on. The browser's own print dialog does it; nothing is sent anywhere.
export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" icon={<PrinterIcon size={15} />} onClick={() => window.print()} className="print:hidden">
      <Bi words={SCREEN_WORDS.receiptPrint} inline inherit />
    </Button>
  );
}
