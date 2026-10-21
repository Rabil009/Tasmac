/** Radix Select forbids empty item values; "all" filters map this sentinel back to "". */
export const ALL = "__all__";

export const fmtTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-IN") : "—";
