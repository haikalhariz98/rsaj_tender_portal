import { ShieldCheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Bi } from "@/components/ui/bilingual";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PrintButton } from "@/components/ui/print-button";
import { KeyValues } from "@/components/ui/stat";
import { RECEIPT_WORDS } from "@/lib/bids/online/receipt-words";
import { BID_KIND_WORDS, SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import { DEMONSTRATION_WORDS } from "@/lib/sealing/switch";


/**
 * A supplier's receipt (SR-13, ADR 0036 D5, rulings 20j, 20an): what the portal told it when it submitted, in both languages. It carries the supplier's own submission number, never the
 * count of everything received on the exercise. It also carries the stamp, the fingerprint of the key the bid was sealed to and the digest in full. It never calls itself signed, and it is not a proof of anything by itself (20j).
 * One component for the receipt shown on submitting and the receipt kept in Your bid.
 */

export interface ReceiptData {
  reference: string;
  title: string;
  supplierName: string;
  number: number;
  kind: "BID" | "ALTERNATIVE";
  stampText: string;
  late: boolean;
  fingerprint: string;
  digest: string;
  demonstration: boolean;
  notConsidered: boolean;
}

const MONO = "font-mono text-[12.5px] break-all";

export function ReceiptCard({ data, actions }: { data: ReceiptData; actions?: boolean }) {
  return (
    <Card className="print:shadow-none">
      <CardHeader
        icon={<ShieldCheckIcon size={17} />}
        title={<Bi words={RECEIPT_WORDS.title} inline />}
        subtitle={<Bi words={SCREEN_WORDS.receiptSubtitle} inline />}
        actions={
          <span className="flex items-center gap-2">
            <Badge tone={data.late ? "warn" : "ok"}>
              <Bi words={data.late ? SCREEN_WORDS.receiptLate : SCREEN_WORDS.receiptOnTime} inline />
            </Badge>
            {actions !== false && <PrintButton words={SCREEN_WORDS.receiptPrint} />}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {data.demonstration && (
          <Callout tone="warn" title={<Bi words={DEMONSTRATION_WORDS} />}>
            <Bi words={SCREEN_WORDS.demonstrationNote} />
          </Callout>
        )}
        {data.late && (
          <Callout tone="warn">
            <Bi words={SCREEN_WORDS.receiptLateNote} />
          </Callout>
        )}
        <p className="text-[13.5px] text-ink-2">
          <Bi words={RECEIPT_WORDS.meaning} />
        </p>
        <KeyValues
          columns={2}
          items={[
            { label: <Bi words={SCREEN_WORDS.receiptExercise} inline />, value: `${data.reference} · ${data.title}` },
            { label: <Bi words={SCREEN_WORDS.receiptSupplier} inline />, value: data.supplierName },
            { label: <Bi words={SCREEN_WORDS.receiptNumber} inline />, value: <span className="font-semibold tabular-nums">{data.number}</span> },
            { label: <Bi words={SCREEN_WORDS.receiptKind} inline />, value: <Bi words={BID_KIND_WORDS[data.kind]} inline /> },
            { label: <Bi words={SCREEN_WORDS.receiptStamp} inline />, value: data.stampText },
            { label: <Bi words={SCREEN_WORDS.receiptKey} inline />, value: <span className={MONO}>{data.fingerprint}</span> },
            { label: <Bi words={SCREEN_WORDS.receiptDigest} inline />, value: <span className={MONO}>{data.digest}</span> },
            ...(data.notConsidered ? [{ label: <Bi words={SCREEN_WORDS.receiptAlternativeNot} inline />, value: <Bi words={SCREEN_WORDS.alternativesNotConsidered} /> }] : []),
          ]}
        />
      </CardBody>
    </Card>
  );
}
