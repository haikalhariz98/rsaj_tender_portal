import Link from "next/link";

import { ArrowRight, BellIcon, BuildingIcon, GlobeIcon, AwardIcon, InboxIcon, ToolsIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  HOME_LINKS,
  HOME_TITLE,
  SIGNED_IN_LINKS,
  SIGNED_IN_SUBTITLE,
  SIGNED_IN_TITLE,
  TAKE_PART_SUBTITLE,
  TAKE_PART_TITLE,
  bidStep,
  homeSubtitle,
  takePartSteps,
} from "@/lib/portal/labels";
import { loadPublicShell } from "@/lib/portal/deployment";
import { loadPortalFacts } from "@/lib/portal/public-facts";

import { WaitingForYouCard } from "./waiting-card";

const LINK_ICON = { opportunities: GlobeIcon, results: AwardIcon, register: BuildingIcon } as const;
// Phase 4e: every signed-in part is built; the home page lists them, and each asks the visitor to sign in.
const SIGNED_IN_ICON = { bids: InboxIcon, projects: ToolsIcon, company: BuildingIcon, announcements: BellIcon } as const;

export default async function SupplierHomePage() {
  const [{ organisation }, { registerOpen, channel }] = await Promise.all([loadPublicShell(), loadPortalFacts()]);
  // A closed register hides "Apply to register" (and its card); the way to bid follows the configured channel, and is left out while unset.
  const links = HOME_LINKS.filter((l) => l.key !== "register" || registerOpen);
  const bid = bidStep(channel);
  const steps = [...takePartSteps(registerOpen), ...(bid ? [bid] : [])];

  return (
    <>
      <PageHeader
        title={HOME_TITLE.en}
        subtitle={homeSubtitle(organisation.name).en}
      />

      <WaitingForYouCard />

      <div className={`grid gap-5 ${links.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {links.map((link) => {
          const Ico = LINK_ICON[link.key];
          return (
            <Card key={link.key} className="flex flex-col">
              <CardBody className="flex flex-1 flex-col gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Ico size={20} />
                </span>
                <h2 className="text-[16px] font-bold tracking-tight text-ink">{link.title.en}</h2>
                <p className="flex-1 text-[14px] leading-relaxed text-ink-2">{link.text.en}</p>
                <div>
                  <ButtonLink href={link.href} wholeDocument={link.wholeDocument} variant="secondary" size="sm" icon={<ArrowRight size={14} />}>
                    {link.action.en}
                  </ButtonLink>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title={TAKE_PART_TITLE.en} subtitle={TAKE_PART_SUBTITLE.en} />
          <CardBody>
            <ol className="flex flex-col gap-4">
              {steps.map((step, i) => (
                <li key={step.title.en} className="flex items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-[13px] font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[14.5px] font-bold text-ink">{step.title.en}</h3>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{step.text.en}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={SIGNED_IN_TITLE.en} subtitle={SIGNED_IN_SUBTITLE.en} />
          <CardBody>
            <ul className="flex flex-col gap-1">
              {SIGNED_IN_LINKS.map((item) => {
                const Ico = SIGNED_IN_ICON[item.key];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl px-2 py-2.5 no-underline hover:bg-sunken hover:no-underline"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sunken text-ink-3">
                        <Ico size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-ink">{item.title.en}</span>
                        <span className="block text-[13px] text-ink-3">{item.text.en}</span>
                      </span>
                      <Badge>Sign in</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
