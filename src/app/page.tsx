import { DalSimulator } from "@/components/dal-simulator";
import { activeVersionLabel, loadMatrix, NoActiveDalVersionError } from "@/lib/dal/load";

// The matrix lives in Postgres and changes by Board resolution, so the page reads it
// per request rather than baking it into a build.
export const dynamic = "force-dynamic";

const ORG = "RSAJ";

export default async function Home() {
  let matrix;
  try {
    matrix = await loadMatrix(ORG);
  } catch (error) {
    if (!(error instanceof NoActiveDalVersionError)) throw error;
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Perolehan</h1>
        <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Run <code className="font-mono">npm run setup</code> to load the DAL configuration.
        </p>
      </main>
    );
  }

  const label = await activeVersionLabel(ORG);
  const domains = [...new Set(matrix.rules.map((r) => r.domain))].sort();
  const methods = [...new Set(matrix.rules.map((r) => r.method).filter((m): m is string => !!m))].sort();
  const roles = Object.values(matrix.roles)
    .map((r) => ({ code: r.code, name: r.nameEn }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const gaps = matrix.rules.filter((r) => r.isGap).length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Approval routing</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {matrix.rules.length} authority rows across {domains.length} matters, in force under{" "}
          <span className="text-black/80 dark:text-white/80">{label}</span>. Every route below cites
          the clause it came from.
        </p>
        <p className="text-xs text-black/50 dark:text-white/50">
          {gaps} rows are marked as gaps — matters the manual does not actually cover. They resolve,
          but they say so.
        </p>
      </header>

      <DalSimulator domains={domains} methods={methods} roles={roles} />
    </main>
  );
}
