import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";

/**
 * Which documents belong to an exercise the reader may not see (FR-MTD-007, Phase 3a). A document is attached to a record, and the record is the
 * exercise or something under it: its award, specification panel, bill of quantities, a part of its tender pack, an addendum, a withdrawal letter, a
 * validity extension, an opening, an evaluation, an evaluation meeting or an evaluation bidder. Each way to reach the exercise is followed, so no
 * document reaches a reader by the way that was forgotten. Documents of a contract, a supplier or a sitting are not under an exercise and are not
 * judged here. Whether other documents are scoped to the records they hang on is the document store's own rule (3b).
 */

/// The attachments that hang on one of these exercises, whatever kind of record they are attached to.
export function attachmentUnder(exerciseIds: readonly string[]): Prisma.DocumentAttachmentWhereInput {
  const ids = { in: [...exerciseIds] };
  return {
    OR: [
      { exerciseId: ids },
      { award: { exerciseId: ids } },
      { specificationPanel: { exerciseId: ids } },
      { bqVersion: { exerciseId: ids } },
      { tenderPackPart: { pack: { exerciseId: ids } } },
      { addendum: { window: { exerciseId: ids } } },
      { bidWithdrawal: { exerciseId: ids } },
      { validityExtension: { exerciseId: ids } },
      { opening: { exerciseId: ids } },
      { evaluation: { exerciseId: ids } },
      { evaluationMeeting: { evaluation: { exerciseId: ids } } },
      { evaluationBidder: { evaluation: { exerciseId: ids } } },
      { onlineBidFile: { exerciseId: ids } },
    ],
  };
}

const PATH_SELECT = {
  exerciseId: true,
  award: { select: { exerciseId: true } },
  specificationPanel: { select: { exerciseId: true } },
  bqVersion: { select: { exerciseId: true } },
  tenderPackPart: { select: { pack: { select: { exerciseId: true } } } },
  addendum: { select: { window: { select: { exerciseId: true } } } },
  bidWithdrawal: { select: { exerciseId: true } },
  validityExtension: { select: { exerciseId: true } },
  opening: { select: { exerciseId: true } },
  evaluation: { select: { exerciseId: true } },
  evaluationMeeting: { select: { evaluation: { select: { exerciseId: true } } } },
  evaluationBidder: { select: { evaluation: { select: { exerciseId: true } } } },
  onlineBidFile: { select: { exerciseId: true } },
} as const;

/// The hidden exercise a version hangs on (live or past attachment), or null: the first found, to name in the refusal's log.
export async function hiddenExerciseOfVersion(versionId: string, hidden: readonly string[], client: Tx | typeof db = db): Promise<string | null> {
  if (hidden.length === 0) return null;
  return firstHidden(await client.documentAttachment.findMany({ where: { versionId, ...attachmentUnder(hidden) }, select: PATH_SELECT }), hidden);
}

/// The same for a document (any of its versions).
export async function hiddenExerciseOfDocument(documentId: string, hidden: readonly string[], client: Tx | typeof db = db): Promise<string | null> {
  if (hidden.length === 0) return null;
  return firstHidden(await client.documentAttachment.findMany({ where: { version: { documentId }, ...attachmentUnder(hidden) }, select: PATH_SELECT }), hidden);
}

function firstHidden(rows: readonly { exerciseId: string | null; award: { exerciseId: string } | null; specificationPanel: { exerciseId: string } | null; bqVersion: { exerciseId: string } | null; tenderPackPart: { pack: { exerciseId: string } } | null; addendum: { window: { exerciseId: string } } | null; bidWithdrawal: { exerciseId: string } | null; validityExtension: { exerciseId: string } | null; opening: { exerciseId: string } | null; evaluation: { exerciseId: string } | null; evaluationMeeting: { evaluation: { exerciseId: string } } | null; evaluationBidder: { evaluation: { exerciseId: string } } | null; onlineBidFile: { exerciseId: string } | null }[], hidden: readonly string[]): string | null {
  for (const r of rows) {
    const id = [r.exerciseId, r.award?.exerciseId, r.specificationPanel?.exerciseId, r.bqVersion?.exerciseId, r.tenderPackPart?.pack.exerciseId, r.addendum?.window.exerciseId, r.bidWithdrawal?.exerciseId, r.validityExtension?.exerciseId, r.opening?.exerciseId, r.evaluation?.exerciseId, r.evaluationMeeting?.evaluation.exerciseId, r.evaluationBidder?.evaluation.exerciseId, r.onlineBidFile?.exerciseId].find((x): x is string => !!x && hidden.includes(x));
    if (id) return id;
  }
  return null;
}

/// The exercise an owner of documents hangs on, where it hangs on one; null for a sitting, a delegation, a supplier's, a contract's. Read without a lock, to judge access.
export async function exerciseOfOwner(kind: string, id: string, client: Tx | typeof db = db): Promise<string | null> {
  switch (kind) {
    case "exercise":
      return (await client.sourcingExercise.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
    case "award":
      return (await client.award.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "specificationPanel":
      return (await client.specificationPanel.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "bqVersion":
      return (await client.bqVersion.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "tenderPackPart":
      return (await client.tenderPackPart.findUnique({ where: { id }, select: { pack: { select: { exerciseId: true } } } }))?.pack.exerciseId ?? null;
    case "addendum":
      return (await client.addendum.findUnique({ where: { id }, select: { window: { select: { exerciseId: true } } } }))?.window.exerciseId ?? null;
    case "bidWithdrawal":
      return (await client.bidWithdrawal.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "validityExtension":
      return (await client.validityExtension.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "opening":
      return (await client.opening.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "evaluation":
      return (await client.evaluation.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    case "evaluationMeeting":
      return (await client.evaluationMeeting.findUnique({ where: { id }, select: { evaluation: { select: { exerciseId: true } } } }))?.evaluation.exerciseId ?? null;
    case "evaluationBidder":
      return (await client.evaluationBidder.findUnique({ where: { id }, select: { evaluation: { select: { exerciseId: true } } } }))?.evaluation.exerciseId ?? null;
    case "onlineBidFile":
      return (await client.onlineBidFile.findUnique({ where: { id }, select: { exerciseId: true } }))?.exerciseId ?? null;
    default:
      return null;
  }
}
