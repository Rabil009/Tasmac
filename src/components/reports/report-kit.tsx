import { useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@4rged-ai/platform";

const fmt = (v: number) => v.toLocaleString("en-IN");
const pct = (n: number) => `${n.toFixed(1)}%`;

export interface SummaryMetric {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "critical" | "low" | undefined;
  icon?: ReactNode;
}

/** Divided horizontal strip of real report metrics (no cards). */
export function ReportSummary({
  label,
  items,
}: {
  label: string;
  items: SummaryMetric[];
}) {
  return (
    <dl className="tasmac-summary-strip" aria-label={label}>
      {items.map((m) => (
        <div key={m.label} className="tasmac-summary-item">
          <dt className="tasmac-metric-label flex items-center gap-1.5 text-muted-foreground">
            {m.icon ? (
              <span className="tasmac-summary-icon inline-flex" aria-hidden>
                {m.icon}
              </span>
            ) : null}
            {m.label}
          </dt>
          <dd className="tasmac-metric-value" data-tone={m.tone}>
            {m.value}
          </dd>
          {m.hint ? (
            <dd className="text-xs text-muted-foreground">{m.hint}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Compact ranked comparison of exact counts (bars share one scale: the largest value).
 * Rows are focusable so keyboard users get the same highlight as pointer users.
 */
export function ComparisonPanel({
  title,
  unit,
  slices,
  emptyText,
}: {
  title: string;
  unit: string;
  slices: Slice[];
  emptyText: string;
}) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) return setDrawn(true);
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const max = Math.max(0, ...slices.map((s) => s.value));
  const ranked = [...slices].sort((a, b) => b.value - a.value);
  return (
    <section
      className="tasmac-op-surface tasmac-report-panel"
      aria-label={title}
    >
      <header className="tasmac-report-panel-head">
        <h2 className="tasmac-report-panel-title">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmt(total)} {unit}
        </span>
      </header>
      {total === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul
          className="tasmac-report-bars"
          aria-label={`${title}, exact values`}
        >
          {ranked.map((s) => {
            const share = (s.value / total) * 100;
            return (
              <li
                key={s.key}
                tabIndex={0}
                className="tasmac-report-bar-row"
                aria-label={`${s.label}: ${fmt(s.value)} ${unit}, ${pct(share)}`}
              >
                <span
                  className="tasmac-report-swatch"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="truncate text-foreground" title={s.label}>
                  {s.label}
                </span>
                <span className="tasmac-report-track" aria-hidden>
                  <span
                    style={{
                      width: drawn && max ? `${(s.value / max) * 100}%` : 0,
                      background: s.color,
                    }}
                  />
                </span>
                <span className="text-right font-medium text-foreground tabular-nums">
                  {fmt(s.value)}
                </span>
                <span className="text-right text-muted-foreground tabular-nums">
                  {pct(share)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Table surface: header with title/count/action, local scroller, pager footer. */
export function ReportTable({
  title,
  count,
  action,
  head,
  numeric = [],
  centered = [],
  empty,
  children,
  footer,
  tableClassName = "",
}: {
  tableClassName?: string;
  title: string;
  count: number;
  action?: ReactNode;
  head: string[];
  numeric?: string[];
  centered?: string[];
  empty: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="tasmac-table-surface" aria-label={title}>
      <header className="tasmac-report-table-head">
        <div>
          <h2 className="tasmac-section-title">{title}</h2>
        </div>
        {action}
      </header>
      {count === 0 ? (
        <div className="border-t border-border">{empty}</div>
      ) : (
        <>
          <div className="overflow-x-auto border-t border-border">
            <table
              className={`tasmac-inv-table tasmac-report-table ${tableClassName}`}
            >
              <thead className="text-left">
                <tr>
                  {head.map((h) => (
                    <th
                      key={h}
                      className={
                        centered.includes(h)
                          ? "text-center"
                          : numeric.includes(h)
                            ? "text-right"
                            : undefined
                      }
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>
          {footer}
        </>
      )}
    </section>
  );
}

export function ReportPager({
  page,
  pages,
  total,
  size,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (p: number) => void;
}) {
  const from = (page - 1) * size + 1;
  return (
    <nav aria-label="Pagination" className="tasmac-table-footer">
      <span className="tabular-nums">
        {fmt(from)}–{fmt(Math.min(from + size - 1, total))} of {fmt(total)}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="outline"
          className="tasmac-btn tasmac-btn-pager"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          className="tasmac-btn tasmac-btn-pager"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
