// Render one of our record drawers, open, and dump its markup.
//
//   npx tsx scripts/render-drawer.tsx person out/ours-drawer-person.html
//
// The drawer only exists once its trigger is pressed, so this mounts the real
// component in jsdom and presses it — server rendering the page would return markup
// with no drawer in it at all, which is why compare-screen.mjs cannot see one.
//
// The records passed in are synthetic and local to this file. They exist to make
// every branch render (a person with capabilities, one delegation, an unset field),
// not to resemble anybody.
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { JSDOM } from "jsdom";

const [which = "person", out = `out/ours-drawer-${which}.html`] = process.argv.slice(2);

async function main() {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.MouseEvent = dom.window.MouseEvent;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");

  const element = await build(which, React);

  const root = createRoot(dom.window.document.getElementById("root")!);
  await act(async () => {
    root.render(element);
  });

  // Press the trigger. The drawer is state, not markup, until this happens.
  const trigger = dom.window.document.querySelector("button");
  if (!trigger) throw new Error("The component rendered no trigger to press.");
  await act(async () => {
    trigger.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });

  const drawer = dom.window.document.querySelector(".scrim");
  if (!drawer) throw new Error("Pressing the trigger opened no drawer.");

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, drawer.outerHTML, "utf8");
  console.log(`wrote      : ${out} (${drawer.outerHTML.length} bytes)`);
}

const CAPABILITIES = [
  { id: "c1", code: "C1", nameEn: "Do the first thing", nameMs: null, groupLabel: "A group", sortOrder: 1 },
  { id: "c2", code: "C2", nameEn: "Do the second thing", nameMs: null, groupLabel: "A group", sortOrder: 2 },
];

async function build(which: string, React: typeof import("react")) {
  const offices = [
    role("ONE", "First role", "Level one"),
    role("TWO", "Second role", "Level two"),
  ];

  if (which === "delegation") {
    const { EditDelegation } = await import("../src/app/configuration/users/editors");
    return React.createElement(EditDelegation, {
      delegation: {
        id: "d1",
        fromPersonId: "x1",
        toPersonId: "x2",
        roleCode: "ONE",
        capabilityCodes: ["C1"],
        valueCeiling: null,
        reason: "A reason",
        reasonMs: "Satu sebab",
        noSubDelegation: true,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: new Date("2026-02-01"),
      },
      people: [person("x1", "Sample Person"), person("x2", "Another Person")],
      offices,
      capabilities: CAPABILITIES,
      status: "Ended",
    });
  }

  if (which !== "person") throw new Error(`No drawer named "${which}" is wired up here yet.`);

  const { EditPerson } = await import("../src/app/configuration/users/editors");

  return React.createElement(EditPerson, {
    person: {
      id: "x1",
      staffNo: "S1",
      name: "Sample Person",
      email: "sample@example.invalid",
      jobTitle: "A job title",
      jobTitleMs: "Satu jawatan",
      department: "A department",
      telephone: "00-000 0000",
      portalRoleCode: "ONE",
      authorityLevel: "Level one",
      isAvailable: true,
      isActive: true,
    },
    offices,
    authorityLevels: ["Level one", "Level two"],
    capabilities: CAPABILITIES,
    delegations: [
      {
        id: "d1",
        fromPersonId: "x1",
        toPersonId: "x2",
        roleCode: "ONE",
        capabilityCodes: [],
        valueCeiling: null,
        reason: "",
        reasonMs: "",
        noSubDelegation: false,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: new Date("2026-02-01"),
      },
    ],
    nameOf: (id: string) => (id === "x1" ? "Sample Person" : "Another Person"),
  });
}

function person(id: string, name: string) {
  return {
    id,
    staffNo: null,
    name,
    email: `${id}@example.invalid`,
    jobTitle: null,
    jobTitleMs: null,
    department: null,
    telephone: null,
    portalRoleCode: null,
    authorityLevel: null,
    isAvailable: true,
    isActive: true,
  };
}

function role(code: string, nameEn: string, authorityLevel: string) {
  return {
    id: `office-${code}`,
    code,
    nameEn,
    nameMs: nameEn,
    isCommittee: false,
    workspace: "Internal",
    authorityLevel,
    escalatesToCode: null,
    selfApprovalEscalatesToCode: null,
    sortOrder: 1,
  };
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
