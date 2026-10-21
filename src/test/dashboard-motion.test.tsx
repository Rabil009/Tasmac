import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const firstProps: { Pie: unknown[]; RadialBar: unknown[] } = {
  Pie: [],
  RadialBar: [],
};
vi.mock("recharts", async (orig) => {
  const real = await orig<typeof import("recharts")>();
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ...real,
    ResponsiveContainer: Pass,
    PieChart: Pass,
    RadialBarChart: Pass,
    PolarAngleAxis: () => null,
    Cell: () => null,
    Pie: (p: { isAnimationActive?: boolean }) => {
      firstProps.Pie.push(p.isAnimationActive);
      return null;
    },
    RadialBar: (p: { isAnimationActive?: boolean }) => {
      firstProps.RadialBar.push(p.isAnimationActive);
      return null;
    },
  };
});

const { InventoryDistribution, StockFlowBalance } =
  await import("@/components/dashboard/dashboard-analytics");

const setReduce = (matches: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: matches && q.includes("reduce"),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};
const entries = [{ key: "imfl", label: "IMFL", units: 10 }];

describe("dashboard chart motion", () => {
  afterEach(() => {
    firstProps.Pie = [];
    firstProps.RadialBar = [];
  });
  it("disables animation from the very first render under reduced motion", () => {
    setReduce(true);
    render(<InventoryDistribution entries={entries} />);
    render(<StockFlowBalance inward={5} issued={3} period="All Time" />);
    expect(firstProps.Pie[0]).toBe(false);
    expect(firstProps.RadialBar[0]).toBe(false);
    expect(firstProps.Pie.every((v) => v === false)).toBe(true);
    expect(firstProps.RadialBar.every((v) => v === false)).toBe(true);
  });
  it("animates when reduced motion is not requested", () => {
    setReduce(false);
    render(<InventoryDistribution entries={entries} />);
    render(<StockFlowBalance inward={5} issued={3} period="All Time" />);
    expect(firstProps.Pie[0]).toBe(true);
    expect(firstProps.RadialBar[0]).toBe(true);
  });
});
