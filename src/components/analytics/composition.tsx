import { useState } from "react";
import { Card } from "@4rged-ai/platform";
import { composition } from "@/lib/analytics";

const OPACITY = [1, 0.72, 0.5, 0.32, 0.2];
const pct = (n: number) => `${n.toFixed(1)}%`;
const units = (n: number) => n.toLocaleString("en-IN");
const CATEGORY_COLORS: Record<string, string> = {
  imfl: "#f97316",
  beer: "#d5a546",
  wine: "#879fca",
  rtd: "#5caea5",
};
const categoryColor = (key: string) => CATEGORY_COLORS[key] ?? "#8d9aaf";

export function InventoryComposition({
  title,
  entries,
}: {
  title: string;
  entries: { key: string; label: string; units: number }[];
}) {
  const { total, items } = composition(entries);
  const [active, setActive] = useState<string | null>(null);
  const op = (rank: number) => OPACITY[Math.min(rank - 1, OPACITY.length - 1)];
  const cur = items.find((i) => i.key === active);
  const summary =
    total === 0
      ? "No units on hand in the current filters."
      : `${units(total)} units across ${items.filter((i) => i.units > 0).length} categories. ` +
        items
          .map((i) => `${i.label}: ${units(i.units)} units, ${pct(i.share)}`)
          .join("; ") +
        ".";
  const bind = (k: string) => ({
    onMouseEnter: () => setActive(k),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(k),
    onBlur: () => setActive(null),
  });

  return (
    <Card
      variant="outlined"
      className="rounded-[10px] border-border bg-card p-5"
    >
      <section aria-label={title}>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="tasmac-section-title">{title}</h2>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {cur ? (
              <>
                <span className="font-semibold text-foreground">
                  {cur.label}
                </span>{" "}
                · <span className="tabular-nums">{units(cur.units)} units</span>{" "}
                · <span className="tabular-nums">{pct(cur.share)}</span>
              </>
            ) : (
              <>
                Total{" "}
                <span className="tabular-nums font-semibold text-foreground">
                  {units(total)}
                </span>{" "}
                units
              </>
            )}
          </p>
        </div>
        <p className="sr-only">{summary}</p>
        {total === 0 ? (
          <>
            <div className="h-2.5 rounded-[4px] bg-muted" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              No units on hand match the current filters; shares are not shown.
            </p>
          </>
        ) : (
          <>
            <div
              className="flex h-2.5 gap-[2px] overflow-hidden rounded-[4px] bg-card"
              role="list"
              aria-label="Category share of units"
            >
              {items
                .filter((i) => i.units > 0)
                .map((i) => (
                  <div
                    key={i.key}
                    role="listitem"
                    data-active={active === i.key ? "true" : undefined}
                    tabIndex={0}
                    aria-label={`${i.label}: ${units(i.units)} units, ${pct(i.share)}`}
                    title={`${i.label} · ${units(i.units)} units · ${pct(i.share)}`}
                    {...bind(i.key)}
                    className="h-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card"
                    style={{
                      width: `${i.share}%`,
                      background: categoryColor(i.key),
                      opacity: active && active !== i.key ? 0.12 : op(i.rank),
                    }}
                  />
                ))}
            </div>
            <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
              {items.map((i) => (
                <li key={i.key}>
                  <div
                    tabIndex={0}
                    data-active={active === i.key ? "true" : undefined}
                    aria-label={`Rank ${i.rank}, ${i.label}: ${units(i.units)} units, ${pct(i.share)}`}
                    {...bind(i.key)}
                    className={`grid grid-cols-[20px_1fr_auto_56px] items-center gap-x-3 rounded-[8px] px-2 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === i.key ? "bg-muted" : ""}`}
                  >
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {i.rank}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-foreground">
                      <span
                        aria-hidden
                        className="size-2 rounded-[2px]"
                        style={{
                          background: categoryColor(i.key),
                          opacity: i.units ? op(i.rank) : 0.12,
                        }}
                      />
                      {i.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {units(i.units)}
                    </span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {pct(i.share)}
                    </span>
                    <div
                      className="col-start-2 col-end-5 mt-1.5 h-[3px] rounded-full bg-muted"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${i.relative * 100}%`,
                          background: categoryColor(i.key),
                          opacity: op(i.rank),
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </Card>
  );
}
