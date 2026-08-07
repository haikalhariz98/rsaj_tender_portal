import Link from "next/link";

import { AlertTriangle, ChevronRight } from "@/components/icons";
import { listCommittees } from "@/lib/committee/repo";
import { formatBand } from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  APPROVES: "Approves",
  RECOMMENDS: "Recommends",
  CONSENTS: "Consents",
  DECIDES: "Decides",
};

const ACTION_CHIP: Record<string, string> = {
  APPROVES: "chip--ok",
  RECOMMENDS: "chip--info",
  CONSENTS: "chip--warn",
  DECIDES: "chip--brand",
};

export default async function CommitteesPage() {
  const committees = await listCommittees();

  const quorumStated = committees.filter((c) => c.quorum != null).length;
  const compositionUnknown = committees.filter((c) => c.compositionProvenance == null).length;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Committees</h1>
              <span className="badge badge--outline">{committees.length}</span>
            </div>
            <p className="pagehead__sub">
              The bodies that must sit before a procurement decision can be made. Where a
              membership or a quorum has not been set, it shows as unset rather than as a guess.
            </p>
          </div>
        </div>
      </div>

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Bodies configured</span>
          </div>
          <div className="stat__value">{committees.length}</div>
          <div className="stat__foot">
            <span className="stat__hint">
              {committees.filter((c) => c.isExternal).length} external
            </span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Quorum set</span>
            <span className="stat__ico stat__ico--warn">
              <AlertTriangle size={15} />
            </span>
          </div>
          <div className="stat__value">
            {quorumStated}
            <span className="dim" style={{ fontSize: 18, fontWeight: 500 }}>
              {" "}
              / {committees.length}
            </span>
          </div>
          <div className="stat__foot">
            <span className="stat__hint">
              Only the Tender Board has one. The rest cannot be certified quorate.
            </span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Membership not set</span>
          </div>
          <div className="stat__value">{compositionUnknown}</div>
          <div className="stat__foot">
            <span className="stat__hint">No members defined in policy or in practice.</span>
          </div>
        </div>
      </div>

      <div className="dl">
        <div className="tablewrap">
          <table className="table">
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Committee</th>
                <th>Acts by</th>
                <th>Value scope</th>
                <th>Quorum</th>
                <th>Composition</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {committees.map((c) => (
                <tr key={c.code}>
                  <td>
                    <div className="cellstack">
                      <span className="cellstack__t">
                        {c.nameEn}
                        {c.isExternal && (
                          <span className="badge badge--outline" style={{ marginLeft: 8 }}>
                            external
                          </span>
                        )}
                      </span>
                      <span className="cellstack__s">{c.nameMs ?? c.code}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${ACTION_CHIP[c.action] ?? ""}`}>
                      {ACTION_LABEL[c.action] ?? c.action}
                    </span>
                  </td>
                  <td className="sm dim">{formatBand(c.valueScopeMin, c.valueScopeMax)}</td>
                  <td>
                    {c.quorum != null ? (
                      <span className="badge badge--ok">{c.quorum} members</span>
                    ) : (
                      <span className="badge badge--warn">Not stated</span>
                    )}
                  </td>
                  <td>
                    <ProvenanceBadge value={c.compositionProvenance} seats={c.seatCount} />
                  </td>
                  <td className="right">
                    <Link
                      href={`/configuration/committees/${c.code}`}
                      className="btn btn--sm btn--ghost"
                    >
                      Open
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="dl__foot">
          <span>
            {committees.length} bodies · {committees.reduce((n, c) => n + c.meetingCount, 0)}{" "}
            recorded sittings
          </span>
        </div>
      </div>
    </>
  );
}

function ProvenanceBadge({ value, seats }: { value: string | null; seats: number }) {
  if (value === "STATED") {
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="badge badge--ok">By policy</span>
        <span className="xs dim">{seats} seats</span>
      </span>
    );
  }
  if (value === "OBSERVED") {
    return (
      <span className="row" style={{ gap: 6 }}>
        <span className="badge badge--info">From practice</span>
        <span className="xs dim">{seats} seats</span>
      </span>
    );
  }
  return <span className="badge badge--warn">Not set</span>;
}
