/** Static accessibility contract checks over every application source file. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const files = [...walk("src/routes"), ...walk("src/components")].filter(
  (f) => !f.includes("/components/ui/"),
);
const src = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));

describe("static accessibility contract", () => {
  it("every literal htmlFor points at an id in the same file", () => {
    const bad: string[] = [];
    for (const [f, s] of Object.entries(src)) {
      for (const m of s.matchAll(/htmlFor="([^"]+)"/g))
        if (!s.includes(`id="${m[1]}"`)) bad.push(`${f}: ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });
  it("icon-only buttons carry an accessible name", () => {
    const bad: string[] = [];
    for (const [f, s] of Object.entries(src)) {
      for (const m of s.matchAll(/<Button[^>]*size="icon"[^>]*>/g))
        if (!/aria-label=/.test(m[0])) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
  it("dialogs and sheets render a title and a description", () => {
    const bad: string[] = [];
    for (const [f, s] of Object.entries(src)) {
      for (const kind of ["Sheet", "Dialog", "AlertDialog"]) {
        const opens = (s.match(new RegExp(`<${kind}Content\\b`, "g")) ?? [])
          .length;
        if (!opens) continue;
        const titles = (s.match(new RegExp(`<${kind}Title\\b`, "g")) ?? [])
          .length;
        const descs = (s.match(new RegExp(`<${kind}Description\\b`, "g")) ?? [])
          .length;
        if (titles < opens || descs < opens)
          bad.push(`${f}: ${kind} ${opens}/${titles}/${descs}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("data tables declare header cells", () => {
    const bad = Object.entries(src)
      .filter(([, s]) => /<table\b/.test(s) && !/<th\b/.test(s))
      .map(([f]) => f);
    expect(bad).toEqual([]);
  });
  it("images have alt text and no positive tabIndex is used", () => {
    const bad: string[] = [];
    for (const [f, s] of Object.entries(src)) {
      for (const m of s.matchAll(/<img\b[^>]*>/g))
        if (!/alt=/.test(m[0])) bad.push(`${f}: img`);
      if (/tabIndex=\{[1-9]/.test(s)) bad.push(`${f}: tabIndex`);
    }
    expect(bad).toEqual([]);
  });
  it("UI never renders raw error.message from queries or mutations", () => {
    const bad = Object.entries(src)
      .filter(([, s]) =>
        /description=\{[\w.]*error\.message\}|toast\.error\(e\.message\)|form: e\.message/.test(
          s,
        ),
      )
      .map(([f]) => f);
    expect(bad).toEqual([]);
  });
});
