import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TIMEFRAMES, TIMEFRAME_LABELS, type Timeframe } from "@/lib/analytics";
import { Button, Card } from "@4rged-ai/platform";

export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      className="flex min-h-[116px] flex-col gap-2 rounded-[10px] border-border bg-card p-5"
    >
      <p className="tasmac-metric-label text-muted-foreground">{label}</p>
      <p className="tasmac-metric-value text-foreground">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      variant="outlined"
      className={`rounded-[10px] border-border bg-card p-5 ${className}`}
    >
      <section aria-label={title}>
        <h2 className="tasmac-section-title mb-4">{title}</h2>
        {children}
      </section>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex h-full min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function TimeframePicker({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (t: Timeframe) => void;
}) {
  return (
    <div role="group" aria-label="Timeframe" className="tasmac-segmented">
      {TIMEFRAMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={value === t}
          onClick={() => onChange(t)}
          className="tasmac-segment"
        >
          {value === t ? (
            <motion.span
              layoutId="dashboard-timeframe-indicator"
              className="tasmac-segment-indicator"
              transition={{ type: "spring", stiffness: 520, damping: 38 }}
            />
          ) : null}
          <span className="tasmac-segment-label">{TIMEFRAME_LABELS[t]}</span>
        </button>
      ))}
    </div>
  );
}

const axis = { stroke: "var(--muted-foreground)", fontSize: 11 };
const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    fontSize: 12,
  },
};

export function Bars({
  data,
  x,
  series,
  height = 240,
}: {
  data: Record<string, string | number>[];
  x: string;
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
        >
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey={x} tick={axis} stroke="var(--border)" />
          <YAxis tick={axis} stroke="var(--border)" allowDecimals={false} />
          <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
          {series.length > 1 ? (
            <Legend wrapperStyle={{ fontSize: 12 }} />
          ) : null}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {total} row{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export const fmt = (v: number) => v.toLocaleString("en-IN");
export const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
