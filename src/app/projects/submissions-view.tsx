import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import type { StaffActor } from "@/lib/auth/types";
import { SUBMISSIONS_WORDS as S, CASES_LIST_WORDS } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import { dayOf } from "@/lib/dates";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";
import { db } from "@/lib/db";
import { loadReviewQueue, reviewCounts } from "@/lib/portal/projects/review-store";

import { SubmissionsPanel } from "./submissions-panel";

/**
 * "Submissions waiting" (FR-SUP-006, 009; AC-16): contractors' submissions across the organisation, as a view of the Contracts list. The bridge for the old Documents menu's review
 * queue, and so for the notices that still link to it. Not filtered by restricted exercise (AC-18, AC-19): the officer who answers is often not named on the exercise.
 */
export async function SubmissionsView({ actor, waiting, answered, lang = "en" }: { actor: StaffActor; waiting: string | undefined; answered: string | undefined; lang?: Language }) {
  const t = (words: Words) => say(words, lang);
  const n = (words: Words, count: number) => sayWith(words, lang, { count: String(count) });
  const org = await db.organisation.findUnique({ where: { id: actor.organisationId }, select: { timeZone: true } });
  const today = org?.timeZone ? dayOf(new Date(), org.timeZone) : null;
  const [review, counts] = await Promise.all([loadReviewQueue(db, actor.organisationId, today, { waiting, answered }, {}, lang), reviewCounts(db, actor.organisationId, today)]);
  const href = (w: number, a: number) => {
    const q = new URLSearchParams({ view: "submissions", ...(w ? { waiting: String(w) } : {}), ...(a ? { answered: String(a) } : {}) });
    return `/projects?${q.toString()}`;
  };
  return (
    <>
      <PageHeader
        title={t(CASES_LIST_WORDS.title)}
        meta={[n(S.nWaiting, counts.waiting), today ? n(S.nOverdue, counts.overdue) : t(S.overdueNotJudged), n(S.nAnswered, counts.answered)]}
        actions={<ButtonLink href="/projects" size="sm" variant="secondary">{t(CASES_LIST_WORDS.allContracts)}</ButtonLink>}
      />
      {!today && (
        <Callout tone="warn" className="mb-6" title={t(S.overdueNotJudgedTitle)}>
          {t(S.overdueNotJudgedBody)}
        </Callout>
      )}
      <SubmissionsPanel review={review} judged={!!today} hrefOf={href} withContract lang={lang} />
    </>
  );
}
