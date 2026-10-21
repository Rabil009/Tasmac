export const fmtChanged = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export const matches = (
  q: string,
  ...fields: (string | null | undefined)[]
) => {
  const t = q.trim().toLowerCase();
  return !t || fields.some((f) => (f ?? "").toLowerCase().includes(t));
};
