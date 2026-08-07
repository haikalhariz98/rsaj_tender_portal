/**
 * A route as one line: who proposes, who recommends, who approves, in order.
 *
 * Each step carries its authority act as a small badge, so a mandatory
 * recommendation is distinguishable from an ordinary one at a glance rather than
 * by reading the whole row.
 */
export interface ChainStep {
  role: string;
  act: string;
}

export function RuleChain({ steps }: { steps: ChainStep[] }) {
  if (steps.length === 0) return <span className="dim">—</span>;

  return (
    <div className="cfg-rulechain">
      {steps.map((step, i) => (
        <span className="cfg-rulechain__s" key={`${step.role}-${step.act}-${i}`}>
          <span className={`cfg-rulechain__a chain__act chain__act--${step.act}`}>{step.act}</span>
          {step.role}
        </span>
      ))}
    </div>
  );
}
