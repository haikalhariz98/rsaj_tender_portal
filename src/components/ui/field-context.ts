import { createContext, useContext } from "react";

/// What a Field tells the control inside it, so the control is named and described by
/// the Field's own label, hint and error even when the caller forgot to wire them.
export type FieldContextValue = {
  /// Id of the Field's notched label.
  labelId?: string;
  /// Space-separated ids of the hint and error lines.
  describedBy?: string;
  invalid?: boolean;
};

const FieldContext = createContext<FieldContextValue>({});

export const FieldProvider = FieldContext.Provider;
export const useFieldContext = () => useContext(FieldContext);

/// The accessibility attributes a control takes from its Field unless the caller set its own.
export function fieldAria(
  ctx: FieldContextValue,
  own: { "aria-labelledby"?: string; "aria-label"?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" },
) {
  return {
    "aria-labelledby": own["aria-labelledby"] ?? (own["aria-label"] ? undefined : ctx.labelId),
    "aria-describedby": own["aria-describedby"] ?? ctx.describedBy,
    "aria-invalid": own["aria-invalid"] ?? (ctx.invalid ? true : undefined),
  };
}
