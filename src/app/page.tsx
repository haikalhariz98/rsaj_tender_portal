import { DalSimulator } from "@/components/dal-simulator";
import { loadMatrix, NoActiveDalVersionError } from "@/lib/dal/load";
import { matterLabel, methodLabel } from "@/lib/labels";
import { ORGANISATION_CODE } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function Home() {
  let matrix;
  try {
    matrix = await loadMatrix(ORGANISATION_CODE);
  } catch (error) {
    if (!(error instanceof NoActiveDalVersionError)) throw error;
    return (
      <div className="empty">
        <div className="empty__t">No authority limits loaded</div>
        <p className="empty__d">{error.message}</p>
        <p className="empty__d">
          Run <code className="mono">npm run setup</code> to load the DAL configuration.
        </p>
      </div>
    );
  }

  const domains = [...new Set(matrix.rules.map((r) => r.domain))].sort((a, b) =>
    matterLabel(a).localeCompare(matterLabel(b)),
  );
  const methods = [
    ...new Set(matrix.rules.map((r) => r.method).filter((m): m is string => !!m)),
  ].sort();
  const roles = Object.values(matrix.roles)
    .map((r) => ({ code: r.code, name: r.nameEn }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Approval routing</h1>
            </div>
            <p className="pagehead__sub">
              Who must propose, recommend and approve, for any matter and any value.
            </p>
          </div>
        </div>
      </div>

      <DalSimulator
        domains={domains.map((code) => ({ code, label: matterLabel(code) }))}
        methods={methods.map((code) => ({ code, label: methodLabel(code) }))}
        roles={roles}
      />
    </>
  );
}
