import { describe, expect, it } from "vitest";
import {
  csvFilename,
  filterMovements,
  filterTransfers,
  paginate,
  sinceFor,
  summarizeInventory,
  summarizeMovements,
  summarizeTransfers,
  toCsv,
  type InvRow,
  type MoveRow,
  type XferRow,
} from "./analytics";

const inv = (o: Partial<InvRow>): InvRow => ({
  sku: "S",
  product_name: "P",
  category: "beer",
  shop_id: "a",
  shop_name: "A",
  shop_number: "1",
  city_id: "c",
  quantity_on_hand: 0,
  safety_minimum: 0,
  health: "healthy",
  mrp: 0,
  ...o,
});
const mov = (o: Partial<MoveRow>): MoveRow => ({
  id: "m",
  created_at: "2026-10-18T05:00:00Z",
  movement_type: "receive",
  quantity: 1,
  delta: 1,
  shop_id: "a",
  city_id: "c",
  sku: "S",
  product_name: "P",
  shop_name: "A",
  reference: "R",
  actor_name: "X",
  txn_no: 1,
  ...o,
});
const xf = (o: Partial<XferRow>): XferRow => ({
  status: "requested",
  quantity: 1,
  requested_at: "2026-10-18T05:00:00Z",
  source_shop_id: "a",
  dest_shop_id: "b",
  source_city_id: "c",
  dest_city_id: "d",
  sku: "S",
  product_name: "P",
  source_label: "A",
  dest_label: "B",
  reason: "r",
  requester_name: "X",
  txn_no: 1,
  ...o,
});

describe("timeframes", () => {
  const now = new Date(2026, 9, 18, 15, 30);
  it("all time has no lower bound", () =>
    expect(sinceFor("all", now)).toBeNull());
  it("today starts at local midnight", () =>
    expect(sinceFor("today", now)).toEqual(new Date(2026, 9, 18)));
  it("last 7 days is 7×24h back", () =>
    expect(now.getTime() - sinceFor("7d", now)!.getTime()).toBe(7 * 86400000));
});

describe("inventory summary", () => {
  it("counts units, MRP value and threshold alerts", () => {
    const s = summarizeInventory([
      inv({ quantity_on_hand: 10, mrp: 150.5, health: "low" }),
      inv({
        quantity_on_hand: 2,
        mrp: 100,
        health: "critical",
        category: "wine",
      }),
    ]);
    expect(s).toMatchObject({
      units: 12,
      mrpValue: 1705,
      low: 1,
      critical: 1,
      configured: true,
    });
    expect(s.category.wine).toBe(2);
  });
  it("flags missing thresholds", () =>
    expect(
      summarizeInventory([inv({ health: "not_configured" })]).configured,
    ).toBe(false));
  it("is null-configured when empty", () =>
    expect(summarizeInventory([]).configured).toBeNull());
});

describe("movement summary", () => {
  it("separates inward receipts from issues and trends by date", () => {
    const s = summarizeMovements([
      mov({ quantity: 5, delta: 5 }),
      mov({ movement_type: "issue", quantity: 3, delta: -3 }),
      mov({ movement_type: "adjust_writeoff", quantity: 1, delta: -1 }),
    ]);
    expect(s).toMatchObject({ count: 3, inward: 5, issued: 3, net: 1 });
    expect(s.trend).toHaveLength(1);
    expect(s.trend[0]).toMatchObject({ inward: 5, issued: 3 });
  });
  it("filters by time, type and shop", () => {
    const rows = [
      mov({ created_at: "2020-01-01T00:00:00Z" }),
      mov({ movement_type: "issue" }),
      mov({ shop_id: "z" }),
    ];
    expect(
      filterMovements(rows, { since: new Date("2026-01-01") }),
    ).toHaveLength(2);
    expect(filterMovements(rows, { type: "issue" })).toHaveLength(1);
    expect(filterMovements(rows, { shop: "z" })).toHaveLength(1);
  });
});

describe("transfer summary", () => {
  it("counts dispatched as in transit", () => {
    expect(
      summarizeTransfers([xf({ status: "dispatched", quantity: 4 }), xf({})]),
    ).toMatchObject({
      count: 2,
      units: 5,
      inTransit: 1,
    });
  });
  it("shop/city filters match either end", () => {
    const rows = [
      xf({}),
      xf({
        source_shop_id: "q",
        dest_shop_id: "w",
        source_city_id: "e",
        dest_city_id: "r",
      }),
    ];
    expect(filterTransfers(rows, { shop: "b" })).toHaveLength(1);
    expect(filterTransfers(rows, { city: "r" })).toHaveLength(1);
  });
});

describe("pagination", () => {
  it("uses 8 rows and clamps the page", () => {
    const p = paginate(
      Array.from({ length: 17 }, (_, i) => i),
      9,
    );
    expect(p).toMatchObject({ page: 3, pages: 3 });
    expect(p.rows).toEqual([16]);
    expect(paginate(Array.from({ length: 17 }), 1).rows).toHaveLength(8);
  });
});

describe("csv", () => {
  it("starts with BOM, keeps header order and escapes quotes/commas/newlines", () => {
    const csv = toCsv(
      ["A", "B"],
      [
        ['He said "hi"', "x,y"],
        ["line\nbreak", null],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(
      'A,B\r\n"He said ""hi""","x,y"\r\n"line\nbreak",\r\n',
    );
  });
  it("names files tasmac-[type]-report-[YYYY-MM-DD].csv", () => {
    expect(csvFilename("movement", new Date(2026, 9, 8))).toBe(
      "tasmac-movement-report-2026-10-08.csv",
    );
  });
});

import { composition as comp } from "./analytics";
describe("composition", () => {
  it("ranks by units and computes shares from totals", () => {
    const r = comp([
      { key: "a", label: "A", units: 25 },
      { key: "b", label: "B", units: 75 },
      { key: "c", label: "C", units: 0 },
    ]);
    expect(r.total).toBe(100);
    expect(r.items.map((i) => i.key)).toEqual(["b", "a", "c"]);
    expect(r.items[0]!.share).toBe(75);
    expect(r.items[1]!.relative).toBeCloseTo(1 / 3);
  });
  it("returns zero shares when there are no units", () => {
    const r = comp([{ key: "a", label: "A", units: 0 }]);
    expect(r.total).toBe(0);
    expect(r.items[0]!.share).toBe(0);
  });
});

import { unitsByShop } from "./analytics";
describe("unitsByShop", () => {
  const row = (shop_id: string, q: number) => ({
    shop_id,
    shop_number: shop_id.toUpperCase(),
    shop_name: `Shop ${shop_id}`,
    quantity_on_hand: q,
  });
  it("sums units per shop and ranks by units", () => {
    const r = unitsByShop([row("a", 10), row("b", 40), row("a", 20)]);
    expect(r.map((s) => [s.shopId, s.units, s.lines])).toEqual([
      ["b", 40, 1],
      ["a", 30, 2],
    ]);
    expect(r[1]!.relative).toBe(0.75);
    expect(r[0]!.label).toBe("B · Shop b");
  });
  it("only includes shops present in the scoped rows", () => {
    expect(unitsByShop([row("c", 5)]).map((s) => s.shopId)).toEqual(["c"]);
  });
  it("handles empty and zero data", () => {
    expect(unitsByShop([])).toEqual([]);
    expect(unitsByShop([row("a", 0)])[0]!.relative).toBe(0);
  });
});
