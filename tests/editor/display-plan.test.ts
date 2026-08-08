import { describe, expect, it } from "vitest";

import { parseAtxHeadings } from "../../src/core/heading-parser";
import type { NumberingOptions } from "../../src/core/types";
import { createDisplayPlan, type DisplayPlanOptions } from "../../src/editor/display-plan";

const numbering: NumberingOptions = {
  scheme: "hierarchical",
  customTemplates: [],
  customBaseLevel: 1,
  maxLevel: 6,
  missingLevelStrategy: "fill-one",
  starts: {},
};

function options(overrides: Partial<DisplayPlanOptions>): DisplayPlanOptions {
  return {
    mode: "show",
    numbering,
    cleanupThreshold: "high",
    revealOnActiveLine: true,
    selections: [],
    composing: false,
    ...overrides,
  };
}

describe("display plan", () => {
  it("adds virtual numbers only to unnumbered, unambiguous headings", () => {
    const source = "# Plain\n## 1.1 Stored\n## 3.14 Pi\n## Next";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({}));
    expect(plan.map((item) => ({ line: item.line, label: item.label }))).toEqual([
      { line: 0, label: "1" },
      { line: 3, label: "1.3" },
    ]);
  });

  it("conceals high-confidence prefixes", () => {
    const source = "# 1.1 Stored\n# 1. Medium\n# 3.14 Pi";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({ mode: "conceal" }));
    expect(plan).toHaveLength(1);
    expect(source.slice(plan[0]?.from, plan[0]?.to)).toBe("1.1 ");
  });

  it("conceals expected unmarked single-level numbers", () => {
    const source = "# 1 First\n# 2 Second";
    const plan = createDisplayPlan(parseAtxHeadings(source), options({ mode: "conceal" }));
    expect(plan.map((item) => source.slice(item.from, item.to))).toEqual(["1 ", "2 "]);
  });

  it("reveals the active line and all decorations during composition", () => {
    const source = "# 1.1 Stored";
    const heading = parseAtxHeadings(source)[0];
    expect(createDisplayPlan([heading!], options({
      mode: "conceal",
      selections: [{ from: heading!.lineFrom, to: heading!.lineFrom }],
    }))).toEqual([]);
    expect(createDisplayPlan([heading!], options({ mode: "conceal", composing: true }))).toEqual([]);
  });
});
